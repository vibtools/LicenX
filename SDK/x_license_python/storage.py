"""
VCON Python Client SDK - Session Persistence & Background Daemon Engine
Rejects insecure temp-file sessions and runs a lightweight background daemon
thread to monitor periodic server validation (every 20 mins).
"""

import os
import tempfile
import threading
import time
from typing import Optional, Dict, Any, Callable
from .config import (
    MAX_OFFLINE_GRACE_SECONDS,
    MAX_PING_INTERVAL_SECONDS,
    MIN_PING_INTERVAL_SECONDS,
)


TRANSIENT_HEARTBEAT_CODES = {
    "SERVER_UNREACHABLE",
    "TIMEOUT",
    "REQUEST_ERROR",
    "UNKNOWN_ERROR",
    "SERVICE_UNAVAILABLE",
}


class BackgroundLicenseWorker:
    def __init__(
        self,
        app_name: str,
        ping_interval_seconds: int = 1200,  # 20 minutes default
        offline_grace_seconds: int = 0,
        on_invalidated: Optional[Callable[[str], None]] = None,
        on_heartbeat_success: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        if (
            type(ping_interval_seconds) is not int
            or not MIN_PING_INTERVAL_SECONDS <= ping_interval_seconds <= MAX_PING_INTERVAL_SECONDS
        ):
            raise ValueError(
                "ping_interval_seconds must be an integer between 60 and 1200 seconds"
            )
        if (
            type(offline_grace_seconds) is not int
            or not 0 <= offline_grace_seconds <= MAX_OFFLINE_GRACE_SECONDS
        ):
            raise ValueError(
                "offline_grace_seconds must be an integer between 0 and 3600 seconds"
            )

        self.app_name = app_name
        self.ping_interval_seconds = ping_interval_seconds
        self.offline_grace_seconds = offline_grace_seconds
        self.on_invalidated = on_invalidated
        self.on_heartbeat_success = on_heartbeat_success

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._server_communicator = None
        self._current_license_key: Optional[str] = None
        self._current_hwid: Optional[str] = None
        self._state_lock = threading.Lock()
        self._offline_since: Optional[float] = None
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
        self.record_heartbeat_success()
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
            remaining_grace = self._remaining_grace_seconds()
            wait_seconds = self.ping_interval_seconds
            if remaining_grace is not None:
                wait_seconds = min(wait_seconds, remaining_grace)

            interrupted = self._stop_event.wait(timeout=wait_seconds)
            if interrupted or not self._running:
                break

            if self._grace_expired():
                self._invalidate("Offline grace period expired")
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
                    "code": "SERVER_UNREACHABLE",
                }

            if is_valid:
                self.record_heartbeat_success()
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
            if self.should_invalidate_for_heartbeat_failure(data):
                self._invalidate(reason)
                break

    def should_invalidate_for_heartbeat_failure(self, data: Dict[str, Any]) -> bool:
        code = data.get("code")
        if code not in TRANSIENT_HEARTBEAT_CODES:
            return True
        if self.offline_grace_seconds == 0:
            return True

        now = time.monotonic()
        with self._state_lock:
            if self._offline_since is None:
                self._offline_since = now
                return False
            return now - self._offline_since >= self.offline_grace_seconds

    def record_heartbeat_success(self) -> None:
        with self._state_lock:
            self._offline_since = None

    def _remaining_grace_seconds(self) -> Optional[float]:
        with self._state_lock:
            if self._offline_since is None:
                return None
            elapsed = time.monotonic() - self._offline_since
            return max(0.0, self.offline_grace_seconds - elapsed)

    def _grace_expired(self) -> bool:
        remaining = self._remaining_grace_seconds()
        return remaining is not None and remaining <= 0

    def _invalidate(self, reason: str) -> None:
        self.clear_session()
        self._running = False
        self._stop_event.set()
        self.record_heartbeat_success()
        if self.on_invalidated:
            self.on_invalidated(reason)


# Alias for backward-compatibility and clean imports
LicenseStorage = BackgroundLicenseWorker
