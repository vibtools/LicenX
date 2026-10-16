# LicenX Python SDK: Application Integration Guide

This guide walks through installing `licenx`, configuring an application, checking a license, handling lifecycle events, and shutting down cleanly. Use `XLicenseClient` for ordinary application integrations; do not build directly on internal managers unless you are extending the SDK itself.

## 1. Install the Package

The package requires Python 3.8 or newer. `cryptography` is required for signed-response verification. `requests` is optional; the SDK can fall back to Python's `urllib` transport.

From the repository root:

```bash
python -m pip install ./SDK/client/python/licenx
```

Or, from inside `SDK/client/python/licenx`:

```bash
python -m pip install .
```

For a released build, download the `licenx` wheel attached to the matching GitHub Release and install that wheel file. The package is not currently published to PyPI.

## 2. Create the App Config

Create `licenx.config.py` in the application root. Keep it declarative: define literal dictionaries only. The loader does not execute imports, function calls, environment lookups, or other Python statements in this file.

```python
app_config = {
    "server_url": "https://license.example.com",
    "public_key_pem": "",
    "app_name": "example_app",
    "display_name": "Example App",
    "min_version": "1.0.0",
    "app_version": "1.0.0",
    "ping_interval_seconds": 1200,
    "offline_grace_seconds": 0,
    "auto_logout_on_exit": True,
    "request_timeout_seconds": 15,
    "auto_login_enabled": True,
    "auto_save_session": True,
    "enable_background_heartbeat": True,
    "strict_online_only": True,
}
```

`license.example.com` and the empty key are documentation placeholders. Replace the host with the intended environment and provision an Admin-generated RSA or Ed25519 public key through a trusted channel. Never put a license key or private signing key in this file. `app_version` must be the actual release version of the integrating application; `min_version` is server policy and is not a substitute.

See [Configuration](./CONFIGURATION.md) for every field, default, type, and limit. Important constraints:

- Remote servers must use HTTPS. Plain HTTP is restricted to an explicitly configured loopback address for local development.
- `ping_interval_seconds` is an integer from 60 to 1,200; `offline_grace_seconds` is an integer from 0 to 3,600.
- `public_key_pem` must contain a valid trusted RSA or Ed25519 public key. An empty or invalid key fails before license transport.
- Missing `app_version` retains the local `APP_VERSION_REQUIRED` result before validation transport.
- `client_options` and `sdk_fixed_constraints` in the sibling sample are informational; they are not merged into `SDKConfig`.

## 3. How Config Discovery Works

The normal construction path is:

```python
from licenx import XLicenseClient

client = XLicenseClient()
```

The SDK searches the current working directory and the main script directory for one `licenx.config.py`. A unique Python config is preferred. If Python and legacy JSON candidates coexist, or more than one Python config is found, construction raises a config ambiguity error. If no Python config exists, legacy JSON discovery remains available. If no config exists at all, SDK defaults are used; those defaults are not production-ready.

The sibling file is parsed by path. Do not try `from licenx.config import app_config`: that import refers to the SDK module `licenx/config.py`.

For an explicit file, use one source at a time:

```python
client = XLicenseClient(config_path="licenx.config.py")
# Existing installations may still select an explicit JSON file:
# client = XLicenseClient(config_path="my_app_vcon_config.json")
```

A missing or invalid explicit path raises a config error. It does not silently select another file. Legacy JSON remains supported and is not deprecated, but the Python file is the recommended setup for new applications.

## 4. Add Login to the Application

Ask the user for the license key at runtime. Do not hard-code it, put it in `licenx.config.py`, log it, or persist it in a plain file.

```python
from getpass import getpass
from licenx import XLicenseClient


def on_license_revoked(reason: str) -> None:
    print(f"License session ended: {reason}")
    # Notify your application to stop protected work.


def run_protected_application() -> None:
    # Replace this with the application's protected entry point.
    pass


def main() -> int:
    client = XLicenseClient(on_license_revoked=on_license_revoked)
    try:
        license_key = getpass("License key: ").strip()
        result = client.login(license_key)

        if not result.success:
            print(f"License check failed: {result.code}: {result.message}")
            if result.request_id:
                print(f"Request ID: {result.request_id}")
            return 1

        print(f"License accepted. Tier: {client.get_tier()}")
        run_protected_application()
        return 0
    finally:
        if client.is_authenticated() and not client.logout():
            print("Warning: the server did not confirm logout.")


if __name__ == "__main__":
    raise SystemExit(main())
```

