#!/usr/bin/env python3
"""
Example Application demonstrating VCON Python Client SDK (x_license_python)
"""

import os
import sys
import time

# Robust path handling whether run standalone or as part of a package
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR = os.path.dirname(_SCRIPT_DIR)
for _p in (_PARENT_DIR, _SCRIPT_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from x_license_python import XLicenseClient
except ImportError:
    from client import XLicenseClient


def on_revoked_callback(reason: str):
    print(f"\n[ALERT] License was revoked or device unbind triggered remotely: {reason}")
    print("[ALERT] Shutting down premium features...")
    sys.exit(1)


def main():
    print("=" * 60)
    print("   VCON Production Python Application Protection Demo")
    print("=" * 60)

    # 1. Initialize Client (Auto-loads <app_name>_vcon_config.json from project dir)
    client = XLicenseClient(on_license_revoked=on_revoked_callback)
    
    print(f"[*] Target Application Scope : {client.config.app_name}")
    print(f"[*] Target Server URL        : {client.config.server_url}")
    print(f"[*] Device HWID              : {client.get_hwid()}")
    print("-" * 60)

    # 2. Try Auto Login from saved temp session
    print("[*] Attempting Auto-Login with saved session...")
    login_res = client.auto_login()

    if not login_res.success:
        print(f"[-] Auto-login skipped ({login_res.message})")
        # 3. Prompt user for license key
        try:
            key_input = input("\n[?] Please enter your License Key: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting...")
            sys.exit(0)

        if not key_input:
            print("[!] License key cannot be empty.")
            sys.exit(1)

        print("[*] Authenticating with license server...")
        login_res = client.login(key_input)

    # 4. Check Authentication outcome
    if not login_res.success:
        print(f"\n[X] LOGIN FAILED [{login_res.status_code}]: {login_res.message}")
        print(f"    Error Code: {login_res.code}")
        sys.exit(1)

    print("\n[+] ===========================================")
    print("[+] ACCESS GRANTED! Application Unlocked")
    print(f"[+] License Tier     : {client.get_tier()}")
    print(f"[+] Bound HWID       : {login_res.hwid}")
    info = client.get_license_info()
    if info:
        print(f"[+] Device Limit     : {info.get('bound_devices_count')}/{info.get('device_limit')}")
        print(f"[+] Expires At       : {info.get('expires_at')}")
    print("[+] Background Check : Active (Every 20 mins)")
    print("[+] ===========================================\n")

    print("[*] Running core application logic...")
    print("[*] (Press Ctrl+C to test graceful auto-logout and instant HWID slot release)\n")

    try:
        counter = 1
        while client.is_authenticated():
            time.sleep(2)
            print(f"[App Loop] Processing task #{counter}... (License active: {client.get_current_key()})")
            counter += 1
            if counter > 5:
                break
    except KeyboardInterrupt:
        print("\n[*] User interrupted application.")

    print("\n[*] Exiting application... Auto-logout will unbind HWID from server now.")


if __name__ == "__main__":
    main()
