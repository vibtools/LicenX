import io
import json
import ssl
import unittest
import urllib.error
from unittest.mock import patch

from x_license_python import server
from x_license_python.config import SDKConfig
from x_license_python.server import ServerCommunicator


class _FakeResponse:
    status_code = 502
    text = "response body secret sentinel"

    def json(self):
        return {"error": "backend detail sentinel", "code": "UPSTREAM_FAILURE"}


class _FakeRequestsExceptions:
    class SSLError(Exception):
        pass

    class ConnectionError(Exception):
        pass

    class Timeout(Exception):
        pass


class _FakeRequests:
    exceptions = _FakeRequestsExceptions

    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def post(self, *_args, **_kwargs):
        if self.error:
            raise self.error
        return self.response

    def get(self, *_args, **_kwargs):
        if self.error:
            raise self.error
        return self.response


class _UrlResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def getcode(self):
        return 200

    def read(self):
        return self.payload


class TransportErrorRedactionTests(unittest.TestCase):
    def setUp(self):
        self.communicator = ServerCommunicator(
            SDKConfig(server_url="https://license.example.com")
        )

    def test_requests_transport_redacts_response_errors_for_get_and_post(self):
        fake_requests = _FakeRequests(response=_FakeResponse())
        with patch.object(server, "HAS_REQUESTS", True), patch.object(
            server, "requests", fake_requests, create=True
        ):
            for method in (self.communicator._http_get, self.communicator._http_post):
                with self.subTest(method=method.__name__):
                    status, data = (
                        method("https://license.example.com/test", 3)
                        if method == self.communicator._http_get
                        else method("https://license.example.com/test", {}, 3)
                    )
                    self.assertEqual(status, 502)
                    self.assertEqual(data["code"], "UPSTREAM_FAILURE")
                    self.assertNotIn("backend detail sentinel", data["error"])
                    self.assertNotIn("response body secret sentinel", str(data))

    def test_requests_transport_exception_does_not_expose_exception_text(self):
        fake_requests = _FakeRequests(error=RuntimeError("private path sentinel"))
        with patch.object(server, "HAS_REQUESTS", True), patch.object(
            server, "requests", fake_requests, create=True
        ):
            status, data = self.communicator._http_get(
                "https://license.example.com/test", 3
            )

        self.assertEqual(status, 500)
        self.assertEqual(data, {
            "error": "License server request failed",
            "code": "REQUEST_ERROR",
        })
        self.assertNotIn("private path sentinel", str(data))

    def test_urllib_transport_redacts_response_errors_for_get_and_post(self):
        raw_response = _UrlResponse(
            json.dumps({"error": "backend detail sentinel", "code": "UPSTREAM_FAILURE"}).encode()
        )
        with patch.object(server, "HAS_REQUESTS", False), patch.object(
            server.urllib.request, "urlopen", return_value=raw_response
        ):
            for method in (self.communicator._http_get, self.communicator._http_post):
                with self.subTest(method=method.__name__):
                    status, data = (
                        method("https://license.example.com/test", 3)
                        if method == self.communicator._http_get
                        else method("https://license.example.com/test", {}, 3)
                    )
                    self.assertEqual(status, 200)
                    self.assertEqual(data["error"], "License server reported a validation error")
                    self.assertNotIn("backend detail sentinel", str(data))

    def test_urllib_http_error_redacts_body_and_preserves_safe_code(self):
        error = urllib.error.HTTPError(
            "https://license.example.com/test",
            403,
            "forbidden",
            {},
            io.BytesIO(
                json.dumps({
                    "error": "private backend sentinel",
                    "code": "LICENSE_REJECTED",
                }).encode()
            ),
        )
        with patch.object(server, "HAS_REQUESTS", False), patch.object(
            server.urllib.request, "urlopen", side_effect=error
        ):
            status, data = self.communicator._http_get(
                "https://license.example.com/test", 3
            )

        self.assertEqual(status, 403)
        self.assertEqual(data["code"], "LICENSE_REJECTED")
        self.assertEqual(data["error"], "License server rejected the request (HTTP 403)")
        self.assertNotIn("private backend sentinel", str(data))

    def test_urllib_tls_verification_failure_is_not_reported_as_network_outage(self):
        error = urllib.error.URLError(
            ssl.SSLCertVerificationError("certificate verification failed")
        )
        with patch.object(server, "HAS_REQUESTS", False), patch.object(
            server.urllib.request, "urlopen", side_effect=error
        ):
            status, data = self.communicator._http_post(
                "https://license.example.com/test", {}, 3
            )

        self.assertEqual(status, 495)
        self.assertEqual(data["code"], "SSL_ERROR")


if __name__ == "__main__":
    unittest.main()
