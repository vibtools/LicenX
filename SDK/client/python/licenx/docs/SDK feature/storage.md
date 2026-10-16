# Session Storage and Heartbeat Worker

Source: `SDK/x_license_python/storage.py`

## Persistence Policy

`BackgroundLicenseWorker` owns the session lifecycle and monitoring thread. It currently rejects persistent license-key storage: `save_session()` clears instead of writing, while `load_saved_session()` deletes any legacy temp session and returns `None`. `clear_session()` removes the app-specific temp file best-effort. This is why auto-login cannot restore a license after restart; a secure OS credential-store implementation is not present.

## Heartbeat Scheduling

The worker validates interval (60–1200 seconds) and grace (0–3600 seconds) before use. `start_monitoring()` replaces an old worker, records the communicator/key/HWID and starts a daemon thread. The thread waits the configured interval, sends a signed challenge ping, and stops on invalidation or explicit stop. Shutdown avoids joining the worker from itself.

## Grace Semantics

Offline grace defaults to zero. Only recognized transient transport/service codes can begin or continue a monotonic-clock outage window. Successful signed heartbeat resets the window. Denials, TLS/signature/challenge failures, malformed responses, and other non-transient codes invalidate immediately. When grace expires, the callback is invoked and the worker stops.

Set `enable_background_heartbeat=False` only when the integrating app accepts that automatic revocation and grace-expiry detection are disabled. A successful login by itself does not provide continuous authorization.
