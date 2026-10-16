# Device Identity and Telemetry

Source: `SDK/x_license_python/device.py`

## Hardware Identifier

`DeviceManager.get_hwid()` derives and process-caches a compact identifier by hashing motherboard/system UUID, primary disk serial, CPU information, and MAC address with SHA-256. Platform-specific probes use Windows WMIC, macOS `ioreg`/`system_profiler`, or Linux machine-id and block-device files, with generic fallbacks when probes fail.

This is a stable device-binding hint, not cryptographic proof of hardware identity. OS reinstall, virtual-machine changes, disk/NIC replacement, or unavailable platform identifiers can change it or cause collisions. Do not use it as an authentication secret.

## Telemetry APIs

- `get_validation_telemetry()` returns only device name and OS text for the validation request.
- `get_device_telemetry(include_public_ip=False)` returns a broader local dictionary including HWID, OS, MAC, motherboard UUID, disk serial, CPU, local IP, timezone, and locale. Public-IP lookup occurs only when explicitly requested.
- `get_full_telemetry()` is the explicit opt-in wrapper that requests public IP through `api.ipify.org`.

Network validation uses the minimal metadata method and does not send the full telemetry object. Treat full telemetry as sensitive local data. One implementation caveat: if the external public-IP lookup fails, `get_public_ip()` falls back to the local IP while retaining the `public_ip` label; see the audit summary.
