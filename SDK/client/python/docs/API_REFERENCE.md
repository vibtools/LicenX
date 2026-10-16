# LicenX Python SDK API Reference

Normal application code should use `XLicenseClient`. `SDKConfig`, `LoginResult`, and `DeviceManager` are also exported from the package root.

```python
from licenx import DeviceManager, LoginResult, SDKConfig, XLicenseClient
from licenx.config import SDKConfigError
```

## `XLicenseClient`

### Constructor

```python
XLicenseClient(
    config_path=None,
    config=None,
    app_name=None,
    server_url=None,
    public_key_pem=None,
    auto_logout_on_exit=None,
    auto_save_session=None,
    enable_background_heartbeat=None,
    ping_interval_seconds=None,
    offline_grace_seconds=None,
    on_license_revoked=None,
    app_version=None,
)
```

Use one configuration source:

| Argument                                   | Behavior                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config_path`                              | Explicit `.py` or legacy JSON path. An `SDKConfig` object in this position remains accepted for compatibility. Omit it for Python-first discovery. |
| `config`                                   | An already constructed `SDKConfig`.                                                                                                                |
| `app_name`, `server_url`, `public_key_pem` | Legacy direct-construction options; supplying `app_name` or `server_url` bypasses file discovery.                                                  |
| `auto_logout_on_exit`                      | Override process-exit cleanup registration. Default comes from the loaded config (`True`).                                                         |
| `enable_background_heartbeat`              | Override the background worker setting. Default is `True`.                                                                                         |
| `ping_interval_seconds`                    | Direct-construction override; exact integer range 60–1,200.                                                                                        |
| `offline_grace_seconds`                    | Direct-construction override; exact integer range 0–3,600.                                                                                         |
| `on_license_revoked`                       | Application callback receiving a reason string. Heartbeat callbacks may run on the worker thread.                                                  |
| `app_version`                              | Explicit actual application release; overrides the loaded config value.                                                                            |
| `auto_save_session`                        | Compatibility option. License-key persistence remains disabled.                                                                                    |

### Methods

| Method                             | Return           | Notes                                                                                            |
| ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `login(license_key, pin=None)`     | `LoginResult`    | Online validation, signature checks, and device binding. Legacy `pin` is ignored.                |
| `auto_login()`                     | `LoginResult`    | Always validates online, but currently no key is persisted; normally returns `NO_SAVED_SESSION`. |
| `logout(clear_saved_license=True)` | `bool`           | Stops heartbeat, clears local state, and requests server-side unbind.                            |
| `ping()`                           | `dict[str, Any]` | On-demand heartbeat. With no active/saved session returns `NOT_AUTHENTICATED`.                   |
| `is_authenticated()`               | `bool`           | Current local authenticated state.                                                               |
| `is_valid()`                       | `bool`           | Alias for `is_authenticated()`.                                                                  |
| `get_license_info()`               | `dict \| None`   | Verified license payload after successful login.                                                 |
| `get_tier()`                       | `str`            | License tier or `"None"` without a payload.                                                      |
| `get_hwid()`                       | `str`            | Deterministic local device identifier.                                                           |
| `get_device_telemetry()`           | `dict[str, Any]` | Rich local telemetry; it does not request public IP by default.                                  |
| `get_current_key()`                | `str \| None`    | Sensitive active key accessor; never log or expose it.                                           |

### `LoginResult`

| Field          | Type           | Meaning                                                                                                             |
| -------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `success`      | `bool`         | Whether online validation and local verification succeeded.                                                         |
| `status_code`  | `int`          | HTTP-like result status.                                                                                            |
| `message`      | `str`          | User-safe result message.                                                                                           |
| `code`         | `str`          | Stable result code, for example `OK`, `APP_VERSION_REQUIRED`, `NO_SAVED_SESSION`, `EMPTY_KEY`, or `CLOCK_TAMPERED`. |
| `license_data` | `dict \| None` | Verified payload on success.                                                                                        |
| `hwid`         | `str \| None`  | Device identifier used for validation.                                                                              |
| `license_key`  | `str \| None`  | Sensitive key value; do not log or persist it.                                                                      |
| `request_id`   | `str \| None`  | Optional server correlation ID for support.                                                                         |

## `SDKConfig`

`SDKConfig` is the normalized runtime configuration. It is a dataclass with these fields:

| Field                         | Default                 | Notes                                                                     |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `server_url`                  | `http://localhost:3000` | Remote endpoints require HTTPS.                                           |
| `public_key_pem`              | `""`                    | Must be a trusted RSA or Ed25519 public key before license transport.     |
| `app_name`                    | `vcon_default`          | Admin application slug.                                                   |
| `display_name`                | `Default App`           | Display label.                                                            |
| `min_version`                 | `1.0.0`                 | Server policy; not the running client version.                            |
| `app_version`                 | `None`                  | Actual app release; validation reports `APP_VERSION_REQUIRED` if missing. |
| `ping_interval_seconds`       | `1200`                  | Exact integer 60–1,200.                                                   |
| `offline_grace_seconds`       | `0`                     | Exact integer 0–3,600; zero fails closed on transient outage.             |
| `auto_logout_on_exit`         | `True`                  | Register exit/signal cleanup.                                             |
| `request_timeout_seconds`     | `15`                    | Validation request timeout; must be an integer.                           |
| `auto_login_enabled`          | `True`                  | Auto-login API flag; no SDK key is persisted.                             |
| `auto_save_session`           | `True`                  | Compatibility field; persistence is disabled regardless.                  |
| `enable_background_heartbeat` | `True`                  | Start periodic revocation/grace checks after login.                       |
| `strict_online_only`          | `True`                  | Compatibility field; login remains online-only.                           |

### Config loading methods

| Method                             | Purpose                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `SDKConfig.from_discovered_file()` | Discover Python config first, then legacy JSON; defaults apply only if no config is found. |
| `SDKConfig.from_config_path(path)` | Load an explicit Python or JSON path.                                                      |
| `SDKConfig.from_python_file(path)` | Parse literal `app_config` without executing the file.                                     |
| `SDKConfig.from_json_file(path)`   | Explicit legacy JSON loader.                                                               |
| `SDKConfig.from_file(path=None)`   | Legacy JSON API. Prefer `from_config_path` or `from_discovered_file`.                      |
| `config.export_to_file(path)`      | Export an `SDKConfig` as legacy JSON.                                                      |

`SDKConfigError` is a `ValueError` with a safe `.code`: `CONFIG_FILE_NOT_FOUND`, `CONFIG_FILE_READ_ERROR`, `CONFIG_PARSE_ERROR`, `CONFIG_SCHEMA_ERROR`, `CONFIG_VALUE_ERROR`, or `CONFIG_SOURCE_AMBIGUOUS`.

## `DeviceManager`

- `DeviceManager.get_hwid()` returns the deterministic HWID used for binding.
- `DeviceManager.get_validation_telemetry()` returns the device name and OS fields used for validation.
- `DeviceManager.get_device_telemetry(include_public_ip=False)` returns a richer local mapping. Public-IP lookup is opt-in and contacts `api.ipify.org`.
- `DeviceManager.get_full_telemetry()` explicitly includes the public-IP lookup.

Treat hardware identifiers and telemetry as sensitive local data. The normal validation flow does not upload the full telemetry mapping.
