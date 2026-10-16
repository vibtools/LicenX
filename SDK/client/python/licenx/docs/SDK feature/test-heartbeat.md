# Heartbeat and Grace Tests

Test source: `SDK/x_license_python/test/test_heartbeat.py`

This suite verifies signed heartbeat behavior and worker lifecycle. Coverage includes RSA/Ed25519 nonce-bound responses, missing/tampered/wrong nonces, unsafe server-supplied transient labels, TLS and security failures, transient outage grace expiry and reset on success, worker transport failure, stopping from a callback without self-join, and on-demand `client.ping()` invalidation/grace behavior.

Responses that are denied or cannot be cryptographically verified must invalidate immediately; only recognized transient outage codes can use a configured grace window. Tests use generated or mocked keys and transport, not a live service. Run with `python -m unittest -q x_license_python.test.test_heartbeat` from `SDK/`.
