# LicenX Python SDK (`licenx`)

The LicenX Python client SDK adds online license validation, signed response verification, device binding, heartbeat monitoring, and logout lifecycle handling to Python applications. Import the package as `licenx` and use `XLicenseClient` for the normal integration path.

> **Release status:** Pushing a `python-sdk-vX.Y.Z` tag that matches both Python SDK versions runs GitHub Actions to test `licenx`, build its wheel and source distribution, and attach them to the GitHub Release alongside the SDK archive. This workflow does not publish to PyPI.

## Install

Requires Python 3.8 or newer. `cryptography` is required for signed response verification; `requests` is optional because the SDK has a standard-library transport fallback.

From this package directory, install the local checkout with:

```bash
python -m pip install .
```

To install a released package, download the `licenx` wheel from the GitHub Release and install that file with pip.

> 📖 **Comprehensive Documentation:**
>
> - 🇬🇧 **[English Complete A to Z Integration Guide (docs/GUIDE_EN.md)](./docs/GUIDE_EN.md)**
> - 🇧🇩 **[বাংলা সম্পূর্ণ A to Z গাইডলাইন ও ব্যবহারের নিয়ম (docs/GUIDE_BN.md)](./docs/GUIDE_BN.md)**
> - **[Application integration documentation](../docs/README.md)**

---

## 📦 Architecture & Module Responsibilities

| Module               | Scope & Responsibility                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`config.py`**      | Loads literal `app_config` from app-root `licenx.config.py`; legacy JSON files remain supported for existing integrations.                                                                                                           |
| **`device.py`**      | Computes deterministic SHA-256 HWID and offers local hardware telemetry; public-IP lookup is explicit opt-in. Login sends only HWID, device name, and OS metadata.                                                                   |
| **`server.py`**      | Transport and protocol engine. Supports `requests` with native `urllib` standard-library fallback. Requires `cryptography` for RSA and Ed25519 signature verification, pings heartbeat, and delivers unbind notifications.           |
| **`login.py`**       | Handles strict online validation and attempts saved-session auto-login. Persistent key storage is currently disabled. Validates SSL, signatures, app scope, device limit, and active status. Disallows offline logins.               |
| **`logout.py`**      | Manages manual logout and process exit hooks (`atexit`, `SIGINT`, `SIGTERM`) while preserving existing host signal handlers. Instantly notifies the server to mark device as `logged_out` and release the hardware slot.             |
| **`storage.py`**     | Disables persistent license-key storage and rejects legacy temp-file sessions; runs background heartbeats, permits only configured temporary outage grace, and immediately invalidates explicit denials or failed signed challenges. |
| **`offline.py`**     | Enforces online-only login policy and detects system clock manipulation / rollback attacks.                                                                                                                                          |
| **`client.py`**      | High-level facade (`XLicenseClient`) exposing clean, intuitive methods for desktop and CLI Python applications.                                                                                                                      |
| **`example_app.py`** | CLI lifecycle demonstration; progress output does not include the active license key.                                                                                                                                                |

---

## 🚀 Quick Start Guide

### 1. Requirements

The SDK declares compatibility with **Python 3.8+**. Its tag-release CI tests every minor from Python 3.8 through 3.15 on GitHub-hosted Linux (Ubuntu), Windows, and Intel macOS runners. This is configured coverage, not evidence of a passing hosted run; versions newer than 3.15 and Apple Silicon are not covered by this matrix. Install its requirements before use; `cryptography` is required for all license signature verification. HTTP transport can use optional `requests` or the standard-library `urllib` fallback.

```bash
pip install -r requirements.txt
# Installs: requests>=2.28.0, cryptography>=41.0.0
```

_(If `cryptography` is unavailable, the SDK rejects all signed license responses. It does not use a handwritten RSA fallback.)_

### 2. Configuration Setup

Create an app-root file named `licenx.config.py` with the settings your application needs:

```python
app_config = {
   "server_url": "https://your-license-server.example",
   "app_name": "your_app_slug",
   "display_name": "Your App",
   "min_version": "1.0.0",
   "app_version": "1.0.0",
   "ping_interval_seconds": 1200,
   "offline_grace_seconds": 0,
   "auto_logout_on_exit": True,
   "request_timeout_seconds": 15,
   "auto_login_enabled": True,
   "auto_save_session": True,
   "enable_background_heartbeat": True,
   "strict_online_only": True,
   "public_key_pem": "",
}
```

Replace the empty `public_key_pem` with the trusted Admin-provisioned RSA or Ed25519 public key. Set `app_version` to the actual application release; `min_version` is server policy. The loader reads literal values without executing the file.

