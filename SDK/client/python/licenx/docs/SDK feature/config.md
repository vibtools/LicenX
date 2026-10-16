# SDK Configuration

Source: `SDK/client/python/licenx/config.py`

## Recommended Setup

Create an app-root `licenx.config.py` containing a literal `app_config` dictionary. `XLicenseClient()` discovers a unique file in the current working directory or main script directory. The loader reads literals without executing the file, maps supported `SDKConfig` fields, ignores `generated_at`, and rejects unknown runtime settings.

```python
app_config = {
	"server_url": "https://license.example.com",
	"public_key_pem": "",
	"app_name": "example_app",
	"app_version": "1.0.0",
}
```

Use a trusted RSA or Ed25519 public key and the actual application release for `app_version`. The example host is reserved and the empty key is a placeholder. Remote servers require HTTPS.

## Runtime Model

`SDKConfig` remains the normalized runtime object. It contains server/app identity, version, timeout, heartbeat/grace, and lifecycle settings. Ping intervals must be exact integers from 60 to 1200 seconds; offline grace must be an exact integer from 0 to 3600 seconds. Defaults remain defined by the dataclass.

`SDKConfig.from_discovered_file()` performs Python-first discovery and retains legacy JSON discovery when no Python config exists. Conflicting candidates fail explicitly. `SDKConfig.from_config_path(path)` loads an explicit Python or JSON file. `from_json_file()` and `export_to_file()` remain available for legacy integrations.

The app's trusted public key must be provisioned through a trusted channel. Missing/invalid keys fail before validation transport; missing `app_version` retains the existing local `APP_VERSION_REQUIRED` response. `client_options` and `sdk_fixed_constraints` in the sample are informational and are not merged into runtime config.
