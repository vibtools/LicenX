<div align="center">

# 🛡️ LicenX

### Enterprise Software Licensing & Cryptographic Hardware Authorization Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-green.svg)](https://nodejs.org/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages%20%26%20Workers-f38020.svg)](https://pages.cloudflare.com/)
[![Database](https://img.shields.io/badge/Database-Turso%20%7C%20libSQL%20%7C%20SQLite-4433ff.svg)](https://turso.tech/)
[![Security](https://img.shields.io/badge/Crypto-RSA--2048%20%26%20Ed25519-indigo.svg)](https://github.com/)
[![Python SDK](https://img.shields.io/badge/Client%20SDK-Python%203.8%2B-yellow.svg)](./SDK/x_license_python/)

<p align="center">
  A high-security, distributed software licensing server and hardware fingerprint authorization engine. Built for native execution on <b>Node.js / Docker</b> and <b>Cloudflare Pages Functions (Edge Workers)</b> with instant zero-cold-start verification, automated hardware locking (HWID), anti-tampering guards, and self-service customer device reset.
</p>

[Key Features](#-key-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Cloudflare Deployment](#-cloudflare-pages-deployment) • [Python SDK](#-python-client-sdk) • [API Reference](#-api-endpoints) • [License](#-license)

</div>

---

## 🚀 Key Features

### 🔐 Cryptographic Integrity & Anti-Piracy
- **RSA-2048 / Ed25519 Asymmetric Signatures:** Every license payload is digitally signed by the server's private key. Client apps verify authenticity using standard public key cryptography without sending secrets.
- **Hardware Lock (HWID Fingerprinting):** Unique client device fingerprinting (CPU, motherboard, OS, disk UUID, and MAC address hashing) to strictly enforce machine limits per license.
- **Clock Tampering & Replay Protection:** Timestamp-drift detection, monotonic clock checks, and anti-replay nonce tracking.
- **Heartbeat & Session Tracking:** Background daemon ping worker maintaining active session state with automatic stale lease reclamation.

### ⚡ Dual-Runtime Architecture
- **Node.js / Express Server:** Run locally, on VPS, AWS, GCP, Render, or Docker with standard Node 18+.
- **Cloudflare Pages & Functions (Edge):** 100% serverless edge deployment with global low-latency responses, zero server maintenance, and automatic scaling.
- **Turso / libSQL / SQLite Support:** Distributed edge SQLite database with zero connection pooling bottlenecks.
- **Cloudflare R2 Bucket Storage:** Native cloud object storage for automatic bulk CSV license backups and custom brand assets (Logo, Favicon, OG share cards).

### 🎛️ Unified Admin Panel & Live Tools
- **Applications Hub:** Manage multi-tenant applications with custom slugs, version enforcement, and auto-generated client configs.
- **License Engine:** Issue single or bulk licenses (up to 2,000 keys per batch in a single atomic database transaction) with custom prefixes, validity tiers, device limits, and 4-digit PINs.
- **HWID Tracker & Device Inspector:** Live list of bound client hardware with one-click hardware detachment and force logout.
- **Real-Time Audit Trail:** Comprehensive logs recording IP addresses, HWID fingerprints, status codes, and request durations.
- **Cryptographic Simulator:** Interactive in-browser validator to test RSA signatures and test payload responses.
- **Site Settings & Branding Control:** Full white-label customization of App Logo, Favicon, OG Image, SEO tags, support links (Telegram, Discord, Email), announcement banners, and public portal rules.

### 🌐 Self-Service Customer License Portal
- **3-Metric Quick Check:** Safe public validation (status, device limit, and active bound count) without exposing private data.
- **Self-Service HWID Reset:** Customers can securely reset their hardware bindings anytime using their private 4-digit PIN without needing admin intervention.

---

## 🏛️ Architecture

```
                    ┌─────────────────────────┐
                    │      Client Apps        │
                    │   (Python, C#, Electron)│
                    └───────────┬─────────────┘
                                │ HTTPS Requests
                                ▼
         ┌──────────────────────────────────────────────┐
         │              LicenX Gateway                  │
         │  (Node.js Server or Cloudflare Edge Worker)  │
         └───────┬──────────────────────────────┬───────┘
                 │                              │
         ┌───────▼──────────────┐       ┌───────▼──────────────┐
         │     Turso / libSQL   │       │    Cloudflare R2     │
         │    Distributed SQLite│       │  Backup & Asset Store│
         └──────────────────────┘       └──────────────────────┘
```

---

## 📦 Quick Start

### 1. Prerequisites
- **Node.js 18+** or **20+**
- **npm** or **pnpm**
- *(Optional)* A free [Turso](https://turso.tech/) database and [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) bucket for cloud persistence.

### 2. Clone & Install

```bash
git clone https://github.com/your-username/LicenX.git
cd LicenX
npm install
```

### 3. Environment Setup

Create your `.env` file:

```bash
cp .env.example .env
```

Configure your environment variables:

```env
# Server Port
PORT=3000

# Turso / libSQL Cloud Database (Optional for local SQLite file fallback)
TURSO_DATABASE_URL="libsql://your-db-org.turso.io"
TURSO_AUTH_TOKEN="your-turso-auth-token"

# Cloudflare R2 Object Storage (Optional for backups & image uploads)
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="licenx-storage"
R2_PUBLIC_URL="https://assets.yourdomain.com"
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the Setup Wizard and initialize your administrator account.

### 5. Production Build

```bash
npm run build
npm start
```

---

## ⛅ Cloudflare Pages Deployment

LicenX includes first-class support for **Cloudflare Pages with Pages Functions**:

1. **Connect Repository:** Link your GitHub repository to Cloudflare Pages.
2. **Build Settings:**
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Compatibility Flags:**
   - Ensure `nodejs_compat` is enabled under **Settings > Functions > Compatibility Flags**.
   - Compatibility Date: `2024-09-23` or newer.
4. **Environment Variables:**
   - Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
   - Add R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`).

---

## 🐍 Python Client SDK

LicenX provides a production-ready, zero-dependency Python client SDK located at [`SDK/x_license_python/`](./SDK/x_license_python/).

### Installation

Download `x_license_python.zip` directly from the Admin Panel or copy the `SDK/x_license_python/` folder into your project.

### Basic Integration

```python
from x_license_python import XLicenseClient, SDKConfig

# 1. Initialize Client
config = SDKConfig(
    server_url="https://licenx.yourdomain.com",
    app_id="my-desktop-tool",
    app_version="1.0.0",
    heartbeat_interval_sec=1200,   # 20-minute heartbeat
    auto_save_session=True,        # Offline caching
    auto_login_enabled=True        # Auto-login on launch
)

client = XLicenseClient(config)

# 2. Authenticate
result = client.login(license_key="LICX-ABCD-1234-EF56")

if result.success:
    print(f"License Activated! Tier: {result.tier}")
    print(f"Expires at: {result.expires_at}")
    print(f"Bound Devices: {result.bound_devices}/{result.device_limit}")
else:
    print(f"Activation Failed: {result.error}")
```

### Manual Heartbeat & Logout

```python
# Check health on-demand
status = client.ping()
print("Session active:", status.get("valid"))

# Release device slot on application exit
client.logout()
```

---

## 🔌 API Endpoints

### Public & Client Verification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/license/validate` | Authenticate license, register HWID, and receive RSA-signed token |
| `POST` | `/v1/license/ping` | Heartbeat keep-alive verifying hardware binding |
| `POST` | `/v1/license/logout` | Release hardware lock slot upon app termination |
| `GET` | `/v1/public-key` | Retrieve server RSA-2048 public PEM key |
| `GET` | `/health` | Server uptime and health probe |

### Self-Service Customer Portal

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/v1/user/license/check` | Public quick status check (status, limit, active count only) |
| `POST` | `/v1/user/control/open` | Open device manager with 4-digit PIN authentication |
| `POST` | `/v1/user/control/reset` | Clear all bound hardware slots for license key |

### Admin Management *(Bearer Auth Required)*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/stats` | System overview telemetry and 24h request counters |
| `GET/POST`| `/api/apps` | List and register tenant applications |
| `GET/POST`| `/api/licenses` | Filter licenses and generate single/bulk keys |
| `POST` | `/api/licenses/bulk` | High-performance single-batch key issuance (up to 2,000 keys) |
| `POST` | `/api/licenses/bulk-action`| Bulk suspend, activate, revoke, reset, extend, or delete |
| `POST` | `/api/settings/upload` | Upload branding assets (Logo, Favicon, OG card) to Cloudflare R2 |
| `GET/POST`| `/api/settings/site-settings` | Configure global white-label site metadata & rules |

---

## 🔒 Security Best Practices

1. **Keep Private Keys Secure:** Never distribute the server's private cryptographic key. Client applications only require the public key.
2. **Use HTTPS:** Always serve LicenX behind SSL/TLS (Cloudflare provides this out of the box).
3. **Protect the Admin Password:** Admin passwords are hashed with `scrypt` using unique cryptographically random salts.

---

## 🤝 Contributing

Contributions, bug reports, and pull requests are welcome! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) guide before getting started.

---

## 📄 License

This project is open-source and licensed under the **[MIT License](./LICENSE)**.  
Free for personal and commercial software distribution.
