"""
VCON Python Client SDK - Storage & Background Daemon Engine
Manages secure local session storage in OS temp directory for auto-login,
and runs a lightweight background daemon thread to monitor periodic server validation (every 20 mins)
with zero UI lag and minimal CPU/RAM footprint.
"""

import os
import json
import time
import base64
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
        """Saves current license key & metadata securely in OS temp directory"""
        try:
            payload = {
                "license_key": license_key,
                "saved_at": int(time.time()),
                "app_name": self.app_name,
                "data": license_data,
            }
            # Simple obfuscation
            raw = json.dumps(payload).encode("utf-8")
            b64 = base64.b64encode(raw).decode("utf-8")

            with open(self._session_file, "w", encoding="utf-8") as f:
                f.write(b64)
        except Exception as e:
            print(f"[VCON-SDK] Warning: Could not save session: {e}")

    def load_saved_session(self) -> Optional[str]:
        """Loads saved license key for auto-login attempt"""
        if not os.path.exists(self._session_file):
            return None

        try:
            with open(self._session_file, "r", encoding="utf-8") as f:
                content = f.read().strip()

            if not content:
                return None

            raw = base64.b64decode(content.encode("utf-8")).decode("utf-8")
            payload = json.loads(raw)
            if payload.get("app_name") == self.app_name:
                return payload.get("license_key")
        except Exception:
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
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self._thread = None

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

                if is_valid:
                    if self.on_heartbeat_success:
                        self.on_heartbeat_success(data)
                else:
                    # License was revoked, expired, or device was unbound by admin!
                    reason = data.get("message") or data.get("code") or "License validation failed on server"
                    self.clear_session()
                    if self.on_invalidated:
                        self.on_invalidated(reason)
                    break
            except Exception as e:
                # Network glitch, retry next interval
                print(f"[VCON-SDK] Background ping warning: {e}")


# Alias for backward-compatibility and clean imports
LicenseStorage = BackgroundLicenseWorker
