# VCON Python Client SDK — Complete Integration & Developer Guide (A to Z)

Welcome to the official developer guide for the **VCON Python Client SDK (`x_license_python`)**. This guide walks you through everything required to integrate, protect, and manage enterprise-grade software licenses inside Python desktop, CLI, and automation applications.

---

## 📑 Table of Contents

1. [Architecture Overview & Threat Model](#1-architecture-overview--threat-model)
2. [Prerequisites & Installation](#2-prerequisites--installation)
3. [Configuration Setup](#3-configuration-setup)
4. [Core Authentication Workflow](#4-core-authentication-workflow)
   - [Initial User Login](#initial-user-login)
   - [Automatic Session Login (Auto-Login)](#automatic-session-login-auto-login)
   - [Graceful Exit & Hardware Slot Release (Auto-Logout)](#graceful-exit--hardware-slot-release-auto-logout)
5. [Hardware Locking & HWID Generation](#5-hardware-locking--hwid-generation)
6. [Background Heartbeat Daemon (20-Minute Cycle)](#6-background-heartbeat-daemon-20-minute-cycle)
7. [Cryptographic Signature Verification (Ed25519)](#7-cryptographic-signature-verification-ed25519)
8. [Multi-App Scoping & Isolation](#8-multi-app-scoping--isolation)
9. [System Clock Rollback & Anti-Tamper Protection](#9-system-clock-rollback--anti-tamper-protection)
10. [End-to-End Code Examples](#10-end-to-end-code-examples)
    - [Example A: Command Line Interface (CLI) Tool](#example-a-command-line-interface-cli-tool)
    - [Example B: Graphical User Interface (Tkinter Desktop App)](#example-b-graphical-user-interface-tkinter-desktop-app)
    - [Example C: Headless Automation / Background Worker](#example-c-headless-automation--background-worker)
11. [API Class & Method Reference](#11-api-class--method-reference)
12. [Server Response & Error Code Reference](#12-server-response--error-code-reference)
13. [FAQ & Troubleshooting](#13-faq--troubleshooting)

---

## 1. Architecture Overview & Threat Model

The VCON Python SDK provides client-side protection by communicating with your centralized VCON License Server. It enforces **strict online-only authentication** and hardware-based node locking.

```text
+-----------------------------------------------------------------+
|                       Your Python Application                   |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|            XLicenseClient (High-Level SDK Facade)               |
+-----------------------------------------------------------------+
   |                 |                   |                   |
   v                 v                   v                   v
[device.py]     [login.py]          [storage.py]        [logout.py]
- Motherboard   - Validate Online   - Session Cache     - Exit Hooks
- Disk Serial   - Check Limits      - 20-Min Daemon     - Slot Release
- SHA-256 HWID  - Anti-Rollback     - Auto-Restore      - atexit/signal
   |                 |                   |                   |
   +-----------------+-------------------+-------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                  server.py (Network Transport)                  |
| - Requests with native urllib standard-library fallback         |
| - Ed25519 cryptographic response signature verification         |
+-----------------------------------------------------------------+
                                |
                         HTTPS / TLS 1.3
                                v
+-----------------------------------------------------------------+
|                     VCON License Server                         |
|  - Validates key, expiry, tier, status, app scope               |
|  - Tracks hardware slots (active vs logged_out)                 |
|  - Signs JSON response using Ed25519 Private Key                |
+-----------------------------------------------------------------+
```

### Key Security Principles:
- **Zero Offline Bypass:** Clients cannot run in offline mode unless an active, unrevoked session exists and passes periodic validation.
- **Hardware-Enforced Node Locking:** The server limits each key to a designated number of active machines (e.g. 1 device, 5 devices).
- **Dynamic Slot Releasing:** When a user closes the application, exit hooks notify the server to release the device slot so the same license can be transferred to another computer without administrator intervention.
- **Ed25519 Cryptographic Signatures:** Every server approval is signed with an asymmetric Ed25519 key, preventing local DNS redirects or MITM proxy spoofing.

---

## 2. Prerequisites & Installation

### Requirements
- **Python Version:** 3.8, 3.9, 3.10, 3.11, or 3.12+
- **Operating Systems:** Windows 10/11, macOS (Intel & Apple Silicon), Linux (Ubuntu, Debian, CentOS, Arch, etc.)

### Standard Library Ready (Zero Mandatory Dependencies)
The SDK is uniquely engineered to operate using **Python's standard library** (`urllib.request`, `hashlib`, `socket`, `platform`, `subprocess`, `json`, `time`, `threading`).

### Optional Production Packages (Recommended)
For enhanced HTTP performance and local Ed25519 cryptographic signature checks:
```bash
pip install requests>=2.28.0 cryptography>=41.0.0
```
*(If these packages are not installed, the SDK seamlessly falls back to native standard-library `urllib` and logs an informative note).*

---

## 3. Configuration Setup

You can configure the SDK using a JSON file or programmatically in your Python code.

### Option 1: Using `<app_name>_vcon_config.json` (Recommended)
Download the configuration file from your **VCON Admin Panel** (**Applications Tab > Download Config**) and place it in your application root folder:

```json
{
  "server_url": "https://your-license-server.com",
  "app_name": "vcon_default",
  "display_name": "My Desktop Pro",
  "min_version": "1.0.0",
  "ping_interval_seconds": 1200,
  "auto_logout_on_exit": true,
  "request_timeout_seconds": 15,
  "auto_login_enabled": true,
  "auto_save_session": true,
  "enable_background_heartbeat": true,
  "strict_online_only": true,
  "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...YourKeyHere...\n-----END PUBLIC KEY-----\n"
}
```

The SDK automatically searches for:
1. `<app_name>_vcon_config.json` in the current working directory.
2. `vcon_config.json` in the current working directory.
3. The directory where the main execution script resides.

### Option 2: Programmatic Configuration
You can pass parameters directly to `XLicenseClient`:

```python
from x_license_python import XLicenseClient

client = XLicenseClient(
    app_name="photo_editor_pro",
    server_url="https://license.mycompany.com",
    ping_interval_seconds=1200,   # 20 minutes
    auto_logout_on_exit=True,     # Free device slot on app close
    auto_save_session=True,       # Save key for seamless restart
)
```

---

## 4. Core Authentication Workflow

### Initial User Login
When an end-user runs your application for the first time, prompt them for their license key:

```python
from x_license_python import XLicenseClient

client = XLicenseClient()

license_key = "VCON-ABCD-EFGH-1234"
res = client.login(license_key)

if res.success:
    print(f"Authentication successful!")
    print(f"License Tier : {client.get_tier()}")
    print(f"Hardware ID  : {client.get_hwid()}")
else:
    print(f"Login failed: {res.message} (Code: {res.code})")
```

### Automatic Session Login (Auto-Login)
On subsequent launches, your application should attempt `client.auto_login()` before prompting the user. `auto_login()` reads the cached key from the secure OS temp storage and validates it live with the server:

```python
from x_license_python import XLicenseClient

client = XLicenseClient()

# Attempt silent auto-login
result = client.auto_login()

if result.success:
    print("Welcome back! Premium access granted.")
else:
    # Fall back to prompting the user
    user_key = input("Enter License Key: ").strip()
    result = client.login(user_key)
```

### Graceful Exit & Hardware Slot Release (Auto-Logout)
When a user exits your app (via GUI close, `sys.exit()`, or `Ctrl+C`):
- `logout.py` intercepts process termination hooks (`atexit`, `signal.SIGINT`, `signal.SIGTERM`).
- It sends a lightweight notification to `/v1/license/logout`.
- The server updates the device row to `status = 'logged_out'`.
- **Result:** The user's active device slot is instantly freed. They can immediately open the app on another PC without triggering `DEVICE_LIMIT_REACHED`!
- The saved session file is preserved locally, so when they reopen the app on the first PC, `auto_login()` reactivates the device.

To perform a manual logout (e.g., when a user clicks "Sign Out" or "Unlink License"):
```python
# Unlinks from server AND deletes saved license key from this machine
client.logout(clear_saved_license=True)
```

---

## 5. Hardware Locking & HWID Generation

`DeviceManager` creates a deterministic, tamper-resistant Hardware Identifier (HWID).

### How the HWID is Calculated:
1. **Motherboard UUID:** Retrieved from BIOS / `/sys/class/dmi/id/product_uuid` or WMI.
2. **Primary Disk Serial:** Hardware serial number of the boot volume.
3. **MAC Address:** Hardware Ethernet / Wi-Fi physical address.
4. **CPU Info:** CPU model name and physical core configuration.

These components are concatenated and hashed via **SHA-256**:
$$\text{HWID} = \text{"HWID-" + SHA256(components)[0:16].to\_uppercase()}$$
Formatted as: `HWID-XXXX-XXXX-XXXX-XXXX`.

```python
from x_license_python import DeviceManager

hwid = DeviceManager.get_hwid()
telemetry = DeviceManager.get_device_telemetry()

print("Hardware ID:", hwid)
print("System OS  :", telemetry["os_info"])
print("CPU Model  :", telemetry["cpu_info"])
print("Local IP   :", telemetry["local_ip"])
```

---

## 6. Background Heartbeat Daemon (20-Minute Cycle)

Once authenticated, `BackgroundLicenseWorker` launches a daemon thread:
- **Frequency:** Every 20 minutes (configurable via `ping_interval_seconds`).
- **Resource Footprint:** Zero impact on UI thread; low CPU and memory footprint.
- **Revocation Handling:** If an admin suspends, revokes, or deletes a license in the VCON Admin Panel, the background worker detects the rejection and fires the `on_license_revoked` callback.

```python
def handle_license_termination(reason: str):
    print(f"[SECURITY ALERT] License terminated: {reason}")
    # Lock UI or disable premium features
    lock_application()

client = XLicenseClient(on_license_revoked=handle_license_termination)
```

You can also trigger an **on-demand ping** at any time:
```python
status = client.ping()
if not status.get("valid"):
    print("License is no longer valid:", status.get("message"))
```

---

## 7. Cryptographic Signature Verification (Ed25519)

Every successful verification payload returned by the server is cryptographically signed using the server's private Ed25519 key.

### Verification Steps:
1. The server serializes the payload using **Canonical JSON** (alphabetically sorted keys, compact separators).
2. The server signs the payload: `Signature = Ed25519_Sign(canonical_json, private_key)`.
3. The client SDK extracts the `signature` and validates it against the `public_key_pem` bundled in your config.
4. If an attacker attempts to spoof server responses with an HTTP proxy (e.g., Charles, Fiddler, Burp Suite), the cryptographic check fails with `SIGNATURE_FAILED`.

---

## 8. Multi-App Scoping & Isolation

Licenses can be scoped to specific applications:
- **App-Specific License:** Bound to a particular `app_slug` (e.g. `video_editor_pro`). Cannot be used to activate another application (e.g. `audio_master_pro`) even on the same server.
- **Global License:** Licenses created with `app_id: null` can authenticate any application.
- **Version Enforcement:** If the server configures a `min_version` (e.g., `2.1.0`) and the client sends `1.9.0`, the server returns HTTP `426 APP_VERSION_OUTDATED`.

---

## 9. System Clock Rollback & Anti-Tamper Protection

To prevent attackers from bypassing license expiry by rewinding their system clock:
1. Server returns `server_time` (Unix timestamp in milliseconds).
2. `OfflineGuard.is_clock_tampered()` compares the local machine time with the trusted server time.
3. If drift exceeds 15 minutes, the login is rejected with `CLOCK_TAMPERED`.

```python
from x_license_python import OfflineGuard

is_tampered = OfflineGuard.is_clock_tampered(server_time_ms=1791400000000)
if is_tampered:
    print("Clock rollback attack detected!")
```

---

## 10. End-to-End Code Examples

### Example A: Command Line Interface (CLI) Tool

```python
#!/usr/bin/env python3
import sys
from x_license_python import XLicenseClient

def on_revoked(reason: str):
    print(f"\n[ALERT] License revoked: {reason}")
    sys.exit(1)

def main():
    client = XLicenseClient(on_license_revoked=on_revoked)

    # 1. Check auto-login first
    res = client.auto_login()

    # 2. Prompt for key if not saved
    if not res.success:
        key = input("Enter License Key: ").strip()
        res = client.login(key)

    if not res.success:
        print(f"Error: {res.message}")
        sys.exit(1)

    print(f"Unlocked! Tier: {client.get_tier()}")
    # Run application logic here...

if __name__ == "__main__":
    main()
```

---

### Example B: Graphical User Interface (Tkinter Desktop App)

```python
import tkinter as tk
from tkinter import messagebox, simpledialog
from x_license_python import XLicenseClient

class LicensedApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("My Enterprise Tool")
        self.geometry("480x320")

        self.client = XLicenseClient(on_license_revoked=self.on_revoked)
        self.check_license()

    def check_license(self):
        # Attempt auto-login
        res = self.client.auto_login()
        if not res.success:
            key = simpledialog.askstring("Activation", "Please enter your license key:")
            if not key:
                self.destroy()
                return
            res = self.client.login(key)

        if res.success:
            self.show_main_screen()
        else:
            messagebox.showerror("Activation Failed", res.message)
            self.destroy()

    def show_main_screen(self):
        for widget in self.winfo_children():
            widget.destroy()

        tier = self.client.get_tier()
        tk.Label(self, text=f"Welcome! License Tier: {tier}", font=("Arial", 14, "bold")).pack(pady=20)
        tk.Label(self, text=f"HWID: {self.client.get_hwid()}", font=("Arial", 9), fg="gray").pack(pady=5)

        tk.Button(self, text="Log Out", command=self.handle_logout).pack(pady=20)

    def handle_logout(self):
        if messagebox.askyesno("Log Out", "Unlink license from this PC?"):
            self.client.logout(clear_saved_license=True)
            self.destroy()

    def on_revoked(self, reason: str):
        messagebox.showerror("License Revoked", f"Your license has been suspended or revoked:\n{reason}")
        self.destroy()

if __name__ == "__main__":
    app = LicensedApp()
    app.mainloop()
```

---

### Example C: Headless Automation / Background Worker

```python
import time
import sys
from x_license_python import XLicenseClient

def main():
    # Pass configuration directly
    client = XLicenseClient(
        app_name="data_sync_service",
        server_url="https://license.example.com",
        auto_logout_on_exit=True
    )

    # In a headless daemon, read key from environment variable
    import os
    env_key = os.getenv("LICENSE_KEY")

    res = client.auto_login()
    if not res.success and env_key:
        res = client.login(env_key)

    if not res.success:
        print(f"FATAL: Service cannot start without active license: {res.message}", file=sys.stderr)
        sys.exit(1)

    print(f"Service running with tier: {client.get_tier()}")

    # Main operational loop
    while client.is_authenticated():
        # Do work...
        time.sleep(60)

if __name__ == "__main__":
    main()
```

---

## 11. API Class & Method Reference

### `XLicenseClient`

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `__init__` | `config_path=None, config=None, app_name=None, server_url=None, on_license_revoked=None, ...` | `None` | Instantiates client. Auto-discovers config file if none provided. |
| `login` | `license_key: str` | `LoginResult` | Validates key online, locks device slot, starts 20-min heartbeat daemon. |
| `auto_login` | None | `LoginResult` | Loads saved session from OS temp storage and re-authenticates online. |
| `logout` | `clear_saved_license: bool = True` | `bool` | Unbinds HWID from server, frees device slot, optionally clears cached key. |
| `ping` | None | `Dict[str, Any]` | Executes on-demand server heartbeat ping. |
| `is_authenticated` | None | `bool` | Returns `True` if active valid session is present. |
| `get_tier` | None | `str` | Returns license tier name (e.g. `Standard`, `Pro`, `Enterprise`). |
| `get_hwid` | None | `str` | Returns deterministic hardware identifier string. |
| `get_device_telemetry` | None | `Dict[str, Any]` | Returns comprehensive hardware, OS, network, and timezone dict. |
| `get_license_info` | None | `Optional[Dict]` | Returns full verified JSON payload from license server. |

### `LoginResult` Dataclass

| Attribute | Type | Description |
|---|---|---|
| `success` | `bool` | `True` if authentication succeeded and license is active. |
| `status_code` | `int` | HTTP response code (e.g., `200`, `403`, `404`, `426`). |
| `message` | `str` | Human-readable explanation from server. |
| `code` | `str` | Programmatic error code (e.g. `OK`, `KEY_NOT_FOUND`, `DEVICE_LIMIT_REACHED`). |
| `hwid` | `Optional[str]` | The machine HWID that was authenticated. |
| `license_key` | `Optional[str]` | The normalized license key string. |
| `license_data` | `Optional[Dict]` | Verified payload containing tier, expiry, limits, etc. |

---

## 12. Server Response & Error Code Reference

| Error Code | HTTP Status | Meaning | Recommended User Action |
|---|---|---|---|
| `OK` | 200 | License valid and device slot active | Grant full application access |
| `KEY_NOT_FOUND` | 404 | Key does not exist in server database | Ask user to double-check their key |
| `DEVICE_LIMIT_REACHED` | 403 | Max allowed devices are already active | Close app on other PC, or upgrade license |
| `DEVICE_UNBOUND` | 403 | Device was unlinked or logged out | Re-authenticate via `login()` |
| `LICENSE_EXPIRED` | 403 | License validity duration has elapsed | Prompt user to renew license |
| `LICENSE_REVOKED` | 403 | Administrator revoked license | Terminate application access |
| `LICENSE_SUSPENDED`| 403 | Administrator temporarily suspended license | Notify user to contact support |
| `LICENSE_APP_MISMATCH` | 403 | Key is for a different product | Prompt user for the correct product key |
| `APP_VERSION_OUTDATED` | 426 | App version is below `min_version` | Direct user to download software update |
| `CLOCK_TAMPERED` | 403 | Local machine clock differs from server | Instruct user to sync system clock |
| `SIGNATURE_FAILED` | 403 | Cryptographic Ed25519 signature mismatch | Reject untrusted or spoofed server |

---

## 13. FAQ & Troubleshooting

### Q1: Can a user run my software without internet access?
**A:** By design, the VCON SDK enforces strict online security. The initial activation and session restorations require an active internet connection to contact your license server.

### Q2: What happens if the network drops temporarily while using the app?
**A:** The 20-minute background daemon handles intermittent network errors gracefully. Temporary connection drops do not immediately terminate the application. Only explicit rejection responses (such as `403 LICENSE_REVOKED` or `DEVICE_UNBOUND`) trigger termination.

### Q3: How do I compile my Python app into an executable (`.exe` or macOS `.app`)?
**A:** Use PyInstaller or Nuitka:
```bash
pyinstaller --onefile --add-data "my_app_vcon_config.json:." main.py
```
Because the SDK includes native `urllib` standard-library fallbacks, it bundles cleanly without requiring complex PyInstaller hidden imports.

---
*VCON License Management System — Production-Grade Software Protection.*
