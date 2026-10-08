"""
VCON Python Client SDK - Login Manager
Handles interactive login and saved-session auto-login.
Verifies SSL + Server domain + Ed25519 Cryptographic Signature + License Key + App Scope + Device limits.
Strictly online-only: Never permits offline login bypass.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
from .config import SDKConfig
from .device import DeviceManager
from .server import ServerCommunicator
from .storage import BackgroundLicenseWorker
from .offline import OfflineGuard


@dataclass
class LoginResult:
    success: bool
    status_code: int
    message: str
    code: str
    license_data: Optional[Dict[str, Any]] = None
    hwid: Optional[str] = None
    license_key: Optional[str] = None


class LoginManager:
    def __init__(
        self,
        config: SDKConfig,
        communicator: ServerCommunicator,
        storage: BackgroundLicenseWorker,
    ):
        self.config = config
        self.communicator = communicator
        self.storage = storage

    def login(self, license_key: str, pin: Optional[str] = None) -> LoginResult:
        """
        Performs full online authentication against license server.
        Supports optional numeric PIN verification.
        """
        if not license_key or not license_key.strip():
            return LoginResult(
                success=False,
                status_code=400,
                message="License key cannot be empty",
                code="EMPTY_KEY",
            )

        telemetry = DeviceManager.get_device_telemetry()
        hwid = telemetry["hwid"]
        normalized_key = license_key.strip().upper()

        # Call Server Validation Endpoint
        is_valid, status_code, data = self.communicator.validate_license(
            license_key=normalized_key,
            hwid=hwid,
            telemetry=telemetry,
            pin=pin,
        )

        if not is_valid:
            error_msg = data.get("message") or data.get("error") or "Authentication rejected"
            error_code = data.get("code") or "AUTH_REJECTED"
            return LoginResult(
                success=False,
                status_code=status_code,
                message=error_msg,
                code=error_code,
                hwid=hwid,
                license_key=normalized_key,
            )

        # Anti-Clock Rollback verification
        server_time = data.get("server_time", 0)
        if OfflineGuard.is_clock_tampered(server_time):
            return LoginResult(
                success=False,
                status_code=403,
                message="System clock mismatch detected. Please synchronize your system time.",
                code="CLOCK_TAMPERED",
                hwid=hwid,
                license_key=normalized_key,
            )

        # Save session to temp directory for auto-login on next start (if enabled)
        if self.config.auto_login_enabled and getattr(self.config, "auto_save_session", True):
            self.storage.save_session(normalized_key, data)

        # Start periodic 20-min background verification thread (if enabled)
        if getattr(self.config, "enable_background_heartbeat", True):
            self.storage.start_monitoring(
                server_communicator=self.communicator,
                license_key=normalized_key,
                hwid=hwid,
            )

        return LoginResult(
            success=True,
            status_code=200,
            message="License verified successfully",
            code="OK",
            license_data=data,
            hwid=hwid,
            license_key=normalized_key,
        )

    def auto_login(self) -> LoginResult:
        """
        Attempts auto-login using previously saved session in temp storage.
        Guarantees server-side online validation before unlocking.
        """
        if not getattr(self.config, "auto_login_enabled", True):
            return LoginResult(
                success=False,
                status_code=400,
                message="Auto-login is disabled in SDK configuration",
                code="AUTO_LOGIN_DISABLED",
            )

        saved_key = self.storage.load_saved_session()
        if not saved_key:
            return LoginResult(
                success=False,
                status_code=404,
                message="No saved license found for auto-login",
                code="NO_SAVED_SESSION",
            )

        # Perform strict online validation
        return self.login(saved_key)
