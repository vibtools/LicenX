# Python SDK Configuration

`licenx.config.py` is a Python literal config file containing an `app_config` dictionary. `XLicenseClient()` discovers a unique `licenx.config.py` in the current working directory or the main script directory and uses it before falling back to legacy JSON discovery. The SDK parses approved literals without executing the file. The sibling file is not imported as `licenx.config` because that name belongs to the SDK's own `licenx/config.py` module.

The example below shows what each setting means. The comments belong in this guide, not in the `app_config` block in `licenx.config.py`.

```python
app_config = {
    # Server endpoint. Remote servers must use HTTPS. Replace the example host.
    "server_url": "https://license.example.com",
    # Admin application slug. SDK default: "vcon_default".
    "app_name": "example_app",
    # Human-readable label. SDK default: "Default App".
    "display_name": "Example App",
    # Server-owned minimum-version policy; changing this client value does not change enforcement.
    "min_version": "1.0.0",
    # Actual release version of the integrating application; required for validation.
    "app_version": "1.0.0",
    # Heartbeat interval in seconds; integer range 60-1200. SDK default: 1200.
    "ping_interval_seconds": 1200,
    # Transient-outage grace in seconds; integer range 0-3600. SDK default: 0.
    "offline_grace_seconds": 0,
    # Register logout cleanup on process exit. SDK default: True.
    "auto_logout_on_exit": True,
    # Validation request timeout in seconds. SDK default: 15.
    "request_timeout_seconds": 15,
    # Allow auto-login attempts. SDK default: True; no key is currently persisted for auto-login.
    "auto_login_enabled": True,
    # Compatibility field. Key persistence is disabled regardless of this value.
    "auto_save_session": True,
    # Run periodic revocation and grace-expiry checks. SDK default: True.
    "enable_background_heartbeat": True,
    # Compatibility field. Login remains online-only even if this is False.
    "strict_online_only": True,
    # Trusted server verification key from Admin. Keep empty in examples; provision the real public key securely.
    "public_key_pem": "",
    # Admin-generation metadata; not an SDKConfig field and ignored by the SDK loader.
    "generated_at": "2026-10-14T00:00:00Z",
}
```

## Field Guidance

- Replace `server_url` and `app_name` with the endpoint and application slug for the intended environment. The example host is reserved for documentation; do not use it as a real endpoint. Never point a staging test at a Production host.
- `app_version` is the integrating application's actual release and must be supplied. `min_version` is server policy and is not a substitute for the client version.
- Use an Admin-provisioned `public_key_pem` as the trust anchor. The empty demo value cannot verify signed responses. Do not copy a private signing key or trust a key returned in an unauthenticated response.
- `ping_interval_seconds` accepts integers from 60 through 1200. `offline_grace_seconds` accepts integers from 0 through 3600; zero fails closed on transient outage. Positive grace applies only to transient heartbeat failures. Explicit denial, signature/nonce failure, and TLS errors still invalidate immediately.
- `enable_background_heartbeat=False` opts out of automatic revocation and grace-expiry checks. Keep it enabled unless the host application deliberately owns equivalent monitoring.
- `auto_logout_on_exit` controls SDK exit cleanup. Disable it only when the host application owns shutdown cleanup.
- `auto_login_enabled` controls whether the SDK attempts auto-login, but secure license-key persistence is currently disabled. The SDK therefore has no saved key to use after restart; users must authenticate again.
- `auto_save_session` and `strict_online_only` are compatibility fields, not effective switches in the current implementation. Keys are not persisted, and login remains online-only either way.
- `request_timeout_seconds` is used by validation requests. It is a config-file field, not an `XLicenseClient` constructor override.
- `generated_at` is optional informational metadata. It is not part of `SDKConfig`; remove it before manually constructing `SDKConfig` from a mapping.

## Using the SDK

`app_config` is converted to `SDKConfig`; `generated_at` is ignored metadata. Missing fields use current `SDKConfig` defaults. `client_options` is not merged automatically, and `sdk_fixed_constraints` remains informational. Supply `on_license_revoked` from application code as a constructor callback.

Legacy Admin JSON remains supported as a compatibility path and is not deprecated. `licenx.config.py` is the recommended source; conflicting config candidates raise an ambiguity error, and invalid explicit paths fail rather than falling back.

The Python mapping requires a valid trusted RSA or Ed25519 `public_key_pem`; missing or invalid keys fail before license transport. A missing `app_version` retains the existing local `APP_VERSION_REQUIRED` validation result.

The `client_options` and `sdk_fixed_constraints` dictionaries in `licenx.config.py` are informational examples. Their comments describe constructor inputs and fixed SDK/server behavior; editing those dictionaries does not change runtime enforcement.

## Package Availability

The full guide and sibling `licenx.config.py` template are in the source checkout, not installed as standalone files in the wheel or sdist. Both built artifacts contain the package README sample; the wheel also contains the three package docs declared in `pyproject.toml`. A wheel/sdist user can create the app-root file from the README sample. The package has not been published to PyPI.
