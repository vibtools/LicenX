import base64
import threading
import unittest
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, padding, rsa

from x_license_python.client import XLicenseClient
from x_license_python.config import SDKConfig
from x_license_python.server import ServerCommunicator
from x_license_python.storage import BackgroundLicenseWorker


def public_key_pem(public_key):
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")


def sign_payload(private_key, payload):
    message = ServerCommunicator.canonical_json(payload).encode("utf-8")
    if isinstance(private_key, ed25519.Ed25519PrivateKey):
        signature = private_key.sign(message)
    else:
        signature = private_key.sign(message, padding.PKCS1v15(), hashes.SHA256())
    return base64.b64encode(signature).decode("ascii")


class HeartbeatVerificationTests(unittest.TestCase):
    def test_accepts_nonce_bound_rsa_and_ed25519_heartbeat_signatures(self):
        key_pairs = (
            rsa.generate_private_key(public_exponent=65537, key_size=2048),
            ed25519.Ed25519PrivateKey.generate(),
        )

        for private_key in key_pairs:
            with self.subTest(algorithm=type(private_key).__name__):
                communicator = ServerCommunicator(
                    SDKConfig(public_key_pem=public_key_pem(private_key.public_key()))
                )

                def post(_url, request_body, _timeout):
                    payload = {
                        "valid": True,
                        "status": "active",
                        "server_time": 123456,
                        "nonce": request_body["nonce"],
                    }
                    return 200, {
                        **payload,
                        "signature": sign_payload(private_key, payload),
                        "public_key": "untrusted response key",
                    }

                with patch.object(communicator, "_http_post", side_effect=post) as send:
                    is_active, data = communicator.ping_heartbeat("LIC-TEST", "HWID-TEST")

                self.assertTrue(is_active)
                self.assertEqual(data["status"], "active")
                self.assertNotIn("signature", data)
                self.assertNotIn("public_key", data)
                request_body = send.call_args.args[1]
                self.assertTrue(request_body["nonce"])
                self.assertEqual(data["nonce"], request_body["nonce"])

    def test_rejects_missing_tampered_and_wrong_nonce_signatures(self):
        private_key = ed25519.Ed25519PrivateKey.generate()
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=public_key_pem(private_key.public_key()))
        )
        payload = {
            "valid": True,
            "status": "active",
            "server_time": 123456,
            "nonce": "server-challenge",
        }
        signature = sign_payload(private_key, payload)
        responses = (
            {**payload},
            {**payload, "signature": signature, "server_time": 123457},
            {
                **payload,
                "nonce": "different-challenge",
                "signature": sign_payload(
                    private_key, {**payload, "nonce": "different-challenge"}
                ),
            },
        )

        for response in responses:
            with self.subTest(response=response):
                with patch.object(
                    communicator,
                    "_http_post",
                    return_value=(200, response),
                ):
                    is_active, data = communicator.ping_heartbeat("LIC-TEST", "HWID-TEST")

                self.assertFalse(is_active)
                self.assertIn("code", data)

    def test_background_worker_fails_closed_without_retry_on_transport_error(self):
        communicator = Mock()
        communicator.ping_heartbeat.side_effect = [
            TimeoutError("network sentinel"),
            (False, {"code": "SHOULD_NOT_RETRY"}),
        ]
        invalidated = Mock()
        worker = BackgroundLicenseWorker(
            "heartbeat-test",
            ping_interval_seconds=0,
            on_invalidated=invalidated,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True
        worker._stop_event.clear()

        worker._worker_loop()

        communicator.ping_heartbeat.assert_called_once_with("LIC-TEST", "HWID-TEST")
        invalidated.assert_called_once()
        self.assertFalse(worker._running)

    def test_stopping_worker_from_its_own_callback_does_not_self_join(self):
        worker = BackgroundLicenseWorker("heartbeat-self-stop-test")
        worker._thread = threading.current_thread()
        worker._running = True
        worker._stop_event.clear()

        worker.stop_monitoring()

        self.assertFalse(worker._running)
        self.assertIsNone(worker._thread)

    def test_manual_ping_invalidates_local_client_on_failure(self):
        client = XLicenseClient.__new__(XLicenseClient)
        client._current_key = "LIC-TEST"
        client._authenticated = True
        client._license_payload = {"valid": True}
        client.server = Mock()
        client.server.ping_heartbeat.return_value = (
            False,
            {"code": "HEARTBEAT_SIGNATURE_FAILED"},
        )
        client.logout_manager = Mock()
        client.on_license_revoked = Mock()
        client.get_hwid = Mock(return_value="HWID-TEST")

        with patch("builtins.print"):
            result = client.ping()

        self.assertEqual(result["code"], "HEARTBEAT_SIGNATURE_FAILED")
        self.assertFalse(client._authenticated)
        self.assertIsNone(client._current_key)
        self.assertIsNone(client._license_payload)
        client.logout_manager.logout.assert_called_once_with(clear_saved_data=True)
        client.on_license_revoked.assert_called_once()


if __name__ == "__main__":
    unittest.main()
