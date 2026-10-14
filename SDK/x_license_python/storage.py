"""
VCON Python Client SDK - Session Persistence & Background Daemon Engine
Rejects insecure temp-file sessions and runs a lightweight background daemon
thread to monitor periodic server validation (every 20 mins).
"""

import os
import tempfile
import threading
from typing import Optional, Dict, Any, Callable


class BackgroundLicenseWorker:
    def __init__(
        self,
        app_name: str,
        ping_interval_seconds: int = 1200,  # 20 minutes default
        on_invalidated: Optional[Callable[[str], None]] = None,
        on_heartbeat_success: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.app_name = app_name
        self.ping_interval_seconds = ping_interval_seconds
        self.on_invalidated = on_invalidated
        self.on_heartbeat_success = on_heartbeat_success

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._server_communicator = None
        self._current_license_key: Optional[str] = None
        self._current_hwid: Optional[str] = None
        self._session_file = os.path.join(
            tempfile.gettempdir(), f".vcon_session_{self.app_name}.dat"
        )

    # -------------------------------------------------------------
    # Session Persistence (Temp directory)
    # -------------------------------------------------------------

    def save_session(self, license_key: str, license_data: Dict[str, Any]) -> None:
        """Disable persistence until a secure OS credential store is available."""
        self.clear_session()

    def load_saved_session(self) -> Optional[str]:
        """Reject legacy temp-file sessions until secure storage is available."""
        self.clear_session()
        return None

    def clear_session(self) -> None:
        """Deletes session file from temp storage"""
        try:
            if os.path.exists(self._session_file):
                os.remove(self._session_file)
        except Exception:
            pass

    # -------------------------------------------------------------
    # Background Daemon Heartbeat Thread (20-min cycle)
    # -------------------------------------------------------------

    def start_monitoring(
        self,
        server_communicator,
        license_key: str,
        hwid: str,
    ) -> None:
        """Starts background verification thread"""
        self.stop_monitoring()
        self._server_communicator = server_communicator
        self._current_license_key = license_key
        self._current_hwid = hwid
        self._stop_event.clear()
        self._running = True

        self._thread = threading.Thread(
            target=self._worker_loop,
            name=f"VCON-Worker-{self.app_name}",
            daemon=True,  # Daemon thread won't block main app exit
        )
        self._thread.start()

    def stop_monitoring(self) -> None:
        """Stops background thread safely"""
        self._running = False
        self._stop_event.set()
        worker_thread = self._thread
        self._thread = None
        if (
            worker_thread
            and worker_thread.is_alive()
            and worker_thread is not threading.current_thread()
        ):
            worker_thread.join(timeout=1.0)

    def _worker_loop(self) -> None:
        """Periodic background heartbeat runner (RAM & CPU friendly)"""
        while self._running and not self._stop_event.is_set():
            # Wait for interval or stop event
            interrupted = self._stop_event.wait(timeout=self.ping_interval_seconds)
            if interrupted or not self._running:
                break

            if not self._server_communicator or not self._current_license_key or not self._current_hwid:
                break

            try:
                is_valid, data = self._server_communicator.ping_heartbeat(
                    self._current_license_key,
                    self._current_hwid,
                )
            except Exception:
                is_valid = False
                data = {
                    "message": "Heartbeat could not be verified; access is denied",
                    "code": "HEARTBEAT_UNAVAILABLE",
                }

            if is_valid:
                if self.on_heartbeat_success:
                    try:
                        self.on_heartbeat_success(data)
                    except Exception as error:
                        print(f"[VCON-SDK] Heartbeat success callback warning: {error}")
                continue

            reason = (
                data.get("message")
                or data.get("code")
                or "Heartbeat could not be verified; access is denied"
            )
            self.clear_session()
            self._running = False
            self._stop_event.set()
            if self.on_invalidated:
                self.on_invalidated(reason)
            break


# Alias for backward-compatibility and clean imports
LicenseStorage = BackgroundLicenseWorker
