# LicenX Project Guide

এই নথি LicenX-এর বর্তমান product behavior ও feature boundary ব্যাখ্যা করে। নতুন developer বা AI agent যেন feature-এর উদ্দেশ্য, user flow, PIN-এর scope, এবং কোন অংশ কোথায় implemented—এসব নিয়ে অনুমান না করে, সে জন্য এটি source code ও SDK implementation অনুসারে লেখা।

> **সবার আগে:** এই guide এবং `AI_INSTRUCTIONS.md` পড়ুন। Root `AGENTS.md`-ও এই project rules বাধ্যতামূলক করেছে। Existing feature/behavior না বদলে, scope-locked bug fix করুন; documentation আর implementation-এ অমিল দেখলে code দেখে যাচাই করুন এবং intended behavior user-এর সঙ্গে নিশ্চিত না করে feature বদলাবেন না।

## সূচি

- [এক নজরে](#এক-নজরে)
- [System ও access boundary](#system-ও-access-boundary)
- [PIN: কেন, কোথায়, কীভাবে](#pin-কেন-কোথায়-কীভাবে)
- [Client application ও Python SDK](#client-application-ও-python-sdk)
- [Customer self-service portal](#customer-self-service-portal)
- [Admin panel](#admin-panel)
- [License ও device lifecycle](#license-ও-device-lifecycle)
- [API surface](#api-surface)
- [গুরুত্বপূর্ণ source map](#গুরুত্বপূর্ণ-source-map)
- [Implementation boundary ও maintenance](#implementation-boundary-ও-maintenance)

## এক নজরে

LicenX একটি license-management system। এতে রয়েছে:

1. **LicenX server** — license, application scope, device binding, heartbeat, signatures ও audit events পরিচালনা করে।
2. **Admin dashboard** — `/vcon`-এ administrator application ও license manage করেন।
3. **Public customer portal** — `/`, `/home`, বা `/check`-এ customer সীমিত license status দেখতে পারেন এবং PIN দিয়ে নিজের device binding নিয়ন্ত্রণ করতে পারেন।
4. **Client integration** — REST validation API এবং `SDK/x_license_python/`-এ Python SDK দিয়ে application license validate করে ও device slot ব্যবহার করে।

Server implementation-এর দুটি runtime আছে: Node/Express এবং Cloudflare handler। উভয় runtime-এ একই product behavior বজায় রাখার উদ্দেশ্য রয়েছে।

## System ও access boundary

| Actor | কোথায় | কী করতে পারে | কী দিয়ে access হয় |
|---|---|---|---|
| Administrator | `/vcon` dashboard | Apps, licenses, devices, settings ও logs manage | Setup-এর admin account, এরপর admin authentication token |
| Customer / license holder | Public portal | সীমিত status check; নিজের license-এর details দেখা; সব bound device reset | License key এবং control/reset-এর জন্য license PIN |
| Licensed client application | Client SDK বা API | License online validate, HWID bind, heartbeat এবং logout | License key, app identifier/version, HWID; **PIN নয়** |

Admin token, customer PIN এবং client license key আলাদা credential/flow। Customer PIN administrator credentials নয়, এবং client login-ও নয়।

## PIN: কেন, কোথায়, কীভাবে

### উদ্দেশ্য

License PIN হলো **customer self-service portal-এর control credential**। License holder-কে support/admin-এর সাহায্য ছাড়াই নিজের license-এর bound device দেখতে এবং device slot reset করতে দেয়।

### PIN কোন কাজে লাগে

1. Public portal-এর **Control / Manage License** অংশ খুলতে:
   - License key + ঐ license-এর PIN জমা হয়।
   - সফল হলে license-এর details এবং associated device records দেখানো হয়।
2. **Reset Devices** নিশ্চিত করতে:
   - একই license key + PIN দিয়ে ঐ license-এর সব bound devices reset/log out করা হয়।
   - পরের client activation-এ খালি device slot ব্যবহার করা যায়।
3. Public portal-এর ভুল PIN অনুমান কমাতে:
   - Control-open ও reset endpoint-এ license এবং client IP অনুযায়ী persistent failure counter ব্যবহৃত হয়।
   - বর্তমান নীতিতে ১৫ মিনিটের window-তে পঞ্চম ভুল প্রচেষ্টার পর ১৫ মিনিটের lockout/HTTP 429 হয়; response-এ `Retry-After` দেওয়া হয়।
   - সফল PIN verification হলে সংশ্লিষ্ট failure state clear হয়।

### PIN কোথায় ব্যবহৃত হয় না

- Python SDK-এর `XLicenseClient.login()` বা `auto_login()`-এ **PIN প্রয়োজন নেই**।
- Client `/v1/license/validate` request-এ PIN পাঠায় না; server validation license PIN দিয়ে client activation reject করে না।
- PIN heartbeat, logout, signature verification বা admin login credential নয়।
- SDK-তে `pin=` নামে legacy optional argument এখনো backward compatibility-র জন্য থাকতে পারে; দিলে সেটি **ignore** হয়—কোনো validation request-এ পাঠানো হয় না। নতুন integration-এ argument ব্যবহার করবেন না।

### PIN তৈরি ও admin-এর দায়িত্ব

- নতুন license তৈরির সময় server চার অঙ্কের numeric PIN তৈরি করে; বর্তমান generator-এর range `1000`–`9999`।
- Portal form চার character পর্যন্ত নেয় এবং UI-তে চার character না হলে submit করা যায় না। Server endpoint non-empty PIN-কে stored PIN-এর সঙ্গে মেলায়; server-side-এ digit-only বা exact four-character format আলাদা করে enforce হয় না। তাই intended numeric PIN format বজায় রাখুন।
- Bulk-created license batch-এ UI একই generated batch PIN ওই batch-এর license-গুলোর সঙ্গে দেখায়/export করে।
- Admin license record edit করে PIN update করতে পারেন; license list/create flow-তে key ও PIN copy/export করার ব্যবস্থাও আছে।
- License holder-কে license key এবং PIN নিরাপদে দিতে হবে। PIN customer-কে portal control/reset-এর জন্য; client app-এর login dialog বা client config-এ যোগ করা যাবে না।
- PIN চার অঙ্কের হওয়ায় একে শক্তিশালী cryptographic secret বা admin authentication-এর বিকল্প মনে করবেন না। Portal rate limit-ও বজায় রাখতে হবে।

## Client application ও Python SDK

Client app-এর কাজ হলো নিজের license বৈধ কি না server থেকে যাচাই করে প্রয়োজনীয় device slot ব্যবহার করা। **PIN ছাড়াই client login হবে।** SDK user interface বা license-purchase system সরবরাহ করে না; app developer login prompt ও license-denied behavior নিজের app-এ implement করেন।

### Client-এর প্রধান workflow

1. `XLicenseClient`-কে server/app configuration দিয়ে initialize করা হয়।
2. সাধারণত শুরুতে `auto_login()` চেষ্টা হয়; saved license না থাকলে app end-user-এর কাছ থেকে license key নিয়ে `login(key)` চালায়।
3. SDK online `/v1/license/validate` request করে; request-এ license key, app name/version, HWID এবং device telemetry থাকে।
4. Server license status, expiry, app scope এবং device limit যাচাই করে; গ্রহণ করলে current device bind/update করে এবং signed response দেয়।
5. সফল login-এর পর app `LoginResult`, `is_authenticated()`, `get_tier()`, `get_license_info()` দিয়ে ফল ও license তথ্য ব্যবহার করতে পারে।
6. Background heartbeat চালু থাকলে SDK নির্ধারিত interval-এ license status re-check করে। Server license/device invalid করলে `on_license_revoked` callback ডাকে।
7. App logout করলে বা configured graceful process-exit hook চললে SDK server-কে logout জানায়, device slot ছাড়ে এবং configuration অনুযায়ী saved session মুছে বা রেখে দেয়।

### Python SDK-এর feature তালিকা

| Feature | কেন / কখন | কোথায় |
|---|---|---|
| Configuration | Server URL, app identity/version, pinned public key, timeout ও behavior set করতে | `SDKConfig` (`config.py`); config file auto-discovery-ও আছে |
| Online license login | User-এর key দিয়ে license ও current device validate/bind করতে | `XLicenseClient.login()` |
| Saved-session auto-login | পরের launch-এ key prompt কমাতে; তবু server online validation আবশ্যক | `XLicenseClient.auto_login()` |
| Device fingerprint / telemetry | Device limit প্রয়োগ ও validation request-এ machine context দিতে | `DeviceManager.get_hwid()`, `get_device_telemetry()` |
| Signed response verification | Server-এর license response integrity/authenticity যাচাই করতে | `ServerCommunicator.validate_license()` |
| Heartbeat / on-demand ping | Active session পরবর্তীতে revoke/expire/unbind হয়েছে কি না দেখতে | Background worker এবং `XLicenseClient.ping()` |
| Revocation callback | Server থেকে rejection এলে app-কে protected feature বন্ধ করার সুযোগ দিতে | `on_license_revoked` callback |
| Logout / slot release | Session শেষ হলে device binding slot ছাড়তে | `XLicenseClient.logout()` এবং configured exit hooks |
| Local session storage | Auto-login-এর জন্য saved key/session রাখতে | `BackgroundLicenseWorker` / `storage.py` |
| Clock-drift check | Server time-এর তুলনায় system clock mismatch শনাক্ত করতে | `OfflineGuard` |
| HTTP transport fallback | `requests` থাকলে সেটি, না থাকলে standard-library `urllib` ব্যবহার করতে | `server.py` |

SDK public API-র মূল methods:

| Method | কাজ |
|---|---|
| `login(license_key)` | License online validate করে; PIN নেয় না/ব্যবহার করে না |
| `auto_login()` | Saved key পড়ে online validation করে |
| `logout(clear_saved_license=True)` | Active binding ছাড়ে; option অনুযায়ী saved session রাখে বা মুছে |
| `is_authenticated()` / `is_valid()` | বর্তমান process-এর auth state জানায় |
| `get_license_info()` / `get_tier()` / `get_current_key()` | বর্তমান সফল validation-এর license তথ্য দেয় |
| `get_hwid()` / `get_device_telemetry()` | SDK-এর current machine identifier/context দেয় |
| `ping()` | Active/saved session-এর জন্য on-demand heartbeat করে |

> **Offline entitlement নয়:** Saved session থাকলেও `auto_login()` server validation করে। Local saved key-কে offline authorization ধরে নেবেন না।

### SDK configuration-এর গুরুত্বপূর্ণ field

বর্তমান `SDKConfig`-এর field-গুলো `config.py`-তে defined:

- `server_url`, `public_key_pem`
- `app_name`, `display_name`, `min_version`
- `ping_interval_seconds`, `request_timeout_seconds`
- `auto_login_enabled`, `auto_save_session`
- `enable_background_heartbeat`, `auto_logout_on_exit`
- `strict_online_only`

Admin dashboard-এর Applications অংশ থেকে app-specific client config download করা যায়। SDK integration-এ **বর্তমান `SDKConfig` field ও shipped SDK guide** অনুসরণ করুন; পুরোনো README snippet-এ থাকা অচেনা constructor parameter কপি করবেন না।

### Python-এর বাইরে client integration

Admin-এর Client Code tab-এ Python, cURL, Node.js ও C# sample দেখানো হয়। এগুলো integration starting point/sample; repository-তে maintained turnkey client SDK হলো `SDK/x_license_python/`। Other-language examples-কে Python SDK-র সমান feature-complete ধরে নেওয়া যাবে না।

## Customer self-service portal

Public landing/customer portal-এ admin dashboard login লাগে না।

### Quick license check

- Customer license key দিয়ে public check চালায়।
- Response/UI-তে intended limited fields হলো status, allowed device limit এবং active device count।
- এটি admin dashboard নয়; full device/license control unlock করে না।
- Site Settings-এ public check-এর on/off toggle রয়েছে। **বর্তমান code-এ এই flag public portal/API behavior-এ প্রয়োগ হতে দেখা যায়নি**; তাই toggle-টিকে access-control guarantee ধরে নেবেন না।

### License control ও reset

- Customer key + PIN দিয়ে control view খোলে।
- Control view-তে license details এবং associated bound device entries দেখায়।
- Customer reset confirm করলে ঐ license-এর device rows logout/reset হয়; client application পরবর্তী login/validation-এ slot আবার ব্যবহার করতে পারে।
- Site Settings-এ self-service reset-এর on/off toggle-ও রয়েছে, কিন্তু **বর্তমান code-এ flag-টি portal/API endpoint-এ প্রয়োগ হতে দেখা যায়নি**। Reset endpoint-কে public access থেকে আটকানোর guarantee হিসেবে toggle-টির ওপর নির্ভর করা যাবে না।
- ভুল PIN attempts rate-limited; valid PIN ছাড়া control/reset অনুমোদিত হওয়া উচিত নয়।

## Admin panel

Dashboard path `/vcon`। প্রথমবার setup-এ admin username/password তৈরি হয়; পরবর্তী dashboard access-এ admin login প্রয়োজন। Admin APIs-তে authenticated token ব্যবহৃত হয়।

| Tab / area | উদ্দেশ্য ও কাজ |
|---|---|
| **Overview** | মোট apps/licenses, active/expired/revoked/suspended licenses, active HWIDs ও সাম্প্রতিক validation activity-এর summary; দ্রুত refresh এবং create/bulk workflows-এ যাওয়া। |
| **Applications** | App slug, display name, minimum version ও descriptionসহ app record তৈরি/সম্পাদনা/মুছুন; activate/deactivate, search/filter/bulk action; app-specific client config download। |
| **Licenses** | Single/bulk license issue; key, PIN, tier, app scope, validity, device limit (নির্দিষ্ট count বা unlimited), customer metadata ও notes manage; search/filter/copy/export; edit status/PIN; extend validity, reset devices, force logout, delete। |
| **Devices** | Bound device/HWID, license, machine/OS, IP, status ও last heartbeat দেখুন; search, refresh এবং device unbind/remove করুন। |
| **Logs** | Validation/rejection audit entries filter ও inspect করুন—status code, action, license key, HWID, message, IP, time; প্রয়োজন হলে logs clear করুন। |
| **Simulator** | App/version, license key, HWID, device name ও OS দিয়ে server validation flow পরীক্ষা করুন এবং response দেখুন। |
| **Client Code** | Python/cURL/Node.js/C# integration sample দেখুন, Python SDK ZIP download করুন। |
| **Profile** | Admin profile/auth details এবং administrator credential update-সংক্রান্ত controls। |
| **Site Settings** | Public portal name/tagline/title/SEO, logo/favicon/OG image, support/documentation/buy links, footer, notice banner, public check/reset toggles customize করুন। |
| **Settings** | R2 storage configuration/test, crypto public-key view/copy ও key rotation, admin credentials/security, backup records ও system settings manage। |

### License administration-এর মূল ধারণা

- **App scope:** License নির্দিষ্ট app-এ সীমাবদ্ধ হতে পারে; global license-ও থাকতে পারে। App-scoped client validation-এ app identity পাঠাতে হবে।
- **Validity:** UI-তে hourly, daily বা lifetime validity বেছে নেওয়া যায়। Non-lifetime license-এর validity value মেয়াদ নির্ধারণ করে।
- **Device limit:** License কতগুলো active HWID slot অনুমোদন করবে তা নির্ধারণ করে।
- **Status:** License active, suspended, expired বা revoked অবস্থায় থাকতে পারে; server validation ও heartbeat সেই state অনুযায়ী অনুমতি/প্রত্যাখ্যান করে।
- **Reset/unbind:** Admin একটি device বা license-এর device bindings reset করতে পারে। এটি client-এর session invalid করে এবং slot ছাড়ে; এটি license key/PIN-এর সমার্থক নয়।

## License ও device lifecycle

```text
Admin app + license তৈরি করেন
             │
             ├── Customer পায় license key + portal PIN
             │
             ├── Client app: license key + app identity + HWID দিয়ে online validate
             │       └── PIN পাঠায় না; সফল হলে server device slot bind করে
             │
             └── Customer portal: key + PIN দিয়ে details/control খোলে
                     └── PIN দিয়ে সব client device binding reset করতে পারে
```

Client login সফল হওয়া এবং customer portal control খুলতে পারা—দুটি আলাদা authorization path। Portal PIN পরিবর্তন/হারালে সেটি client license validation semantics বদলায় না; admin-এর license-management flow-তে PIN দেখুন বা update করুন।

## API surface

Route-গুলো Node API router এবং Cloudflare handler-এ implement করা আছে। Prefix deployment/runtime অনুযায়ী `/api` হতে পারে।

### Customer/client-facing endpoints

| Endpoint | ব্যবহার | Credential/notes |
|---|---|---|
| `POST /v1/user/license/check` | সীমিত public license status/device count check | License key; public-check toggle বর্তমানে enforcement করে বলে নিশ্চিত নয় |
| `POST /v1/user/control/open` | Customer license control data পড়া | License key + PIN; failed-attempt limit প্রযোজ্য |
| `POST /v1/user/control/reset` | Customer-এর সব device binding reset | License key + PIN; failed-attempt limit প্রযোজ্য |
| `GET /v1/public-key` | Client verification key পাওয়া | Public endpoint |
| `POST /v1/license/validate` | Client license validate / device bind | License key, HWID, app/version/telemetry; **PIN ignored/not required** |
| `POST /v1/license/ping` | Client heartbeat | License key, HWID, app context |
| `POST /v1/license/logout` | Client-এর current device logout/unbind | License key + HWID |

### Admin-facing endpoint groups

Admin-authenticated API groups include setup/auth, `/apps`, `/licenses`, `/devices`, `/stats`, `/logs`, `/settings`, R2 backup/configuration, site settings এবং crypto key rotation। Exact request/response contract route implementation-এ দেখুন; এই summary পূর্ণ API schema নয়।

## গুরুত্বপূর্ণ source map

| Concern | Source |
|---|---|
| App shell, `/vcon` dashboard routing ও tabs | `src/App.tsx` |
| Shared frontend API client ও admin token | `src/services/apiClient.ts` |
| Shared TypeScript data contracts | `src/types.ts` |
| Customer portal, PIN forms ও customer reset UX | `src/components/LandingPage.tsx` |
| Admin navigation | `src/components/Sidebar.tsx` |
| License validate/control/reset backend | `src/server/api.ts`, `src/server/cloudflareHandler.ts` |
| PIN rate limiting | `src/server/userControlRateLimit.ts` এবং DB initialization |
| License PIN cryptographic generation | `src/server/crypto.ts` |
| Python SDK public facade | `SDK/x_license_python/client.py` |
| Python login/session orchestration | `SDK/x_license_python/login.py`, `storage.py`, `logout.py` |
| Python HTTP/signature protocol | `SDK/x_license_python/server.py` |
| Python configuration/HWID/clock policy | `SDK/x_license_python/config.py`, `device.py`, `offline.py` |
| Python SDK guides | `SDK/x_license_python/docs/GUIDE_EN.md`, `GUIDE_BN.md` |

## Implementation boundary ও maintenance

- This guide documents current intended usage and current repository surfaces; it does not authorize a feature change.
- PIN semantics-এর boundary: **portal control/reset-এ PIN; client validation/login-এ PIN নেই**। এই boundary বদলাতে হলে explicit product requirement ও cross-runtime/SDK tests প্রয়োজন।
- নতুন বা সংশোধিত UI/backend capability হলে code, both runtime handlers, API client, tests এবং এই guide—যেখানে প্রাসঙ্গিক—একসঙ্গে মিলিয়ে update করুন।
- Node ও Cloudflare route behavior এক রাখুন; শুধু একটি runtime-এ behavior change করে থেমে যাবেন না।
- Client SDK-এর signature বা parameters পাল্টালে saved sessions, config compatibility, heartbeat/logout এবং documented API usage যাচাই করুন।
- Key, PIN, HWID, IP এবং signing keys সংবেদনশীল licensing/security data। Logs, public responses, examples বা commits-এ real credentials/PII প্রকাশ করবেন না।
- Verification-এ targeted regression tests এবং `npm run lint`/`npm run build` প্রয়োজন অনুযায়ী ব্যবহার করুন। Live deployment বা production database পরীক্ষা না করে সেগুলো সম্পন্ন হয়েছে বলে দাবি করবেন না।

## Current version references

- Application package version: `package.json`
- Python SDK version: `SDK/x_license_python/__init__.py`
- For the current audit findings/fix history, see ignored local note `notes/LICENSING_AUDIT.md` when available. This file is intentionally not part of tracked project documentation.
