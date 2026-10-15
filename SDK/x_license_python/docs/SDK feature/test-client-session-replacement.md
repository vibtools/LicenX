# Session Replacement Tests

Test source: `SDK/x_license_python/test/test_client_session_replacement.py`

These unit tests protect the `XLicenseClient.login()` replacement contract. A first login must not send a spurious logout. When replacing an active license, the old key is logged out before the new key is validated. If old-session logout fails, replacement validation must not proceed and the local client/worker remains cleared rather than retaining an ambiguous old authorization. The suite also covers replacement validation failure after cleanup.

Run from `SDK/` with `python -m unittest -q x_license_python.test.test_client_session_replacement`. These tests mock the server; they do not verify hosted slot release.
