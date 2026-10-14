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

    def test_server_supplied_transient_codes_do_not_grant_grace_on_bad_responses(self):
        communicator = ServerCommunicator(SDKConfig())
        responses = (
            (200, {"valid": False, "code": "TIMEOUT"}),
            (403, {"error": "License rejected", "code": "SERVER_UNREACHABLE"}),
        )

        for response in responses:
            with self.subTest(status=response[0]), patch.object(
                communicator, "_http_post", return_value=response
            ):
                is_active, data = communicator.ping_heartbeat("LIC-TEST", "HWID-TEST")

            self.assertFalse(is_active)
            self.assertEqual(data["code"], "INVALID_RESPONSE")

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
            ping_interval_seconds=60,
            on_invalidated=invalidated,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True
        worker._stop_event.clear()

        with patch.object(worker._stop_event, "wait", return_value=False) as wait:
            worker._worker_loop()

        wait.assert_called_once_with(timeout=60)
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
        client.storage = Mock()
        client.storage.should_invalidate_for_heartbeat_failure.return_value = True
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

    def test_transient_failure_is_allowed_until_offline_grace_expires(self):
        communicator = Mock()
        communicator.ping_heartbeat.return_value = (
            False,
            {"code": "SERVER_UNREACHABLE", "message": "unavailable"},
        )
        invalidated = Mock()
        worker = BackgroundLicenseWorker(
            "offline-grace-test",
            ping_interval_seconds=60,
            offline_grace_seconds=60,
            on_invalidated=invalidated,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True

        with patch.object(worker._stop_event, "wait", side_effect=[False, False]) as wait, patch(
            "x_license_python.storage.time.monotonic", side_effect=[100.0, 160.0, 160.0]
        ):
            worker._worker_loop()

        self.assertEqual(wait.call_args_list[0].kwargs, {"timeout": 60})
        self.assertEqual(wait.call_args_list[1].kwargs, {"timeout": 0.0})
        communicator.ping_heartbeat.assert_called_once_with("LIC-TEST", "HWID-TEST")
        invalidated.assert_called_once_with("Offline grace period expired")
        self.assertFalse(worker._running)

    def test_security_failure_invalidates_immediately_even_with_grace(self):
        communicator = Mock()
        communicator.ping_heartbeat.return_value = (
            False,
            {"code": "HEARTBEAT_SIGNATURE_FAILED"},
        )
        invalidated = Mock()
        worker = BackgroundLicenseWorker(
            "offline-grace-security-test",
            ping_interval_seconds=60,
            offline_grace_seconds=3600,
            on_invalidated=invalidated,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True

        with patch.object(worker._stop_event, "wait", return_value=False):
            worker._worker_loop()

        invalidated.assert_called_once_with("HEARTBEAT_SIGNATURE_FAILED")
        self.assertFalse(worker._running)

    def test_tls_failure_invalidates_immediately_even_with_grace(self):
        communicator = Mock()
        communicator.ping_heartbeat.return_value = (False, {"code": "SSL_ERROR"})
        invalidated = Mock()
        worker = BackgroundLicenseWorker(
            "offline-grace-tls-test",
            ping_interval_seconds=60,
            offline_grace_seconds=3600,
            on_invalidated=invalidated,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True

        with patch.object(worker._stop_event, "wait", return_value=False):
            worker._worker_loop()

        invalidated.assert_called_once_with("SSL_ERROR")
        self.assertFalse(worker._running)

    def test_successful_heartbeat_clears_offline_grace(self):
        communicator = Mock()
        communicator.ping_heartbeat.return_value = (True, {"valid": True})
        worker = BackgroundLicenseWorker(
            "offline-grace-recovery-test",
            ping_interval_seconds=60,
            offline_grace_seconds=600,
        )
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True
        worker._offline_since = 100.0

        with patch.object(worker._stop_event, "wait", side_effect=[False, True]):
            worker._worker_loop()

        self.assertIsNone(worker._offline_since)

    def test_manual_ping_keeps_session_during_transient_grace(self):
        client = XLicenseClient.__new__(XLicenseClient)
        client._current_key = "LIC-TEST"
        client._authenticated = True
        client.server = Mock()
        client.server.ping_heartbeat.return_value = (
            False,
            {"code": "SERVER_UNREACHABLE"},
        )
        client.storage = Mock()
        client.storage.should_invalidate_for_heartbeat_failure.return_value = False
        client.get_hwid = Mock(return_value="HWID-TEST")

        result = client.ping()

        self.assertEqual(result["code"], "SERVER_UNREACHABLE")
        self.assertTrue(client._authenticated)
        client.storage.should_invalidate_for_heartbeat_failure.assert_called_once_with(result)


if __name__ == "__main__":
    unittest.main()
