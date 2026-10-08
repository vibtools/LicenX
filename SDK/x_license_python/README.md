# VCON Python Client SDK (`x_license_python`)

Production-grade, modular client protection and hardware locking SDK for Python applications. Fully integrated with VCON License Server with Multi-App Scoping, Enterprise RSA 2048-bit Cryptographic Response Verification, 20-minute Heartbeat Daemon, and Dynamic Hardware Slot Unbinding on exit.

> 📖 **Comprehensive Documentation:**
>
> - 🇬🇧 **[English Complete A to Z Integration Guide (docs/GUIDE_EN.md)](./docs/GUIDE_EN.md)**
> - 🇧🇩 **[বাংলা সম্পূর্ণ A to Z গাইডলাইন ও ব্যবহারের নিয়ম (docs/GUIDE_BN.md)](./docs/GUIDE_BN.md)**

---

## 📦 Architecture & Module Responsibilities

| Module               | Scope & Responsibility                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`config.py`**      | Auto-discovers and parses `<app_name>_vcon_config.json` or `vcon_config.json`. Normalizes server URLs and provides standard configurations.                                                                 |
| **`device.py`**      | Collects hardware telemetry (Motherboard UUID, Primary Disk Serial, CPU model, MAC address, LAN/WAN IP, Timezone) and computes deterministic SHA-256 `HWID-XXXX-XXXX-XXXX-XXXX`.                            |
| **`server.py`**      | Transport and protocol engine. Supports `requests` with native `urllib` standard-library fallback. Verifies server RSA 2048-bit and Ed25519 signatures, pings heartbeat, and delivers unbind notifications. |
| **`login.py`**       | Handles strict online validation and saved session auto-login. Validates SSL, RSA 2048-bit signature, app scope, device limit, and active status. Disallows offline logins.                                 |
| **`logout.py`**      | Manages manual logout and process exit hooks (`atexit`, `SIGINT`, `SIGTERM`). Instantly notifies the server to mark device as `logged_out` and release the hardware slot.                                   |
| **`storage.py`**     | Secure session storage in the OS temp directory (`.vcon_session_<app>.dat`) and runs a low-overhead background daemon thread every 20 minutes to verify server state.                                       |
| **`offline.py`**     | Enforces online-only security policies and detects system clock manipulation / rollback attacks.                                                                                                            |
| **`client.py`**      | High-level facade (`XLicenseClient`) exposing clean, intuitive methods for desktop and CLI Python applications.                                                                                             |
| **`example_app.py`** | Complete lifecycle demonstration application ready to test and run.                                                                                                                                         |

---

## 🚀 Quick Start Guide

### 1. Requirements

The SDK runs out of the box on standard **Python 3.8+**.
For Ed25519 signature verification and the preferred HTTP transport on the client machine:

```bash
pip install -r requirements.txt
# Installs: requests>=2.28.0, cryptography>=41.0.0
```

_(Without `cryptography`, the SDK can verify supported RSA signatures through its standard-library fallback, but it rejects Ed25519 signatures it cannot verify. It never accepts an unverifiable signature.)_

### 2. Configuration Setup

Download `<app_name>_vcon_config.json` from the Admin Panel (**Applications** tab > **Download Config** button) and place it in your application directory:

```json
{
  "server_url": "http://localhost:3000",
  "app_name": "vcon_default",
  "display_name": "VCON Default Suite",
  "min_version": "1.0.0",
  "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwGQ8N0AkXoz/BQIXlh2F...\n-----END PUBLIC KEY-----\n"
}
```

`public_key_pem` is required for license authorization. Use the key in the Admin Panel's downloaded client config and provision that file/key through a trusted channel. Do not bootstrap trust by copying a key from an unauthenticated server response or `/v1/public-key`; the SDK ignores keys included in validation responses and rejects authorization when no key is configured.

**Existing-client migration:** Before upgrading deployed clients, ensure their config contains the intended server `public_key_pem`. A missing/empty key now causes validation to fail closed. For key rotation, distribute and install the new trusted public key before switching the server to sign with its matching private key; the SDK does not automatically trust a newly returned key.

### 3. Application Integration

```python
from x_license_python import XLicenseClient

def on_revoked(reason: str):
    print(f"[ALERT] License terminated remotely by server: {reason}")
    exit(1)

# Initialize client (automatically auto-discovers config in current or script folder)
client = XLicenseClient(on_license_revoked=on_revoked)

# 1. Attempt Auto-Login with saved session from OS temp directory
res = client.auto_login()

if not res.success:
    # 2. Prompt user for license key if no valid session is found
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

3. **Dynamic Hardware Slot Releasing (Logout)**:
   - When an application closes or calls `client.logout(clear_saved_license=False)`, the server marks the device as `logged_out`.
   - The device slot is immediately freed, allowing the same license to be activated on another PC.
   - When the first PC re-opens, `auto_login()` checks server limits and re-activates the slot if available.

4. **Background Heartbeat Worker (20-Minute Cycle)**:
   - Runs as a low-priority daemon thread with minimal CPU/RAM footprint.
   - If an admin revokes, suspends, or unbinds a device from the control panel, the client detects the termination on the next heartbeat, triggers `on_license_revoked`, and terminates premium features.
