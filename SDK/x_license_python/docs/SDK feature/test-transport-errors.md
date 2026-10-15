# Transport Error Sanitization Tests

Test source: `SDK/x_license_python/test/test_transport_errors.py`

The tests exercise `requests` and `urllib` branches for GET/POST. They verify backend error text, response bodies, diagnostic fields, and exception strings are not exposed; safe code values and canonical UUID request IDs may remain; malformed/missing IDs are omitted; and urllib TLS certificate failures are distinguished from ordinary network outages.

Mocked transport keeps tests deterministic. Keep sanitizer behavior aligned across both transport implementations whenever response handling changes. Run with `python -m unittest -q x_license_python.test.test_transport_errors` from `SDK/`.
