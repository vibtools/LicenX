# LicenX Python SDK Documentation

Use this documentation to integrate the installable `licenx` package into an application. The public integration path is `XLicenseClient`; the package's internal managers are not required for normal use.

## Start Here

1. [English integration guide](./GUIDE_EN.md)
2. [বাংলা A–Z integration guide](./GUIDE_BN.md)
3. [Configuration reference](./CONFIGURATION.md)
4. [Public API reference](./API_REFERENCE.md)

These root-level integration documents are maintained in the source checkout. The wheel includes the package-local guides under `SDK/client/python/licenx/docs/`; this root `docs/` directory is not wheel package data.

## Recommended Path

1. Install the package from the local checkout or a GitHub Release wheel.
2. Create an app-root `licenx.config.py` containing literal `app_config` values.
3. Keep the trusted server public key and actual application version in that config.
4. Construct `XLicenseClient()`, call `login()` with a key obtained at runtime, and gate protected functionality on `LoginResult.success`.
5. Call `logout()` when the protected session ends. The default exit hook is an additional cleanup path.

Legacy JSON config loading remains supported for existing integrations; new integrations should use `licenx.config.py`. The Python config file is parsed as data and is not executed.

## Important Runtime Limits

- Login always requires online server validation. There is no offline login mode.
- License keys are not persisted by this SDK. `auto_login()` normally returns `NO_SAVED_SESSION`; use a secure application-owned credential store only if your application has one.
- A successful login starts background heartbeat monitoring by default. The default interval is 1,200 seconds and default outage grace is zero.
- Public-IP lookup is opt-in. The normal validation request uses HWID, device name, and OS information rather than the full local telemetry mapping.
- The separate diagnostic console under `licenx/test/app.py` currently requires an explicitly selected JSON config and may create live audit records or device bindings. It is not the normal application integration path.

The package has not been published to PyPI. Its GitHub tag workflow builds release assets only after a matching tag and tests succeed.
