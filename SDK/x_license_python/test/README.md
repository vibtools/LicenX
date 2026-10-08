# LicenX / VCON Python SDK - Diagnostic & Test Console

This directory contains `app.py`, an interactive test application built using Python `tkinter` (with automatic headless CLI fallback) to test all features of the LicenX / VCON Python Client SDK and backend licensing server.

---

## 🚀 How to Run

### 1. Requirements
- Python 3.8 or higher.
- `tkinter` (installed by default on Windows & macOS. On Ubuntu/Debian: `sudo apt-get install python3-tk`).
- No mandatory third-party pip dependencies required! Works out of the box using standard library Python.

### 2. Add Configuration (Auto-Discovery)
1. In the Web Admin Dashboard, go to **Applications** and click **Download Client Config** for your app (or create an application).
2. Place the downloaded `<app_name>_vcon_config.json` (or `vcon_config.json`) in this `test/` folder or the parent SDK directory.
3. If no config file is found, you can enter the Server URL and App Scope directly in the GUI or click **"Browse Config File"**.

### 3. Launch the GUI
```bash
# From this directory:
python app.py

# Or from project root:
python SDK/x_license_python/test/app.py
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
   - **Interactive Login:** Enter your license key (and optional PIN) to activate.
   - **Auto-Login:** Automatically recovers and validates saved sessions on startup.
   - **Heartbeat Ping:** Test on-demand pinging and background thread health.
   - **Logout & Unbind:** Releases machine slot on the server immediately so another machine can use it.

3. **12-Stage Diagnostic Test Suite (Test Button):**
   - Click **"Run Full SDK Diagnostic Test"** to test all SDK and Backend features:
     - Stage 1: SDK Environment & Platform Architecture
     - Stage 2: Hardware HWID Determinism
     - Stage 3: Configuration Discovery & Key Format
     - Stage 4: Backend Connectivity & Latency Measurement
     - Stage 5: RSA-2048 Public Key Handshake
     - Stage 6: Public Site Settings API Check
     - Stage 7: Security Boundary (Rejection of invalid fake keys)
     - Stage 8: Live License Validation Protocol
     - Stage 9: Cryptographic Signature & Tamper Resistance Verification
     - Stage 10: Heartbeat Ping & Server Time Synchronization (<60s drift)
     - Stage 11: Local Storage Encryption & Anti-Rollback Guard
     - Stage 12: Device Slot Release Protocol Check

4. **Forensic Report Export:**
   - **Save Report (.log):** Saves the complete report to `sdk_test_report.log`.
   - **Copy Report:** One-click copy to clipboard so you can paste and upload the log report directly to your engineer if any issue occurs.
