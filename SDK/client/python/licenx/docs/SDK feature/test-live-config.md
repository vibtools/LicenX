# Live Config and Diagnostic Tests

Test source: `SDK/x_license_python/test/test_live_config.py`

This is the broadest harness test module. It verifies explicit config loading, actual client-version prompting without substituting server minimum version, app-version serialization/constructor override, exact staging and separate Production allowlists, host normalization, malformed/placeholder URL rejection, trusted-key requirements, and preflight blocks before live validation.

It also tests diagnostic report redaction, minimal validation telemetry, optional public-IP lookup, heartbeat-policy preservation, timeout budgeting, GUI/CLI consent gates, production cancellation, live-control locking, admin logout observation/deduplication, revocation reporting, and stopping further diagnostics after logout. Tests mock live clients; the pass result does not mean any live request occurred.

Run with `python -m unittest -q x_license_python.test.test_live_config` from `SDK/`. The current checkout passed 46 tests on 2026-10-14.
