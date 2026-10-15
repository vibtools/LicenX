# Runnable Example Application

Source: `SDK/x_license_python/example_app.py`

## Purpose

The CLI sample demonstrates constructing `XLicenseClient`, trying auto-login, prompting for a license key when no session exists, checking the result, reading license metadata, running a short protected loop, and relying on the exit hook to request unbinding.

It adjusts `sys.path` so the example works from an extracted SDK directory or the repository, then imports the package facade with a module-level fallback. In a real product, package the SDK normally rather than copying this path manipulation.

## Integration Guidance

Replace the demonstration callback and `run_premium_features()` boundary with the host application's actual feature gating. Always check `LoginResult.success`, handle `request_id` where useful for support, and explicitly report failed logout. The sample says it demonstrates production protection but is not itself a hardened production integration.

## Credential Handling

The processing loop prints progress only and does not call `get_current_key()` or emit the active key. `test_example_app_security.py` captures sample output with a sentinel credential and checks it is absent. Preserve this boundary in future logging changes. The example remains a demonstration, not a hardened production integration.
