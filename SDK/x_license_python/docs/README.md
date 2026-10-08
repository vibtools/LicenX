# 📚 VCON Python Client SDK Documentation (`docs/`)

Welcome to the documentation repository for the **VCON Python Client SDK (`x_license_python`)**.

---

## 🌐 Choose Your Preferred Language / ভাষা নির্বাচন করুন

- **[English Documentation: Complete A to Z Integration Guide (GUIDE_EN.md)](./GUIDE_EN.md)**
  _Comprehensive guide covering architecture, HWID node locking, 20-min daemon, Ed25519 signing, CLI & Tkinter examples, and full API reference._

- **[বাংলা ডকুমেন্টেশন: সম্পূর্ণ A to Z গাইডলাইন ও ব্যবহারের নিয়ম (GUIDE_BN.md)](./GUIDE_BN.md)**
  _আর্কিটেকচার, HWID লকিং, ২০-মিনিট ডেমন পিং, Ed25519 স্বাক্ষর, CLI ও Tkinter অ্যাপ ইন্টিগ্রেশন এবং সম্পূর্ণ API নির্দেশিকা।_

---

## ⚡ 60-Second Quick Start

Before running the SDK, place the Admin Panel-downloaded client config in the auto-discovery location and confirm it contains the trusted `public_key_pem`. License validation fails closed when this key is missing; a key returned by the server is not adopted automatically.

```python
from x_license_python import XLicenseClient

# 1. Initialize client (auto-discovers <app_name>_vcon_config.json)
client = XLicenseClient()

# 2. Attempt silent auto-login from cached session
result = client.auto_login()

# 3. If no session is saved, prompt user for key
if not result.success:
    key = input("Enter License Key: ").strip()
    result = client.login(key)

# 4. Check result
if result.success:
    print(f"Access Granted! Tier: {client.get_tier()}")
    print(f"Hardware HWID: {client.get_hwid()}")
else:
    print(f"Access Denied: {result.message}")
    exit(1)
```

---

## 📂 Documentation Directory Structure

```text
SDK/x_license_python/
├── docs/
│   ├── README.md        # This index documentation portal
│   ├── GUIDE_EN.md      # English complete A to Z developer manual
│   └── GUIDE_BN.md      # বাংলা সম্পূর্ণ A to Z ডেভেলপার ম্যানুয়াল
├── client.py            # High-level client facade (XLicenseClient)
├── config.py            # JSON config loader & auto-discovery
├── device.py            # Deterministic SHA-256 HWID & telemetry
├── example_app.py       # Runnable lifecycle CLI demo
├── login.py             # Strict online authentication manager
├── logout.py            # Graceful process exit hooks (atexit/signal)
├── offline.py           # Clock tamper & online policy enforcement
├── server.py            # Network transport (requests + urllib) & Ed25519
├── storage.py           # Temp session caching & 20-min daemon worker
└── requirements.txt     # Optional enhancement packages
```
