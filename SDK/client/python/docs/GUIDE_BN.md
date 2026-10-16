# LicenX Python SDK: অ্যাপ ইন্টিগ্রেশন A–Z

এই গাইডে `licenx` install, app configuration, license login, feature gating, heartbeat, callback, telemetry এবং logout ধাপে ধাপে দেখানো হয়েছে। সাধারণ app integration-এ `XLicenseClient` ব্যবহার করুন; SDK-এর internal manager-গুলো সরাসরি compose করার প্রয়োজন নেই।

## ১. Package Install

SDK-এর জন্য Python 3.8 বা নতুন সংস্করণ দরকার। Signed response যাচাইয়ে `cryptography` বাধ্যতামূলক। `requests` optional; এটি না থাকলে SDK Python-এর `urllib` ব্যবহার করতে পারে।

Repository root থেকে:

```bash
python -m pip install ./SDK/client/python/licenx
```

অথবা `SDK/client/python/licenx` directory থেকে:

```bash
python -m pip install .
```

কোনো release থেকে install করতে GitHub Release-এর `licenx` wheel download করে সেই wheel pip-এ দিন। Package বর্তমানে PyPI-তে published নয়।

## ২. App Config তৈরি

আপনার application root-এ `licenx.config.py` তৈরি করুন। এখানে শুধু literal settings রাখুন; loader file-টি execute করে না। Import, function call, environment lookup বা variable expression দেবেন না।

```python
app_config = {
    "server_url": "https://license.example.com",
    "public_key_pem": "",
    "app_name": "example_app",
    "display_name": "Example App",
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
}
```

`license.example.com` ও empty public key শুধু documentation placeholder। Intended environment-এর server URL দিন এবং trusted channel দিয়ে Admin-generated RSA বা Ed25519 public key provision করুন। এই ফাইলে license key বা private signing key রাখবেন না। `app_version`-এ আপনার app-এর চলমান release দিন; `min_version` server policy, এটি app version-এর বিকল্প নয়।

প্রতিটি field, default, type এবং limit-এর জন্য [Configuration guide](./CONFIGURATION.md) দেখুন। মনে রাখুন:

- Remote server-এর জন্য HTTPS বাধ্যতামূলক; HTTP শুধু explicitly configured loopback development endpoint-এ ব্যবহারযোগ্য।
- `ping_interval_seconds` exact integer ৬০–১,২০০; `offline_grace_seconds` exact integer ০–৩,৬০০।
- `public_key_pem`-এ valid trusted RSA বা Ed25519 public key লাগবে। খালি/invalid key থাকলে network request-এর আগেই config error হবে।
- `app_version` না থাকলে validation-এর আগে `APP_VERSION_REQUIRED` পাওয়া যাবে। `min_version` বসিয়ে এটি এড়াবেন না।
- `client_options` ও `sdk_fixed_constraints` sample-এ থাকলেও runtime-এ স্বয়ংক্রিয়ভাবে merge হয় না।

## ৩. Config কীভাবে খুঁজে পায়

সাধারণ app-এ:

```python
from licenx import XLicenseClient

client = XLicenseClient()
```

SDK বর্তমান working directory ও main script-এর directory-তে একটি unique `licenx.config.py` খোঁজে। Python config unique হলে সেটিই ব্যবহৃত হয়। Python ও legacy JSON একসঙ্গে থাকলে, অথবা একাধিক Python config থাকলে ambiguity error হয়। Python config না থাকলে legacy JSON discovery চলে; কোনো config না থাকলে SDK defaults নেয়, যা production-ready নয়।

Sibling `licenx.config.py`-কে `from licenx.config import app_config` দিয়ে import করবেন না। `licenx.config` হলো SDK-এর নিজের module; sibling config SDK path দিয়ে literal data হিসেবে পড়ে।

একটি explicit file বাছতে:

```python
client = XLicenseClient(config_path="licenx.config.py")
# Existing app-এর legacy JSON path-ও এখনও কাজ করে:
# client = XLicenseClient(config_path="my_app_vcon_config.json")
```

Explicit path missing বা invalid হলে error হবে; SDK নীরবে অন্য config বেছে নেবে না। নতুন integration-এ Python config ব্যবহার করুন, তবে legacy JSON deprecated নয়।

## ৪. Login এবং Protected Feature চালু করা

License key runtime-এ user-এর কাছ থেকে নিন। Key hard-code, config file-এ রাখা, log করা বা plain file-এ persist করা যাবে না। Console app-এ `getpass` ব্যবহার করা যায়:

```python
from getpass import getpass
from licenx import XLicenseClient


def on_license_revoked(reason: str) -> None:
    print(f"License session ended: {reason}")
    # আপনার app-কে protected কাজ থামাতে signal দিন।


def run_protected_application() -> None:
    # এখানে আপনার আসল application entry point বসান।
    pass


def main() -> int:
    client = XLicenseClient(on_license_revoked=on_license_revoked)
    try:
        license_key = getpass("License key: ").strip()
        result = client.login(license_key)

        if not result.success:
            print(f"License check failed: {result.code}: {result.message}")
            if result.request_id:
                print(f"Request ID: {result.request_id}")
            return 1

        print(f"License accepted. Tier: {client.get_tier()}")
        run_protected_application()
        return 0
    finally:
        if client.is_authenticated() and not client.logout():
            print("Warning: server logout confirm করেনি।")


if __name__ == "__main__":
    raise SystemExit(main())
```

