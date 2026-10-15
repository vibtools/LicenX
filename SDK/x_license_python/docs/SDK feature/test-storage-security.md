# Session Storage Security Tests

Test source: `SDK/x_license_python/test/test_storage_security.py`

This suite confirms that `save_session()` does not persist a license key, legacy Base64/temp-file sessions are rejected and removed, and explicit cleanup removes an existing legacy file.

The intentional tradeoff is that auto-login cannot survive process restarts until a secure credential-store integration exists. These tests prevent regression to plaintext/obfuscated temp-file storage; they do not test an OS keychain because none is implemented. Run with `python -m unittest -q x_license_python.test.test_storage_security` from `SDK/`.
