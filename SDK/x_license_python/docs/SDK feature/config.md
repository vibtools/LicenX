# SDK Configuration

Source: `SDK/x_license_python/config.py`

## `SDKConfig`

`SDKConfig` is a dataclass for the server trust anchor, app scope, validation version, request policy, and lifecycle controls.

| Field                                                                    | Default / behavior                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `server_url`                                                             | `http://localhost:3000`; remote use must be HTTPS                                                 |
| `public_key_pem`                                                         | Empty by default; signed authorization cannot succeed without a trusted PEM key                   |
| `app_name`, `display_name`                                               | App scope and label                                                                               |
| `min_version`                                                            | Server policy metadata; never used as the client build version                                    |
| `app_version`                                                            | Optional actual client version; required before validation                                        |
| `ping_interval_seconds`                                                  | 1200; integer range 60–1200                                                                       |
| `offline_grace_seconds`                                                  | 0 (fail closed); integer range 0–3600                                                             |
| `request_timeout_seconds`                                                | 15 seconds                                                                                        |
| `auto_login_enabled`, `auto_save_session`, `enable_background_heartbeat` | Feature policy flags; persistence is currently disabled in the worker regardless of the save flag |
| `auto_logout_on_exit`, `strict_online_only`                              | Lifecycle/policy options                                                                          |

`__post_init__` rejects invalid heartbeat/grace types and ranges. The checks use exact `int` type, so `bool` is not accepted as a numeric setting.

## Discovery and Serialization

`SDKConfig.from_file(path)` reads an explicit path if present. Without one, it searches the current directory and the `__main__` script directory for `<name>_vcon_config.json` or `vcon_config.json`; if nothing is found, it returns defaults. Malformed files emit a warning and also return defaults, so live diagnostic code must use its stricter explicit loader rather than rely on this fallback.

`export_to_file(path)` serializes all config fields as indented JSON. Keep the public key provisioned through a trusted channel; never bootstrap it from an untrusted validation response. Supply the actual client `app_version` yourself.