`result.success` true হলেই protected feature চালু করুন। `LoginResult`-এ `success`, `status_code`, `message`, `code`, `license_data`, `hwid`, `license_key` এবং optional `request_id` থাকে। License key কখনো print করবেন না; `get_current_key()`-এর ফল log-এ দেবেন না।

`login(key, pin=None)`-এর পুরোনো `pin` argument শুধু compatibility-র জন্য আছে, SDK এটিকে ignore করে। License PIN হলো web-panel control-এর জন্য, SDK login-এর জন্য নয়।

## ৫. Login, Session এবং Logout

- `client.login(key)` online validation, signature verification ও device binding করে। Success হলে configured heartbeat চালু হয়।
- `client.is_authenticated()` এবং `client.is_valid()` local session state জানায়।
- `client.get_license_info()` success-এর পর verified license payload দেয়; `client.get_tier()` tier দেয়, session না থাকলে `"None"`।
- `client.logout()` heartbeat থামায়, local session clear করে এবং server-কে device binding ছাড়তে বলে। প্রয়োজন হলে return করা boolean পরীক্ষা করুন।
- `auto_logout_on_exit=True` default-এ `atexit`, `SIGINT`, `SIGTERM` cleanup hook থাকে। তবুও protected session শেষ হলে explicit logout করুন।

SDK license key persist করে না। তাই `auto_login()` সাধারণত `NO_SAVED_SESSION` দেয়; `auto_save_session` key সংরক্ষণ চালু করে না। আপনার app-এ অনুমোদিত OS credential vault থাকলে সেখান থেকে key নিজে নিয়ে `login()` call করুন।

## ৬. Heartbeat, Network Loss ও Revocation

Successful login-এর পর default `enable_background_heartbeat=True` daemon worker চালায়। Default interval ১,২০০ সেকেন্ড। Default `offline_grace_seconds=0`, অর্থাৎ transient network failure-তেও fail-closed। Positive grace শুধু transient connectivity/service failure-এর জন্য, সর্বোচ্চ ৩,৬০০ সেকেন্ড; explicit server denial, invalid signature/nonce এবং TLS error সঙ্গে সঙ্গে session invalidate করে।

`enable_background_heartbeat=False` দিলে automatic revocation ও grace-expiry checks বন্ধ থাকে। Host app-এর সমমানের monitoring না থাকলে এটি বন্ধ করবেন না।

On-demand check:

```python
response = client.ping()
if not response.get("valid", False):
    print(response.get("code", "PING_FAILED"))
```

Heartbeat callback worker thread থেকে call হতে পারে। GUI widget callback-এর ভিতরে সরাসরি update করবেন না; queue বা GUI toolkit-এর event scheduler দিয়ে main thread-এ update করুন।

## ৭. HWID ও Telemetry

```python
hwid = client.get_hwid()
telemetry = client.get_device_telemetry()
```

Validation flow HWID, device name ও OS metadata পাঠায়। `get_device_telemetry()` local mapping-এ আরও hardware/network identifier দেয়; প্রয়োজন ও user notice ছাড়া এটি upload/log করবেন না। Public IP default-এ lookup হয় না। `DeviceManager.get_device_telemetry(include_public_ip=True)` বা `DeviceManager.get_full_telemetry()` explicitly call করলে `api.ipify.org`-এ request যায়।

## ৮. Constructor ও Override

নতুন app-এর জন্য `XLicenseClient()` এবং `licenx.config.py` recommended। বিকল্পগুলো:

- `XLicenseClient(config=SDKConfig(...))` দিয়ে app-built config object।
- `XLicenseClient(config_path="path.py")` অথবা existing JSON path।
- `app_name=` / `server_url=` সরাসরি দেওয়ার compatibility branch। এটি file discovery bypass করে; trusted key ও actual app version ঠিকভাবে দিন।
- `app_version=` দিয়ে explicit version override। অন্য keyword-এর signature [API reference](./API_REFERENCE.md)-তে আছে।

একবারে একটি config source বেছে নিন। `licenx.config.py`-এর `client_options` থেকে constructor override স্বয়ংক্রিয়ভাবে apply হয় না।

## ৯. Common Error ও সমাধান

- `CONFIG_FILE_NOT_FOUND`, `CONFIG_FILE_READ_ERROR`, `CONFIG_PARSE_ERROR`, `CONFIG_SCHEMA_ERROR`, `CONFIG_VALUE_ERROR`, `CONFIG_SOURCE_AMBIGUOUS`: config load/validation সমস্যা। `SDKConfigError` import: `from licenx.config import SDKConfigError`।
- `APP_VERSION_REQUIRED`: actual app release config-এ নেই; `app_version` বসান, `min_version` নয়।
- `NO_SAVED_SESSION`: persistence disabled থাকায় `auto_login()`-এ expected; user-কে key দিতে বলুন এবং `login()` করুন।
- `NOT_AUTHENTICATED`: `ping()`-এর সময় active local session নেই।
- Remote HTTP, untrusted key, signature/nonce error বা server denial এলে TLS/signature check বন্ধ করে bypass করবেন না।

## ১০. Integration Test ও Diagnostic Console

Repository root থেকে offline package tests চালান:

```bash
cd SDK/client/python
python -m unittest discover -s licenx/test -p "test_*.py" -q
```

এগুলো live server certify করে না। `licenx/test/app.py` আলাদা diagnostic console; এটি বর্তমানে explicit JSON config নেয়, operator host allowlist চায় এবং live audit/device binding তৈরি করতে পারে। Live check-এর জন্য কেবল আলাদাভাবে approved non-production target ও disposable test license ব্যবহার করুন; Production-এ আলাদা operational approval ছাড়া চালাবেন না।
