# Online Policy and Clock Guard

Source: `SDK/x_license_python/offline.py`

## `OfflineGuard`

`is_clock_tampered(server_time_ms, max_drift_minutes=15)` compares local epoch milliseconds with the server timestamp and reports drift beyond the configured absolute threshold. A missing/zero server timestamp is treated as no detected tampering. `verify_clock()` exposes the affirmative inverse result (`True` means the clock passes this check).

`check_online_policy(strict_online_only=True)` is a small policy helper that returns `False` when strict online-only mode is requested. The login manager independently performs online validation; this helper does not create an offline authorization mechanism.

`OfflineLicenseManager` is a backwards-compatible alias for `OfflineGuard`.

## Integration Limits

Clock comparison is a client-side diagnostic signal, not a trusted clock or a defense against a fully controlled endpoint. Authorization still depends on a fresh server validation and verified signed response. Transient offline grace applies to an already-running heartbeat session in `BackgroundLicenseWorker`; it does not permit offline login.
