# LicenX / VCON Python SDK - Diagnostic & Test Console

This directory contains `app.py`, an interactive test application built using Python `tkinter` (with automatic headless CLI fallback) to test all features of the LicenX / VCON Python Client SDK and backend licensing server.

---

## How to Run

### 1. Requirements

- Python 3.8 or higher.
- `tkinter` (installed by default on Windows and macOS; on Ubuntu/Debian install `python3-tk`).
- Install the SDK requirements. `cryptography` is required to verify signed license responses; `requests` is optional because transport falls back to `urllib`.

From the `SDK` directory:

```powershell
python -m pip install -r client/python/licenx/requirements.txt
# For a verified non-production target:
$env:LICENX_STAGING_HOSTS = '<exact-non-production-hostname>'
# For an explicitly approved Production test instead, set this separate variable:
$env:LICENX_PRODUCTION_TEST_HOSTS = '<exact-approved-production-hostname>'
```

Set only the allowlist appropriate to the target. Matching is by exact hostname; the allowlist does not verify the target's environment.

### 2. Select the App Config

In the Web Admin Dashboard, download the client config, then use **Browse Config File** in the console. The download contains `server_url`, `app_name`, and `public_key_pem`, but it does not contain the running client's release version. If `app_version` is absent, the console asks you to enter the actual client version. Do not use `min_version` as the client version; it is server policy. The console derives and displays the hostname and target class from `server_url`; config loading makes no network request. Staging hosts must match `LICENX_STAGING_HOSTS`; Production hosts must match `LICENX_PRODUCTION_TEST_HOSTS`.

For Production, independently verify the hostname and use only the separately approved disposable test license. Activation writes live validation/audit activity and may bind the device. Full diagnostics perform more live checks and finish by logging out/unbinding; audit records may remain. The UI requires an additional Production confirmation before activation and before a full run.

### 3. Launch the GUI

```bash
# From this directory:
python app.py

# Or from project root:
python SDK/client/python/licenx/test/app.py
```

### 4. Running in Headless / Terminal Mode

If you are on a remote server without a graphical display (or wish to run in terminal):

```bash
python app.py --cli
```

---

## 🎯 Features Included

1. **Hardware Telemetry & HWID Inspector:**
   - Real-time deterministic Hardware ID (HWID) extraction with anti-spoof checks.
   - One-click **Copy HWID** button.

2. **Complete SDK Login System:**
   - **Interactive Login:** Enter your license key to activate. PIN is only for web-panel license control.
   - **Auto-Login:** Attempts online validation of a saved session; persistent key storage is currently disabled, so users must enter the key again after restarting.
   - **Heartbeat Ping:** Test on-demand pinging and background thread health.
   - **Logout & Unbind:** Releases machine slot on the server immediately so another machine can use it.
   - **Admin Logout Observation:** While logged in with background heartbeat enabled, arm the observer, then log out/unlink this device in the Admin Panel. The observation timeout follows the configured heartbeat interval and request budget.
   - Admin-triggered session events are included in the next saved/copied report even when the observer was not armed. Unarmed events are marked `OBSERVED`, not counted as a passed diagnostic; save/copy the report after the event.

3. **12-Stage Diagnostic Test Suite (Test Button):**
   - Click **"Run Full SDK Diagnostic Test"** to test all SDK and Backend features:
     - Stage 1: SDK Environment & Platform Architecture
     - Stage 2: Hardware HWID Determinism
     - Stage 3: Configuration Discovery & Key Format
     - Stage 4: Backend Connectivity & Latency Measurement
   - Stage 5: Server Public Key Match Against Preconfigured Pin
     - Stage 6: Public Site Settings API Check
     - Stage 7: Security Boundary (Rejection of invalid fake keys)
     - Stage 8: Live License Validation Protocol
     - Stage 9: Cryptographic Signature & Tamper Resistance Verification
     - Stage 10: Heartbeat Ping & Server Time Synchronization (<60s drift)
     - Stage 11: Confirms session keys are not persisted, legacy Base64 sessions are rejected and removed, and clock-drift guard boundaries hold.
     - Stage 12: Actual SDK logout followed by a heartbeat that must return `DEVICE_UNBOUND`.

   Login/activation and full diagnostics require confirmation. Full diagnostics validate the active license and end by logging out and unbinding its device. Use only the disposable license approved for the selected target. The report can be saved or copied; it redacts the license key and hardware identifiers, identifies the target class, and states its scope. A passing run checks this Python SDK and its configured public endpoints only; it does not test every product feature or certify production readiness.

4. **Forensic Report Export:**
   - **Save Report (.log):** Saves the complete report to `sdk_test_report.log`.
   - **Copy Report:** One-click copy to clipboard so you can paste and upload the log report directly to your engineer if any issue occurs.
