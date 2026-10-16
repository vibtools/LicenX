# Secure Transport Tests

Test source: `SDK/x_license_python/test/test_secure_transport.py`

This suite checks endpoint URL normalization, permitted HTTP for localhost/loopback only, and rejection of remote HTTP before credentials reach the transport. It also tests localhost lookalikes, non-loopback/private addresses, unsupported schemes, malformed hosts/ports, embedded credentials, whitespace, query strings, and fragments.

The checks are local URL-policy unit tests; they do not validate DNS resolution, certificate chains, proxies, or deployed TLS configuration. Run with `python -m unittest -q x_license_python.test.test_secure_transport` from `SDK/`.