`XLicenseClient()` discovers one `licenx.config.py` in the current working directory or main script directory. Conflicting config candidates raise an error. Legacy JSON loading remains supported as a compatibility path; it is not deprecated.

The full configuration guide and standalone template are source-checkout files. The package README includes this sample; the wheel also includes the three package docs declared in `pyproject.toml`. The package has not been published to PyPI.

#### Legacy JSON Compatibility

Legacy Admin JSON remains supported for existing integrations and is not deprecated. New integrations should use `licenx.config.py`.

### 3. Application Integration

```python
from licenx import XLicenseClient

def on_revoked(reason: str):
    print(f"[ALERT] License terminated remotely by server: {reason}")
    exit(1)

# Initialize client (automatically auto-discovers config in current or script folder)
client = XLicenseClient(on_license_revoked=on_revoked)

# 1. Attempt Auto-Login (the SDK does not persist license keys)
res = client.auto_login()

if not res.success:
    # 2. Prompt the user for a key; persistence requires a secure OS credential store
    key = input("Enter License Key: ").strip()
    res = client.login(key)

if res.success:
   print(f"[+] Access Granted! Tier: {client.get_tier()}")
   print(f"[+] Hardware ID: {client.get_hwid()}")
   print(f"[+] Background Worker: Active (Monitoring every 20 mins)")
else:
   print(f"[-] Access Denied: {res.message} (Code: {res.code})")
   if isinstance(res.request_id, str) and res.request_id.strip():
      print(f"[i] Server Request ID: {res.request_id}")
   exit(1)

# 3. Main Application Logic
# Auto-logout exit hooks automatically unbind the device slot when the app exits!
```

### Basic Integration

Set `app_version` in `licenx.config.py` to the actual running client version. `min_version` is server policy; it is not a substitute for `app_version`.

```python
from licenx import XLicenseClient

client = XLicenseClient()
license_key = input("Enter license key: ").strip()
result = client.login(license_key)

if not result.success:
   raise SystemExit(f"Login failed: {result.message} ({result.code})")

print(f"License Activated! Tier: {client.get_tier()}")
print(f"Hardware ID: {result.hwid}")
```

### Manual Heartbeat & Logout

Use `client.ping()` for an on-demand heartbeat and `client.logout()` for an explicit sign-out. Automatic exit cleanup is enabled by default. License keys are not persisted, so the app should prompt again after restart.

---

## 🔒 Security & Workflow Highlights

1. **Deterministic Hardware Identifier (HWID)**:
   - Generated by hashing Motherboard UUID, Primary Disk/SSD Serial, CPU info, and MAC address via SHA-256.
   - Format: `HWID-XXXX-XXXX-XXXX-XXXX`.

2. **Multi-App Scoping & Isolation**:
   - Licenses scoped to specific applications cannot authenticate other apps on the same server.
   - Global licenses (`app_id IS NULL`) can authenticate any app while respecting version constraints.

3. **Telemetry Minimization**:
   - License validation sends the required HWID plus device name and OS metadata; the detailed local telemetry mapping is not sent.
   - Diagnostic reports redact machine-specific identifiers. Public-IP lookup is available only through an explicit `DeviceManager.get_device_telemetry(include_public_ip=True)` or `DeviceManager.get_full_telemetry()` call, which contacts `api.ipify.org`.

4. **Dynamic Hardware Slot Releasing (Logout)**:
   - When an application closes or calls `client.logout(clear_saved_license=False)`, the server marks the device as `logged_out`.
   - Automatic exit hooks chain existing `SIGINT`/`SIGTERM` handlers after cleanup and run cleanup only once. Setting `auto_logout_on_exit=False` leaves host signal handling unchanged.
   - The device slot is immediately freed, allowing the same license to be activated on another PC.
   - Since license keys are not persisted, reopening the app requires the user to enter the key and authenticate online again.

5. **Background Heartbeat Worker (20-Minute Default Cycle)**:
   - Runs as a low-priority daemon thread with minimal CPU/RAM footprint.
   - Each success is signed by the server and bound to a fresh client nonce using the configured `public_key_pem` trust anchor.
   - The interval is configurable from 60 to 1,200 seconds. `offline_grace_seconds` defaults to 0 (fail closed) and permits up to 3,600 seconds after a detected transient network/service outage.
   - Successful signed heartbeats clear the outage timer. Explicit server revocation/denial, malformed payloads, signature/nonce failures, and TLS errors invalidate immediately regardless of grace.
   - `enable_background_heartbeat=False` opts out of automatic revocation checks and grace-expiry enforcement; no automatic detection SLA applies.
   - `client.ping()` uses the same signed challenge and configured grace policy. The initial validation payload's legacy grace field does not grant Python SDK heartbeat grace.
