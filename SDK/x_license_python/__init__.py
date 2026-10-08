"""
VCON Python Client SDK (x_license_python)
"""

from .config import SDKConfig
from .device import DeviceManager
from .server import ServerCommunicator, ServerClient
from .storage import BackgroundLicenseWorker, LicenseStorage
from .offline import OfflineGuard, OfflineLicenseManager
from .login import LoginManager, LoginResult
from .logout import LogoutManager
from .client import XLicenseClient

__version__ = "1.2.1"
__all__ = [
    "XLicenseClient",
    "SDKConfig",
    "DeviceManager",
    "ServerCommunicator",
    "ServerClient",
    "BackgroundLicenseWorker",
    "LicenseStorage",
    "OfflineGuard",
    "OfflineLicenseManager",
    "LoginManager",
    "LoginResult",
    "LogoutManager",
]
