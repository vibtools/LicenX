import unittest
from unittest.mock import patch

from x_license_python.config import SDKConfig
from x_license_python.server import ServerCommunicator


class SecureTransportTests(unittest.TestCase):
    def communicator(self, server_url):
        return ServerCommunicator(SDKConfig(server_url=server_url))

    def test_accepts_https_and_normalizes_api_prefix(self):
        communicator = self.communicator("https://license.example.com/api/")

        self.assertEqual(
            communicator._build_url("api/v1/license/validate"),
            "https://license.example.com/api/v1/license/validate",
        )

    def test_allows_explicit_http_loopback_addresses(self):
        for server_url in (
            "http://localhost:3000",
            "http://localhost.:3000",
            "http://127.0.0.1:3000",
            "http://127.20.30.40:3000",
            "http://[::1]:3000",
        ):
            with self.subTest(server_url=server_url):
                self.assertEqual(
                    self.communicator(server_url)._build_url("ping"),
                    f"{server_url}/ping",
                )

    def test_rejects_remote_http_before_sending_license_credentials(self):
        communicator = self.communicator("http://license.example.com")
        with patch.object(communicator, "_http_post") as send:
            with self.assertRaisesRegex(ValueError, "must use HTTPS"):
                communicator.validate_license("LIC-SECRET", "HWID-TEST", {})

        send.assert_not_called()

    def test_rejects_non_loopback_http_and_localhost_lookalikes(self):
        for server_url in (
            "http://localhost.evil.example",
            "http://127.1",
            "http://192.168.1.20",
            "http://[::2]",
        ):
            with self.subTest(server_url=server_url):
                with self.assertRaisesRegex(ValueError, "must use HTTPS"):
                    self.communicator(server_url)._build_url("ping")

    def test_rejects_malformed_or_unsupported_server_urls(self):
        credential_url = "https://test-user" + "@license.example.com"
        for server_url in (
            "",
            credential_url,
            " https://license.example.com",
            "ftp://license.example.com",
            "https:///missing-host",
            "https://license.example.com:invalid",
            "https://license example.com",
            "https://user:password@license.example.com",
            "https://license.example.com?",
            "https://license.example.com#fragment",
        ):
            with self.subTest(server_url=server_url):
                with self.assertRaises(ValueError):
                    self.communicator(server_url)._build_url("ping")


if __name__ == "__main__":
    unittest.main()
