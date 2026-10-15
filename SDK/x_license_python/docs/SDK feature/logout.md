# Logout and Process Exit Hooks

Source: `SDK/x_license_python/logout.py`

## Explicit Logout

`LogoutManager.logout()` stops the heartbeat worker, optionally clears local legacy session data, and sends a server unbind request for the active key/HWID. The return value reports whether the remote logout was confirmed (or there was no key to send). `XLicenseClient.logout()` also clears its in-memory authenticated state regardless of remote success, so callers should inspect the boolean and report failed unbinding appropriately.

## Graceful Exit

When `auto_logout_on_exit=True`, the manager registers an `atexit` hook and attempts to wrap `SIGINT`/`SIGTERM`. It runs cleanup once, preserves and invokes callable prior handlers, respects `SIG_IGN`, and restores default termination semantics for default handlers. Signal installation can fail outside the main thread; the atexit hook remains registered.

Exit cleanup does not clear session data as a logout does, but current storage has no persisted key. A process kill, power loss, or network failure can prevent the server from receiving unbind; the server lease is the fallback, not a guarantee of immediate slot release.

Disable `auto_logout_on_exit` when the host application owns signal handling and will explicitly coordinate shutdown. Do not assume a local hook runs for every termination mode.
