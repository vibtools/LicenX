# VCON Python Client SDK (`x_license_python`)

Production-grade, modular client protection and hardware locking SDK for Python applications. Fully integrated with VCON License Server with Multi-App Scoping, Enterprise RSA 2048-bit Cryptographic Response Verification, 20-minute Heartbeat Daemon, and Dynamic Hardware Slot Unbinding on exit.

> 📖 **Comprehensive Documentation:**
>
> - 🇬🇧 **[English Complete A to Z Integration Guide (docs/GUIDE_EN.md)](./docs/GUIDE_EN.md)**
> - 🇧🇩 **[বাংলা সম্পূর্ণ A to Z গাইডলাইন ও ব্যবহারের নিয়ম (docs/GUIDE_BN.md)](./docs/GUIDE_BN.md)**

---

## 📦 Architecture & Module Responsibilities

| Module               | Scope & Responsibility                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`config.py`**      | Auto-discovers and parses `<app_name>_vcon_config.json` or `vcon_config.json`. Normalizes server URLs and provides standard configurations.                                                                                |
| **`device.py`**      | Computes deterministic SHA-256 HWID and offers local hardware telemetry; public-IP lookup is explicit opt-in. Login sends only HWID, device name, and OS metadata.                                                         |
| **`server.py`**      | Transport and protocol engine. Supports `requests` with native `urllib` standard-library fallback. Requires `cryptography` for RSA and Ed25519 signature verification, pings heartbeat, and delivers unbind notifications. |
| **`login.py`**       | Handles strict online validation and attempts saved-session auto-login. Persistent key storage is currently disabled. Validates SSL, signatures, app scope, device limit, and active status. Disallows offline logins.     |
| **`logout.py`**      | Manages manual logout and process exit hooks (`atexit`, `SIGINT`, `SIGTERM`) while preserving existing host signal handlers. Instantly notifies the server to mark device as `logged_out` and release the hardware slot.   |
| **`storage.py`**     | Disables persistent license-key storage and rejects legacy temp-file sessions; runs a background heartbeat and invalidates local access immediately when its signed challenge fails.                                       |
| **`offline.py`**     | Enforces online-only security policies and detects system clock manipulation / rollback attacks.                                                                                                                           |
| **`client.py`**      | High-level facade (`XLicenseClient`) exposing clean, intuitive methods for desktop and CLI Python applications.                                                                                                            |
| **`example_app.py`** | Complete lifecycle demonstration application ready to test and run.                                                                                                                                                        |

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

Download `<app_name>_vcon_config.json` from the Admin Panel (**Applications** tab > **Download Config** button) and place it in your application directory:

```json
{
  "server_url": "https://your-license-server.example",
  "app_name": "vcon_default",
  "display_name": "VCON Default Suite",
  "min_version": "1.0.0",
  "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwGQ8N0AkXoz/BQIXlh2F...\n-----END PUBLIC KEY-----\n"
}
```

`public_key_pem` is required for license authorization. Use the key in the Admin Panel's downloaded client config and provision that file/key through a trusted channel. Do not bootstrap trust by copying a key from an unauthenticated server response or `/v1/public-key`; the SDK ignores keys included in validation responses and rejects authorization when no key is configured.

Remote server URLs must use HTTPS. HTTP is permitted only for an explicitly configured localhost or loopback IP endpoint during local development/testing (for example, `http://127.0.0.1:3000`). The SDK rejects remote HTTP URLs before sending license credentials and keeps normal TLS certificate verification enabled for HTTPS.

**Existing-client migration:** Before upgrading deployed clients, ensure their config contains the intended server `public_key_pem`. A missing/empty key now causes validation to fail closed. For key rotation, distribute and install the new trusted public key before switching the server to sign with its matching private key; the SDK does not automatically trust a newly returned key.

### 3. Application Integration

```python
from x_license_python import XLicenseClient

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
    exit(1)

# 3. Main Application Logic
# Auto-logout exit hooks automatically unbind the device slot when the app exits!
```

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

5. **Background Heartbeat Worker (20-Minute Cycle)**:
   - Runs as a low-priority daemon thread with minimal CPU/RAM footprint.
   - Each success is signed by the server and bound to a fresh client nonce using the configured `public_key_pem` trust anchor.
   - A transport error, non-success response, malformed payload, missing/invalid signature, or nonce mismatch fails closed: local access is invalidated immediately and there is no offline grace.
   - Server revocation, suspension, or device unbind also invalidates local access and invokes the legacy `on_license_revoked` callback. The callback may run for connectivity or signature failures, not only an administrator revocation.
   - `client.ping()` uses the same signed challenge and invalidates the active client on failure. The initial validation payload's legacy grace field does not grant Python SDK heartbeat grace.
