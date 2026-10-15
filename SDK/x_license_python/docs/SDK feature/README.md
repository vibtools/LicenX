# SDK Feature and File Reference

This directory documents the Python SDK source tree file by file for developers. It describes the current checkout, including local changes; it is not a claim that the code is published or production-certified.

## Start Here

- [Forensic findings and release gates](AUDIT_SUMMARY.md)
- [Package exports and version](package-init.md)
- [High-level client](client.md)
- [Configuration](config.md)
- [Transport and signature protocol](server.md)
- [Authentication lifecycle](login.md)
- [Heartbeat and session worker](storage.md)
- [Device identity and telemetry](device.md)

## Runtime and Integration Files

| SDK file                                | Reference                                     |
| --------------------------------------- | --------------------------------------------- |
| `SDK/x_license_python/__init__.py`      | [Package exports](package-init.md)            |
| `SDK/x_license_python/client.py`        | [Client facade](client.md)                    |
| `SDK/x_license_python/config.py`        | [Configuration](config.md)                    |
| `SDK/x_license_python/device.py`        | [Device identity](device.md)                  |
| `SDK/x_license_python/example_app.py`   | [Example application](example-app.md)         |
| `SDK/x_license_python/login.py`         | [Login manager](login.md)                     |
| `SDK/x_license_python/logout.py`        | [Logout lifecycle](logout.md)                 |
| `SDK/x_license_python/offline.py`       | [Online and clock policy](offline.md)         |
| `SDK/x_license_python/server.py`        | [Transport and protocol](server.md)           |
| `SDK/x_license_python/storage.py`       | [Session and heartbeat worker](storage.md)    |
| `SDK/x_license_python/requirements.txt` | [Dependencies](requirements.md)               |
| `SDK/x_license_python/README.md`        | [Package README](package-readme.md)           |
| `SDK/x_license_python/test/app.py`      | [Diagnostic console](diagnostic-console.md)   |
| `SDK/test/app.py`                       | [Diagnostic launcher](diagnostic-launcher.md) |

## Test Files

| Test source                               | Reference                                                    |
| ----------------------------------------- | ------------------------------------------------------------ |
| `test/test_client_session_replacement.py` | [Session replacement](test-client-session-replacement.md)    |
| `test/test_example_app_security.py`       | [Example credential redaction](test-example-app-security.md) |
| `test/test_heartbeat.py`                  | [Heartbeat behavior](test-heartbeat.md)                      |
| `test/test_heartbeat_interval.py`         | [Heartbeat configuration](test-heartbeat-interval.md)        |
| `test/test_live_config.py`                | [Live config and diagnostics](test-live-config.md)           |
| `test/test_login_cleanup.py`              | [Login cleanup and errors](test-login-cleanup.md)            |
| `test/test_logout_lifecycle.py`           | [Exit hooks](test-logout-lifecycle.md)                       |
| `test/test_pin_is_ignored.py`             | [Legacy PIN compatibility](test-pin-is-ignored.md)           |
| `test/test_readme_quick_start.py`         | [Quick-start contract](test-readme-quick-start.md)           |
| `test/test_secure_transport.py`           | [HTTPS policy](test-secure-transport.md)                     |
| `test/test_signature_verification.py`     | [Signature trust](test-signature-verification.md)            |
| `test/test_storage_security.py`           | [Session persistence](test-storage-security.md)              |
| `test/test_transport_errors.py`           | [Transport redaction](test-transport-errors.md)              |

## Existing Guides and Historical Files

- [English guide](guide-en.md), [Bangla guide](guide-bn.md), [docs portal](docs-portal.md), [test README](test-readme.md), and [package README](package-readme.md) explain existing user-facing docs.
- [v1.2.3 release note](release-notes-v1.2.3.md), [v1.2.2 release note](release-notes-v1.2.2.md), and [legacy verification audit](legacy-audit.md) explain current release metadata and historical claims.
- The files covered here are the 25 Python source/test files plus SDK requirements, README, current/historical release/audit material, and existing guides/portals. Generated `.pyc`/`__pycache__` and local database files are intentionally excluded: they are runtime artifacts/data, not SDK source features.

## Run the Tests

From the repository root:

```powershell
Push-Location SDK
python -m unittest discover -s x_license_python/test -p 'test_*.py'
Pop-Location
```

The diagnostic console can make live requests and may bind/unbind the supplied license. Use only its documented allowlisted target and disposable test license; its passing result covers the SDK and configured public endpoints only.
