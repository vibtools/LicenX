# SDK Diagnostic and Test Console

Source: `SDK/x_license_python/test/app.py`

## Modes and Configuration

The file implements a Tkinter GUI with headless CLI fallback. This separate live-test tool currently requires an explicitly selected legacy JSON config; it does not use the SDK's normal Python config discovery or silently accept SDK defaults. It requires a remote HTTPS `server_url`, `app_name`, trusted PEM `public_key_pem`, and the actual `app_version` (which it can prompt for when absent).

Live requests require exact hostname membership in `LICENX_STAGING_HOSTS` or the separately defined `LICENX_PRODUCTION_TEST_HOSTS`. The allowlist classifies an operator-approved target; it cannot prove that the host is truly staging or production. Production login and full diagnostics each require explicit confirmation. The console masks license input, and CLI input uses `getpass`.

## Diagnostic Flow and Side Effects

`DiagnosticEngine` runs preflight checks followed by 12 SDK/public-endpoint checks, including environment/HWID/configuration, connectivity, trusted-key match, invalid-key rejection, signed validation, heartbeat/time, local session/clock policy, and final logout/unbind. The full flow can write server audit records and changes the selected test license's device binding; use a disposable key and understand cleanup before starting.

The GUI disables config/live controls while checks run. Reports redact license keys and machine/host identifiers, track observed admin logout events separately from the pass score, and state that the result covers this SDK and configured public endpoints only. A pass is not product or production certification.

## Screenshot Diagnosis

The attached screenshot's four-field validation text is not present in this current source. Current code asks for the client version separately. A console launched from an older extracted folder can still show the old behavior; verify the exact script path and checkout before diagnosing the config itself.
