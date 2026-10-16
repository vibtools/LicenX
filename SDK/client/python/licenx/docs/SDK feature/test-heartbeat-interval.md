# Heartbeat Configuration Tests

Test source: `SDK/x_license_python/test/test_heartbeat_interval.py`

The suite checks interval bounds and exact integer typing in both `SDKConfig` and `BackgroundLicenseWorker`, offline-grace bounds, safe defaults for malformed config values, preservation of explicit zero values, configured worker wait intervals, JSON-file round trips, and serialization of offline-grace settings.

These tests protect the relationship between app config and actual scheduled heartbeats. They do not measure timing precision under operating-system load. Run with `python -m unittest -q x_license_python.test.test_heartbeat_interval` from `SDK/`.
