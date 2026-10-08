"""
VCON Python Client SDK - Logout Manager
Handles clean manual logout and automated graceful exit hooks (atexit / signal).
Notifies server to unbind current HWID instantly, freeing up the device limit slot
so the license can be activated on another PC immediately.
"""

import atexit
import signal
from typing import Optional
from .device import DeviceManager
from .server import ServerCommunicator
from .storage import BackgroundLicenseWorker


class LogoutManager:
    def __init__(
        self,
        communicator: ServerCommunicator,
        storage: BackgroundLicenseWorker,
        auto_logout_on_exit: bool = True,
    ):
        self.communicator = communicator
        self.storage = storage
        self.auto_logout_on_exit = auto_logout_on_exit
        self._current_license_key: Optional[str] = None
        self._exit_hook_registered = False

        if self.auto_logout_on_exit:
            self._register_exit_hooks()

    def set_active_session(self, license_key: Optional[str]) -> None:
        """Sets active license key for exit cleanup"""
        self._current_license_key = license_key

    def logout(self, license_key: Optional[str] = None, clear_saved_data: bool = True) -> bool:
        """
        Logs out active session and unbinds device from server.
        """
        key = license_key or self._current_license_key
        hwid = DeviceManager.get_hwid()

        # Stop background worker thread
        self.storage.stop_monitoring()

        if clear_saved_data:
            self.storage.clear_session()

        success = True
        if key:
            # Send unbind request to server so license device slots are freed
            success = self.communicator.send_logout(key, hwid)

        self._current_license_key = None
        return success

    def _register_exit_hooks(self) -> None:
        """Hooks Python process termination to execute auto-logout"""
        if self._exit_hook_registered:
            return

        def _on_exit():
            if self._current_license_key:
                try:
                    self.logout(self._current_license_key, clear_saved_data=False)
                except Exception:
                    pass

        atexit.register(_on_exit)

        # Handle SIGTERM / SIGINT gracefully
        def _sig_handler(signum, frame):
            _on_exit()
            raise SystemExit(0)

        try:
            signal.signal(signal.SIGINT, _sig_handler)
            signal.signal(signal.SIGTERM, _sig_handler)
        except Exception:
            # In some thread or non-main thread contexts, signal registration might not be allowed
            pass

        self._exit_hook_registered = True
