"""
VCON Python Client SDK - Main Client Interface (XLicenseClient)
Unified high-level facade providing intuitive methods for authentication, auto-login,
device HWID tracking, background heartbeat threading, and graceful device slot releasing.
"""

from typing import Optional, Dict, Any, Callable
from .config import SDKConfig
from .device import DeviceManager
from .server import ServerCommunicator
from .storage import BackgroundLicenseWorker
from .login import LoginManager, LoginResult
from .logout import LogoutManager


class XLicenseClient:
    """
    Main SDK Client class to embed in any Python application.
    
    Usage:
        from x_license_python import XLicenseClient

        client = XLicenseClient()
        
        # 1. Try Auto Login first
        res = client.auto_login()
        if not res.success:
            # 2. Ask user for key
            key = input("Enter License Key: ")
            res = client.login(key)

        if res.success:
            print(f"Unlocked! Tier: {client.get_tier()}")
        else:
            print(f"Access Denied: {res.message}")
    """

    def __init__(
        self,
        config_path: Optional[str] = None,
        config: Optional[SDKConfig] = None,
        app_name: Optional[str] = None,
        server_url: Optional[str] = None,
        public_key_pem: Optional[str] = None,
        auto_logout_on_exit: Optional[bool] = None,
        auto_save_session: Optional[bool] = None,
        enable_background_heartbeat: Optional[bool] = None,
        ping_interval_seconds: Optional[int] = None,
        on_license_revoked: Optional[Callable[[str], None]] = None,
    ):
        if config:
            self.config = config
        elif app_name or server_url:
            self.config = SDKConfig(
                app_name=app_name or "vcon_default",
                server_url=server_url or "http://localhost:3000",
                public_key_pem=public_key_pem,
                auto_logout_on_exit=True if auto_logout_on_exit is None else auto_logout_on_exit,
                auto_save_session=True if auto_save_session is None else auto_save_session,
                enable_background_heartbeat=True if enable_background_heartbeat is None else enable_background_heartbeat,
                ping_interval_seconds=ping_interval_seconds or 1200,
            )
        else:
            self.config = SDKConfig.from_file(config_path)

        self.communicator = ServerCommunicator(self.config)
        self.server = self.communicator
        self.on_license_revoked = on_license_revoked

        # Background storage & heartbeat daemon worker
        self.storage = BackgroundLicenseWorker(
            app_name=self.config.app_name,
            ping_interval_seconds=self.config.ping_interval_seconds,
            on_invalidated=self._handle_license_revoked,
            on_heartbeat_success=self._handle_heartbeat_success,
        )

        # Login manager
        self.login_manager = LoginManager(
            config=self.config,
            communicator=self.communicator,
            storage=self.storage,
        )

        # Logout manager
        self.logout_manager = LogoutManager(
            communicator=self.communicator,
            storage=self.storage,
            auto_logout_on_exit=self.config.auto_logout_on_exit,
        )

        self._authenticated = False
        self._current_key: Optional[str] = None
        self._license_payload: Optional[Dict[str, Any]] = None

    # -------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------

    def login(self, license_key: str) -> LoginResult:
        """
        Validates license key against server and binds current hardware.
        """
        result = self.login_manager.login(license_key)
        if result.success:
            self._authenticated = True
            self._current_key = license_key.strip()
            self._license_payload = result.license_data
            self.logout_manager.set_active_session(self._current_key)
        else:
            self._authenticated = False
            self._current_key = None
            self._license_payload = None
            self.logout_manager.set_active_session(None)

        return result

    def auto_login(self) -> LoginResult:
        """
        Attempts auto-login with stored license key from OS temp directory.
        Always verifies online with license server before approving.
        """
        result = self.login_manager.auto_login()
        if result.success:
            self._authenticated = True
            self._current_key = result.license_key or self.storage.load_saved_session()
            self._license_payload = result.license_data
            self.logout_manager.set_active_session(self._current_key)
        return result

    def logout(self, clear_saved_license: bool = True) -> bool:
        """
        Logs out active session, stops heartbeat thread, and notifies server
        to release hardware device slot immediately.
        """
        success = self.logout_manager.logout(
            self._current_key,
            clear_saved_data=clear_saved_license,
        )
        self._authenticated = False
        self._current_key = None
        self._license_payload = None
        return success

    def is_authenticated(self) -> bool:
        """Returns True if currently authenticated with active license"""
        return self._authenticated

    def get_license_info(self) -> Optional[Dict[str, Any]]:
        """Returns verified license payload from server"""
        return self._license_payload

    def get_tier(self) -> str:
        """Returns license tier (e.g. Standard, Pro, Enterprise, VIP)"""
        if self._license_payload:
            return self._license_payload.get("tier", "Standard")
        return "None"

    def get_hwid(self) -> str:
        """Returns deterministic HWID string"""
        return DeviceManager.get_hwid()

    def get_device_telemetry(self) -> Dict[str, Any]:
        """Returns full device telemetry dict"""
        return DeviceManager.get_device_telemetry()

    def get_current_key(self) -> Optional[str]:
        """Returns active license key"""
        return self._current_key

    def ping(self) -> Dict[str, Any]:
        """
        Sends on-demand heartbeat ping to server to check license status.
        Returns server response dict including {'valid': bool, 'status': str, ...}.
        """
        key = self._current_key or self.storage.load_saved_session()
        if not key:
            return {"valid": False, "code": "NOT_AUTHENTICATED", "message": "No active session"}
        is_active, data = self.server.ping_heartbeat(key, self.get_hwid())
        return data

    # -------------------------------------------------------------
    # Internal Event Handlers
    # -------------------------------------------------------------

    def _handle_license_revoked(self, reason: str) -> None:
        """Called when background 20-min heartbeat detects revocation / unbind"""
        self._authenticated = False
        self._license_payload = None
        self._current_key = None
        try:
            self.logout_manager.logout(clear_saved_data=True)
        except Exception:
            pass
        print(f"\n[VCON-SDK] CRITICAL: License session terminated by server! Reason: {reason}")
        if self.on_license_revoked:
            self.on_license_revoked(reason)

    def _handle_heartbeat_success(self, data: Dict[str, Any]) -> None:
        """Called on periodic successful heartbeat"""
        pass
