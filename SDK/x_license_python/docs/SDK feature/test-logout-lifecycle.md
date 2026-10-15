# Logout Signal Lifecycle Tests

Test source: `SDK/x_license_python/test/test_logout_lifecycle.py`

These tests exercise exit-hook semantics: existing callable signal handlers are invoked after cleanup, cleanup occurs only once, default handlers preserve process termination behavior, ignored signals stay ignored, and disabling auto-logout does not alter host handlers.

The tests isolate and mock process signals; they do not terminate the test process or prove cleanup under forced kill/power loss. Run with `python -m unittest -q x_license_python.test.test_logout_lifecycle` from `SDK/`.
