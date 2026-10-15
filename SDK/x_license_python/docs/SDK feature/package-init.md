# Package Exports and Version

Source: `SDK/x_license_python/__init__.py`

## Role

This module is the package's stable import surface. It re-exports the high-level client, configuration, device manager, transport, session worker, policy guard, login result/manager, and logout manager so applications can use `from x_license_python import XLicenseClient` without importing internal modules.

## Public API

`__all__` lists the names exported by `from x_license_python import *`. Compatibility aliases include `ServerClient`, `LicenseStorage`, and `OfflineLicenseManager`; they refer to the same implementations as their canonical class names.

`__version__` is the SDK release source of truth. It is now `1.2.3`. The release workflow checks a `python-sdk-vX.Y.Z` tag against this exact value before publishing. Do not infer this version from the server application's version policy.

## Example

```python
from x_license_python import SDKConfig, XLicenseClient, __version__

print(__version__)
client = XLicenseClient(config=SDKConfig(app_version="2.4.1"))
```

The client version above is the integrating application's release, not this SDK package version. Public exports are unchanged in v1.2.3.
