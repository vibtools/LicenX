"""
VCON Python Client SDK - Server Transport & Protocol Layer
Handles HTTP requests (with requests or native urllib fallback), SSL verification,
Ed25519 cryptographic validation, heartbeat pings, and remote unbind / logout notifications.
"""

import time
import json
import base64
import socket
import hashlib
from typing import Dict, Any, Tuple, Optional
from .config import SDKConfig

# Graceful HTTP Transport import (requests preferred, urllib built-in fallback)
try:
    import requests  # type: ignore
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error
    import ssl

# Graceful Cryptography import (strict Ed25519 verification when available)
try:
    from cryptography.hazmat.primitives.serialization import load_pem_public_key  # type: ignore
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False


class ServerCommunicator:
    def __init__(self, config: SDKConfig):
        self.config = config

    def _build_url(self, endpoint: str) -> str:
        """Constructs clean URL handling trailing slashes and redundant api prefixes"""
        base = (self.config.server_url or "http://localhost:3000").rstrip("/")
        if base.endswith("/api"):
            base = base[:-4]
        endpoint = endpoint.lstrip("/")
        return f"{base}/{endpoint}"

    @staticmethod
    def canonical_json(data: Dict[str, Any]) -> str:
        """Produces canonical sorted JSON string matching server-side signing format"""
        return json.dumps(data, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _verify_rsa_standard_library(data_str: str, signature_b64: str, pem_str: str) -> bool:
        """
        Pure Python standard-library RSA PKCS#1 v1.5 SHA-256 verification using built-in pow(sig, e, n).
        Allows 100% cryptographic verification without third-party pip dependencies.
        """
        try:
            sig_bytes = base64.b64decode(signature_b64)
            raw_b64 = "".join([l for l in pem_str.strip().splitlines() if not l.startswith("-----")])
            der = base64.b64decode(raw_b64)
            idx = der.find(b"\x02\x82")
            if idx == -1:
                return False
            mod_len = (der[idx + 2] << 8) | der[idx + 3]
            mod_bytes = der[idx + 4 : idx + 4 + mod_len].lstrip(b"\x00")
            n = int.from_bytes(mod_bytes, "big")
            e_idx = idx + 4 + mod_len
            e_len = der[e_idx + 1]
            e = int.from_bytes(der[e_idx + 2 : e_idx + 2 + e_len], "big")
            k = len(mod_bytes)

            sig_int = int.from_bytes(sig_bytes, "big")
            dec_int = pow(sig_int, e, n)
            dec_bytes = dec_int.to_bytes(k, "big")

            sha256_prefix = b"\x30\x31\x30\x0d\x06\x09\x60\x86\x48\x01\x65\x03\x04\x02\x01\x05\x00\x04\x20"
            expected_hash = hashlib.sha256(data_str.encode("utf-8")).digest()
            expected_suffix = sha256_prefix + expected_hash
            return dec_bytes.endswith(expected_suffix) and dec_bytes.startswith(b"\x00\x01")
        except Exception:
            return False

    def verify_signature(self, payload: Dict[str, Any], signature_b64: str) -> bool:
        """
        Cryptographically verifies the RSA (2048/4096-bit) or Ed25519 signature
        against the server's public key.
        Guarantees response authenticity and prevents MITM or fake server bypass.
        """
        if not self.config.public_key_pem or not signature_b64:
            return False

        try:
            pem_str = self.config.public_key_pem.strip()
            if "\\n" in pem_str and "\n" not in pem_str:
                pem_str = pem_str.replace("\\n", "\n")

            canonical_str = self.canonical_json(payload)
            signature_bytes = base64.b64decode(signature_b64)

            if HAS_CRYPTOGRAPHY:
                pub_key = load_pem_public_key(pem_str.encode("utf-8"))
                if hasattr(pub_key, "key_size"):
                    # RSA 2048/4096 bit key with SHA-256
                    from cryptography.hazmat.primitives.asymmetric import padding
                    from cryptography.hazmat.primitives import hashes
                    pub_key.verify(
                        signature_bytes,
                        canonical_str.encode("utf-8"),
                        padding.PKCS1v15(),
                        hashes.SHA256(),
                    )
                else:
                    # Ed25519 key
                    pub_key.verify(signature_bytes, canonical_str.encode("utf-8"))
                return True
            else:
                # Check if RSA key (contains RSA or length > 100 bytes)
                if "RSA" in pem_str or len(pem_str) > 200:
                    return self._verify_rsa_standard_library(canonical_str, signature_b64, pem_str)
                return False
        except Exception as e:
            print(f"[VCON-SDK] Cryptographic signature verification failed: {e}")
            return False

    def _http_post(self, url: str, json_data: Dict[str, Any], timeout: int) -> Tuple[int, Dict[str, Any]]:
        """
        Universal HTTP POST supporting requests and native urllib fallback.
        Returns (status_code, response_json_dict).
        """
        if HAS_REQUESTS:
            try:
                resp = requests.post(
                    url,
                    json=json_data,
                    timeout=timeout,
                    headers={
                        "User-Agent": f"VCON-Python-SDK/{self.config.app_name}",
                        "Content-Type": "application/json",
                    },
                )
                try:
                    data = resp.json()
                except Exception:
                    data = {"error": resp.text, "code": "INVALID_RESPONSE"}
                return resp.status_code, data
            except requests.exceptions.SSLError as e:
                return 495, {"error": f"SSL Handshake failed: {e}", "code": "SSL_ERROR"}
            except requests.exceptions.ConnectionError as e:
                return 503, {"error": f"Cannot connect to license server: {e}", "code": "SERVER_UNREACHABLE"}
            except requests.exceptions.Timeout:
                return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
            except Exception as e:
                return 500, {"error": str(e), "code": "REQUEST_ERROR"}

        # Native Python standard library fallback
        post_bytes = json.dumps(json_data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=post_bytes,
            headers={
                "User-Agent": f"VCON-Python-SDK/{self.config.app_name}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        ctx = ssl.create_default_context()
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                status_code = response.getcode()
                raw_body = response.read().decode("utf-8")
                try:
                    data = json.loads(raw_body)
                except Exception:
                    data = {"error": raw_body, "code": "INVALID_RESPONSE"}
                return status_code, data
        except urllib.error.HTTPError as e:
            status_code = e.code
            raw_body = e.read().decode("utf-8")
            try:
                data = json.loads(raw_body)
            except Exception:
                data = {"error": raw_body, "code": "HTTP_ERROR"}
            return status_code, data
        except urllib.error.URLError as e:
            return 503, {"error": f"Cannot connect to license server: {e.reason}", "code": "SERVER_UNREACHABLE"}
        except socket.timeout:
            return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
        except Exception as e:
            return 500, {"error": str(e), "code": "UNKNOWN_ERROR"}

    def _http_get(self, url: str, timeout: int) -> Tuple[int, Dict[str, Any]]:
        """
        Universal HTTP GET supporting requests and native urllib fallback.
        Returns (status_code, response_json_dict).
        """
        if HAS_REQUESTS:
            try:
                resp = requests.get(
                    url,
                    timeout=timeout,
                    headers={
                        "User-Agent": f"VCON-Python-SDK/{self.config.app_name}",
                    },
                )
                try:
                    data = resp.json()
                except Exception:
                    data = {"error": resp.text, "code": "INVALID_RESPONSE"}
                return resp.status_code, data
            except requests.exceptions.SSLError as e:
                return 495, {"error": f"SSL Handshake failed: {e}", "code": "SSL_ERROR"}
            except requests.exceptions.ConnectionError as e:
                return 503, {"error": f"Cannot connect to license server: {e}", "code": "SERVER_UNREACHABLE"}
            except requests.exceptions.Timeout:
                return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
            except Exception as e:
                return 500, {"error": str(e), "code": "REQUEST_ERROR"}

        # Native Python standard library fallback
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": f"VCON-Python-SDK/{self.config.app_name}",
            },
            method="GET",
        )
        ctx = ssl.create_default_context()
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                status_code = response.getcode()
                raw_body = response.read().decode("utf-8")
                try:
                    data = json.loads(raw_body)
                except Exception:
                    data = {"error": raw_body, "code": "INVALID_RESPONSE"}
                return status_code, data
        except urllib.error.HTTPError as e:
            status_code = e.code
            raw_body = e.read().decode("utf-8")
            try:
                data = json.loads(raw_body)
            except Exception:
                data = {"error": raw_body, "code": "HTTP_ERROR"}
            return status_code, data
        except urllib.error.URLError as e:
            return 503, {"error": f"Cannot connect to license server: {e.reason}", "code": "SERVER_UNREACHABLE"}
        except socket.timeout:
            return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
        except Exception as e:
            return 500, {"error": str(e), "code": "UNKNOWN_ERROR"}

    def validate_license(
        self,
        license_key: str,
        hwid: str,
        telemetry: Dict[str, Any],
        pin: Optional[str] = None,
    ) -> Tuple[bool, int, Dict[str, Any]]:
        """
        Calls /api/v1/license/validate endpoint.
        The legacy pin argument is accepted for compatibility but never sent.
        Returns (is_valid, http_status_code, response_payload)
        """
        url = self._build_url("api/v1/license/validate")
        body = {
            "license_key": license_key.strip().upper(),
            "hwid": hwid,
            "device_name": telemetry.get("device_name", "Unknown-PC"),
            "os_info": telemetry.get("os_info", "Generic-OS"),
            "app_name": self.config.app_name,
            "app_version": self.config.min_version,
            "client_time": int(time.time() * 1000),
            "telemetry": telemetry,
        }

        status_code, data = self._http_post(url, body, self.config.request_timeout_seconds)

        if status_code == 200 and data.get("valid") is True:
            # The configured public key is the trust anchor; response keys are not trusted.
            sig = data.pop("signature", None)
            data.pop("public_key", None)

            # Verify cryptographic signature
            if not sig or not self.verify_signature(data, sig):
                return False, 403, {"error": "Server cryptographic signature mismatch", "code": "SIGNATURE_FAILED"}

            return True, 200, data
        else:
            return False, status_code, data

    def ping_heartbeat(self, license_key: str, hwid: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Sends heartbeat ping to server.
        Returns (active, payload). If license was revoked or device unlinked, active will be False.
        """
        url = self._build_url("api/v1/license/ping")
        body = {
            "license_key": license_key.strip().upper(),
            "hwid": hwid,
            "app_name": self.config.app_name,
            "client_time": int(time.time() * 1000),
        }

        status_code, data = self._http_post(url, body, 10)
        if status_code == 200 and data.get("valid") is True:
            return True, data
        return False, data

    def send_logout(self, license_key: str, hwid: str) -> bool:
        """
        Notifies the server to unbind the device from this license key.
        This frees up the device slot for other machines immediately.
        """
        url = self._build_url("api/v1/license/logout")
        body = {
            "license_key": license_key.strip().upper(),
            "hwid": hwid,
            "app_name": self.config.app_name,
        }

        status_code, _ = self._http_post(url, body, 6)
        if status_code == 200:
            return True

        # Fallback to deactivate route
        try:
            alt_url = self._build_url("api/v1/license/deactivate")
            alt_code, _ = self._http_post(alt_url, body, 6)
            return alt_code == 200
        except Exception:
            return False


# Alias for backward-compatibility and clean imports
ServerClient = ServerCommunicator
