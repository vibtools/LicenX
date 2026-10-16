# Login Cleanup and Error Tests

Test source: `SDK/x_license_python/test/test_login_cleanup.py`

Tests cover best-effort release of a newly created binding after local signature or clock rejection, no unnecessary logout for ordinary server denials, preservation of a safe server request ID on failed `LoginResult`, and cleanup failures that must not replace the original signature failure.

The cleanup is best-effort: the client cannot guarantee remote unbinding when the server is unreachable. The test suite checks call behavior with mocks rather than server-side device rows. Run with `python -m unittest -q x_license_python.test.test_login_cleanup` from `SDK/`.