Replace the placeholder function with your application. Only enter protected functionality after `result.success` is true. `LoginResult` provides `success`, `status_code`, `message`, `code`, `license_data`, `hwid`, `license_key`, and optional `request_id`. Never print `license_key` or call `get_current_key()` for logging.

The legacy `pin` argument to `login()` is accepted for compatibility but ignored. License PINs are for web-panel control, not SDK login.

## 5. Handle Sessions and Logout

- `client.login(key)` performs online validation, signature verification, and device binding. On success it starts the configured heartbeat worker.
- `client.is_authenticated()` and `client.is_valid()` report the current local session state.
- `client.get_license_info()` returns the verified license payload after successful login. `client.get_tier()` returns its tier or `"None"` when no payload is available.
- `client.logout()` stops heartbeat monitoring, clears local session state, and asks the server to release the device binding. Check its boolean result when the application needs confirmation.
- `auto_logout_on_exit=True` (the default) registers `atexit`, `SIGINT`, and `SIGTERM` cleanup hooks. Explicit logout is still recommended at the end of the application's protected session.

The SDK deliberately does not save license keys. `auto_login()` is retained as an API but normally returns `NO_SAVED_SESSION`; `auto_save_session` does not enable persistence. If your product has an approved OS credential-vault integration, retrieve the key there in application code and call `login()` yourself.

## 6. Heartbeats, Network Loss, and Revocation

After successful login, `enable_background_heartbeat=True` starts a daemon worker. The default interval is 1,200 seconds. `offline_grace_seconds=0` fails closed on transient heartbeat failures. A positive grace period applies only to transient connectivity/service failures, up to 3,600 seconds; explicit denial, invalid signatures/nonces, and TLS errors invalidate immediately.

`enable_background_heartbeat=False` opts out of automatic revocation and grace-expiry checks. Use it only if the host application provides equivalent monitoring.

For an on-demand check:

```python
response = client.ping()
if not response.get("valid", False):
    print(response.get("code", "PING_FAILED"))
```

A heartbeat revocation callback can run on the worker thread. In GUI applications, schedule UI changes onto the GUI/main thread (for example, through a queue or the toolkit's event scheduler) instead of directly manipulating widgets in the callback.

## 7. Hardware ID and Telemetry

```python
hwid = client.get_hwid()
telemetry = client.get_device_telemetry()
```

The validation flow sends the HWID plus device name and OS metadata. `get_device_telemetry()` returns a richer local mapping that includes hardware/network identifiers; keep it private and do not upload or log it unless your application has a clear need and user notice. Public-IP lookup is opt-in through `DeviceManager.get_device_telemetry(include_public_ip=True)` or `DeviceManager.get_full_telemetry()` and contacts `api.ipify.org`.

## 8. Constructor Options

The recommended form is `XLicenseClient()` with `licenx.config.py`. Supported alternatives include:

- `XLicenseClient(config=SDKConfig(...))` for an application-built config object.
- `XLicenseClient(config_path="path.py")` or an explicit legacy JSON path.
- Direct `app_name=` / `server_url=` construction for compatibility; this bypasses file discovery, so provide the trusted public key and actual app version as appropriate.
- `app_version=` as an explicit version override. Other supported keyword overrides are listed in the [API reference](./API_REFERENCE.md).

Choose one configuration source. Do not expect `client_options` in the Python file to be automatically merged into constructor arguments.

## 9. Errors and Troubleshooting

- `CONFIG_FILE_NOT_FOUND`, `CONFIG_FILE_READ_ERROR`, `CONFIG_PARSE_ERROR`, `CONFIG_SCHEMA_ERROR`, `CONFIG_VALUE_ERROR`, and `CONFIG_SOURCE_AMBIGUOUS` are raised at config load time. `SDKConfigError` is available from `licenx.config`.
- `APP_VERSION_REQUIRED` means the actual client release is missing; set `app_version`, not `min_version`.
- `NO_SAVED_SESSION` from `auto_login()` is expected while SDK key persistence is disabled. Prompt the user and call `login()`.
- `NOT_AUTHENTICATED` from `ping()` means there is no active local session.
- Remote HTTP, untrusted keys, signature/nonce errors, and server denials must not be bypassed by switching off TLS or signature checks.

## 10. Test Your Integration

Run the package's offline unit tests from the repository root:

```bash
cd SDK/client/python
python -m unittest discover -s licenx/test -p "test_*.py" -q
```

These tests do not certify a live server. The separate diagnostic console at `licenx/test/app.py` currently accepts an explicitly selected JSON config, requires an operator-approved host allowlist, and can create server audit records/device bindings. Use only an approved non-production target and a disposable test license for any live test; never point it at Production without separate operational approval.
