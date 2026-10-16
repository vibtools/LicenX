# High-Level Client Facade

Source: `SDK/x_license_python/client.py`

## Role and Construction

`XLicenseClient` is the application-facing facade. It composes `SDKConfig`, `ServerCommunicator`, `LoginManager`, `BackgroundLicenseWorker`, and `LogoutManager`. Construct with an explicit `SDKConfig`, a config path, a config object in the legacy `config_path` position, or the supported `app_name`/`server_url` options. `app_version=` overrides the loaded config value; it must identify the actual running app release.

```python
from licenx import XLicenseClient

client = XLicenseClient(app_version="2.4.1", on_license_revoked=handle_revocation)
result = client.login(user_supplied_key)
if result.success:
    run_premium_features()
finally:
    client.logout()
```

## Lifecycle Methods

- `login(key, pin=None)` closes a previous session before attempting replacement, then performs online validation. The legacy PIN parameter is accepted but ignored.
- `auto_login()` asks the login manager to validate a saved key online. Current session storage intentionally persists no key, so this normally returns `NO_SAVED_SESSION` after restart.
- `logout(clear_saved_license=True)` stops the heartbeat worker, clears legacy session data when requested, and requests server unbinding.
- `ping()` checks the current key (or a legacy saved session) immediately and applies the worker's transient-outage policy. It returns the response dictionary.
- `is_authenticated()`, `is_valid()`, `get_license_info()`, `get_tier()`, `get_hwid()`, `get_device_telemetry()`, and `get_current_key()` expose current client state or local device information.

## Important Integration Notes

Use the revocation callback to disable protected features promptly. Keep license keys out of logs and telemetry; `get_current_key()` returns the active credential. On successful authentication, the client starts background monitoring only when configured. A host application should still handle process shutdown and network failures according to its own UX and must not treat a local flag as server authorization.

`ping()` may invoke the revocation callback for a failure that the worker policy treats as invalidating. Do not call it concurrently with lifecycle changes unless the application coordinates those operations.
