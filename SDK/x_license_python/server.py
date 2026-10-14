"""
VCON Python Client SDK - Server Transport & Protocol Layer
Handles HTTP requests (with requests or native urllib fallback), SSL verification,
Ed25519 cryptographic validation, heartbeat pings, and remote unbind / logout notifications.
"""

import time
import json
import base64
import ipaddress
import re
import socket
import secrets
import ssl
import urllib.error
import urllib.request
from typing import Dict, Any, Tuple, Optional
from urllib.parse import urlsplit
from .config import SDKConfig

# Graceful HTTP Transport import (requests preferred, urllib built-in fallback)
try:
    import requests  # type: ignore
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# Signature verification fails closed when the required cryptography package is unavailable.
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
        base = self.config.server_url
        if not isinstance(base, str) or not base or base != base.strip():
            raise ValueError("server_url must be a valid absolute HTTP(S) URL")

        base = base.rstrip("/")
        if base.endswith("/api"):
            base = base[:-4]

        try:
            parsed_url = urlsplit(base)
            hostname = parsed_url.hostname
            _ = parsed_url.port
        except ValueError as error:
            raise ValueError("server_url must be a valid absolute HTTP(S) URL") from error

        if (
            parsed_url.scheme not in ("http", "https")
            or not parsed_url.netloc
            or not hostname
            or any(character.isspace() for character in base)
            or parsed_url.username is not None
            or parsed_url.password is not None
            or "?" in base
            or "#" in base
        ):
            raise ValueError("server_url must be a valid absolute HTTP(S) URL")

        is_loopback = hostname.rstrip(".").lower() == "localhost"
        if not is_loopback:
            try:
                is_loopback = ipaddress.ip_address(hostname).is_loopback
            except ValueError:
                is_loopback = False

        if parsed_url.scheme != "https" and not is_loopback:
            raise ValueError(
                "server_url must use HTTPS unless it targets localhost or a loopback IP"
            )

        endpoint = endpoint.lstrip("/")
        return f"{base}/{endpoint}"

    @staticmethod
    def canonical_json(data: Dict[str, Any]) -> str:
        """Produces canonical sorted JSON string matching server-side signing format"""
        return json.dumps(data, sort_keys=True, separators=(",", ":"))

    def verify_signature(self, payload: Dict[str, Any], signature_b64: str) -> bool:
        """
        Cryptographically verifies the RSA (2048/4096-bit) or Ed25519 signature
        against the server's public key.
        Guarantees response authenticity and prevents MITM or fake server bypass.
        """
        if not self.config.public_key_pem or not signature_b64:
            return False
        if not HAS_CRYPTOGRAPHY:
            return False

        try:
            pem_str = self.config.public_key_pem.strip()
            if "\\n" in pem_str and "\n" not in pem_str:
                pem_str = pem_str.replace("\\n", "\n")

            canonical_str = self.canonical_json(payload)
            signature_bytes = base64.b64decode(signature_b64)

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
        except Exception as e:
            print("[VCON-SDK] Cryptographic signature verification failed")
            return False

    @staticmethod
    def _safe_response(status_code: int, data: Any) -> Dict[str, Any]:
        if 200 <= status_code < 300 and isinstance(data, dict):
            if any(
                isinstance(data.get(key), str)
                for key in ("error", "message", "detail")
            ):
                return {
                    **data,
                    "error": "License server reported a validation error",
                }
            return data

        code = data.get("code") if isinstance(data, dict) else None
        if not isinstance(code, str) or not re.fullmatch(r"[A-Z0-9_]{1,64}", code):
            code = f"HTTP_{status_code}" if status_code >= 400 else "INVALID_RESPONSE"
        return {
            "error": (
                f"License server rejected the request (HTTP {status_code})"
                if status_code >= 400
                else "Invalid response from license server"
            ),
            "code": code,
        }

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
                    data = None
                return resp.status_code, self._safe_response(resp.status_code, data)
            except requests.exceptions.SSLError:
                return 495, {"error": "SSL handshake with license server failed", "code": "SSL_ERROR"}
            except requests.exceptions.ConnectionError:
                return 503, {"error": "Cannot connect to license server", "code": "SERVER_UNREACHABLE"}
            except requests.exceptions.Timeout:
                return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
            except Exception:
                return 500, {"error": "License server request failed", "code": "REQUEST_ERROR"}

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
                    data = None
                return status_code, self._safe_response(status_code, data)
        except urllib.error.HTTPError as e:
            status_code = e.code
            try:
                data = json.loads(e.read().decode("utf-8"))
            except Exception:
                data = None
            return status_code, self._safe_response(status_code, data)
        except urllib.error.URLError:
            return 503, {"error": "Cannot connect to license server", "code": "SERVER_UNREACHABLE"}
        except socket.timeout:
            return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
        except Exception:
            return 500, {"error": "License server request failed", "code": "UNKNOWN_ERROR"}

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
                    data = None
                return resp.status_code, self._safe_response(resp.status_code, data)
            except requests.exceptions.SSLError:
                return 495, {"error": "SSL handshake with license server failed", "code": "SSL_ERROR"}
            except requests.exceptions.ConnectionError:
                return 503, {"error": "Cannot connect to license server", "code": "SERVER_UNREACHABLE"}
            except requests.exceptions.Timeout:
                return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
            except Exception:
                return 500, {"error": "License server request failed", "code": "REQUEST_ERROR"}

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
                    data = None
                return status_code, self._safe_response(status_code, data)
        except urllib.error.HTTPError as e:
            status_code = e.code
            try:
                data = json.loads(e.read().decode("utf-8"))
            except Exception:
                data = None
            return status_code, self._safe_response(status_code, data)
        except urllib.error.URLError:
            return 503, {"error": "Cannot connect to license server", "code": "SERVER_UNREACHABLE"}
        except socket.timeout:
            return 408, {"error": "Connection to license server timed out", "code": "TIMEOUT"}
        except Exception:
            return 500, {"error": "License server request failed", "code": "UNKNOWN_ERROR"}

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
        Verifies the signed response and its one-time challenge before accepting it.
        Returns (active, payload); any unverifiable response is rejected.
        """
        url = self._build_url("api/v1/license/ping")
        nonce = secrets.token_urlsafe(32)
        body = {
            "license_key": license_key.strip().upper(),
            "hwid": hwid,
            "app_name": self.config.app_name,
            "client_time": int(time.time() * 1000),
            "nonce": nonce,
        }

        status_code, data = self._http_post(url, body, 10)
        if not isinstance(data, dict):
            return False, {"error": "Invalid heartbeat response", "code": "INVALID_RESPONSE"}

        if status_code == 200 and data.get("valid") is True:
            signature = data.pop("signature", None)
            data.pop("public_key", None)
            if (
                data.get("status") != "active"
                or data.get("nonce") != nonce
                or not signature
                or not self.verify_signature(data, signature)
            ):
                return False, {
                    "error": "Heartbeat signature or challenge verification failed",
                    "code": "HEARTBEAT_SIGNATURE_FAILED",
                }
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
