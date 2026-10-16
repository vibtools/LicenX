# Example Credential-Redaction Test

Test source: `SDK/x_license_python/test/test_example_app_security.py`

This regression runs the CLI example with a sentinel license key and captures stdout. It asserts that routine application output does not contain the supplied key while confirming the processing loop still produces useful progress output.

Run with `python -m unittest -q x_license_python.test.test_example_app_security` from `SDK/`. Keep this check when changing the example's login or logging flow; it protects against credential leakage to captured terminal, CI, or support logs.
