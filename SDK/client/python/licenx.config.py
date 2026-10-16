"""Documented LicenX settings and constructor options; this module is data-only."""

app_config = {
    "server_url": "https://license.example.com",
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
    "public_key_pem": "",
    "generated_at": "2026-10-14T00:00:00Z",
}

# Optional XLicenseClient keyword arguments. None means "not overridden"; this map is not consumed automatically.
client_options = {
    # Optional explicit config path; leave None for normal Python-first discovery.
    "config_path": None,
    # Optional SDKConfig instance; choose this OR config_path when constructing the client. Default: None.
    "config": None,
    # Optional per-client overrides; None leaves the loaded SDKConfig value unchanged.
    "app_name": None,
    "server_url": None,
    "public_key_pem": None,
    "auto_logout_on_exit": None,
    "auto_save_session": None,
    "enable_background_heartbeat": None,
    "ping_interval_seconds": None,
    "offline_grace_seconds": None,
    "app_version": None,
    # Optional app-defined callable receiving a revocation reason; None installs no callback.
    "on_license_revoked": None,
}

# Informational SDK/server constraints only; editing this dictionary cannot change enforcement.
sdk_fixed_constraints = {
    # Fixed config validation bounds in config.py/storage.py.
    "minimum_ping_interval_seconds": 60,
    "maximum_ping_interval_seconds": 1200,
    "maximum_offline_grace_seconds": 3600,
    # Remote HTTP is rejected; HTTP is allowed only for localhost/loopback development.
    "remote_server_requires_https": True,
    # Signed responses fail closed without the cryptography package and a trusted public key.
    "signature_verification_requires_cryptography": True,
    # Fixed current behavior: session storage clears keys instead of persisting them.
    "license_key_persistence_enabled": False,
    # Server-owned default, not a client setting; configure the lease in Admin when supported.
    "server_default_device_lease_seconds": 7200,
    # OfflineGuard's fixed call-site default; not an app_config setting.
    "clock_drift_limit_minutes": 15,
}
