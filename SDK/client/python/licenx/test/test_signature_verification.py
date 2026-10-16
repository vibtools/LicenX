import base64
import hashlib
import unittest
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ed25519, padding, rsa

from licenx.config import SDKConfig
from licenx.server import ServerCommunicator
from app import DiagnosticEngine


class SignatureVerificationTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"valid": True, "license_key": "LICX-TEST"}
        self.message = ServerCommunicator.canonical_json(self.payload).encode("utf-8")

    @staticmethod
    def public_key_pem(public_key):
        return public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")

    def test_ed25519_rejects_valid_signature_without_cryptography(self):
        private_key = ed25519.Ed25519PrivateKey.generate()
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=self.public_key_pem(private_key.public_key()))
        )
        signature = base64.b64encode(private_key.sign(self.message)).decode("ascii")

        with patch("licenx.server.HAS_CRYPTOGRAPHY", False):
            self.assertFalse(communicator.verify_signature(self.payload, signature))

    def test_ed25519_valid_and_invalid_signatures_with_cryptography(self):
        private_key = ed25519.Ed25519PrivateKey.generate()
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=self.public_key_pem(private_key.public_key()))
        )
        valid_signature = base64.b64encode(private_key.sign(self.message)).decode("ascii")
        invalid_signature = base64.b64encode(b"invalid").decode("ascii")

        with patch("licenx.server.HAS_CRYPTOGRAPHY", True):
            self.assertTrue(communicator.verify_signature(self.payload, valid_signature))
            self.assertFalse(communicator.verify_signature(self.payload, invalid_signature))

    def test_rsa_rejects_valid_signature_without_cryptography(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=self.public_key_pem(private_key.public_key()))
        )
        signature = base64.b64encode(
            private_key.sign(self.message, padding.PKCS1v15(), hashes.SHA256())
        ).decode("ascii")

        with patch("licenx.server.HAS_CRYPTOGRAPHY", False):
            self.assertFalse(communicator.verify_signature(self.payload, signature))

    def test_rsa_rejects_invalid_signature_with_cryptography(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=self.public_key_pem(private_key.public_key()))
        )
        valid_signature = base64.b64encode(
            private_key.sign(self.message, padding.PKCS1v15(), hashes.SHA256())
        ).decode("ascii")
        invalid_signature = base64.b64encode(b"invalid").decode("ascii")

        with patch("licenx.server.HAS_CRYPTOGRAPHY", True):
            self.assertTrue(communicator.verify_signature(self.payload, valid_signature))
            self.assertFalse(communicator.verify_signature(self.payload, invalid_signature))

    def test_rsa_rejects_malformed_pkcs1_v15_padding(self):
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_numbers = private_key.private_numbers()
        public_key = private_key.public_key()
        communicator = ServerCommunicator(
            SDKConfig(public_key_pem=self.public_key_pem(public_key))
        )
        digest_info = bytes.fromhex(
            "3031300d060960864801650304020105000420"
        ) + hashlib.sha256(self.message).digest()
        encoded_message_length = (private_key.key_size + 7) // 8
        malformed_block = (
            b"\x00\x01\x00"
            + b"\xff" * (encoded_message_length - len(digest_info) - 3)
            + digest_info
        )
        malformed_signature = pow(
            int.from_bytes(malformed_block, "big"),
            private_numbers.d,
            private_numbers.public_numbers.n,
        ).to_bytes(encoded_message_length, "big")

        with patch("licenx.server.HAS_CRYPTOGRAPHY", True):
            self.assertFalse(
                communicator.verify_signature(
                    self.payload,
                    base64.b64encode(malformed_signature).decode("ascii"),
                )
            )

    def test_validate_rejects_response_key_when_no_trust_anchor_is_configured(self):
        response_key = ed25519.Ed25519PrivateKey.generate()
        response_public_key = self.public_key_pem(response_key.public_key())
        signature = base64.b64encode(response_key.sign(self.message)).decode("ascii")
        response = {
            **self.payload,
            "signature": signature,
            "public_key": response_public_key,
        }
        config = SDKConfig(public_key_pem="", app_version="1.0.0")
        communicator = ServerCommunicator(config)
        communicator._http_post = Mock(return_value=(200, response))

        valid, status_code, data = communicator.validate_license(
            "LICX-TEST",
            "test-hwid",
            {},
        )

        self.assertFalse(valid)
        self.assertEqual(status_code, 403)
        self.assertEqual(data["code"], "SIGNATURE_FAILED")
        self.assertEqual(config.public_key_pem, "")

    def test_validate_uses_configured_key_not_response_key(self):
        trusted_key = ed25519.Ed25519PrivateKey.generate()
        response_key = ed25519.Ed25519PrivateKey.generate()
        config = SDKConfig(
            public_key_pem=self.public_key_pem(trusted_key.public_key()),
            app_version="1.0.0",
        )
        communicator = ServerCommunicator(config)
        signature = base64.b64encode(trusted_key.sign(self.message)).decode("ascii")
        response = {
            **self.payload,
            "signature": signature,
            "public_key": self.public_key_pem(response_key.public_key()),
        }
        communicator._http_post = Mock(return_value=(200, response))

        valid, status_code, _ = communicator.validate_license(
            "LICX-TEST",
            "test-hwid",
            {},
        )

        self.assertTrue(valid)
        self.assertEqual(status_code, 200)
        self.assertEqual(config.public_key_pem, self.public_key_pem(trusted_key.public_key()))

    def diagnostic_engine(self, configured_key, server_key):
        engine = DiagnosticEngine.__new__(DiagnosticEngine)
        engine.config = SDKConfig(public_key_pem=configured_key)
        engine.communicator = Mock()
        engine.communicator._build_url.return_value = "https://license.example/api/v1/public-key"
        engine.communicator._http_get.return_value = (
            200,
            {"algorithm": "Ed25519", "publicKeyPem": server_key},
        )
        return engine

    def test_diagnostic_handshake_rejects_missing_pin_without_adopting_server_key(self):
        server_key = self.public_key_pem(ed25519.Ed25519PrivateKey.generate().public_key())
        engine = self.diagnostic_engine("", server_key)

        success, message = engine._test_public_key_handshake()

        self.assertFalse(success)
        self.assertIn("preconfigured", message.lower())
        self.assertEqual(engine.config.public_key_pem, "")

    def test_diagnostic_handshake_rejects_mismatch_and_accepts_match(self):
        configured_key = self.public_key_pem(ed25519.Ed25519PrivateKey.generate().public_key())
        server_key = self.public_key_pem(ed25519.Ed25519PrivateKey.generate().public_key())
        mismatched_engine = self.diagnostic_engine(configured_key, server_key)

        success, message = mismatched_engine._test_public_key_handshake()

        self.assertFalse(success)
        self.assertIn("does not match", message.lower())
        self.assertEqual(mismatched_engine.config.public_key_pem, configured_key)

        matching_engine = self.diagnostic_engine(configured_key, configured_key)
        success, message = matching_engine._test_public_key_handshake()

        self.assertTrue(success)
        self.assertIn("matches", message.lower())
        self.assertEqual(matching_engine.config.public_key_pem, configured_key)

        escaped_key = configured_key.replace("\n", "\\n")
        escaped_engine = self.diagnostic_engine(escaped_key, configured_key)
        success, _ = escaped_engine._test_public_key_handshake()

        self.assertTrue(success)
        self.assertEqual(escaped_engine.config.public_key_pem, escaped_key)


if __name__ == "__main__":
    unittest.main()
