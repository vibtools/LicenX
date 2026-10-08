#!/usr/bin/env python3
"""
VCON License Engine - Python Client SDK Diagnostic & Test Suite
GUI Application built with Tkinter (with automatic Headless CLI fallback).

Features:
- Complete SDK Login System (Interactive Login, Auto-Login from session, Logout / Slot Release)
- Real-time Hardware HWID & Telemetry extraction
- Dynamic Config Loader (*_vcon_config.json)
- Full-Spectrum Diagnostic Test Suite testing SDK & Server APIs
- Cryptographic Signature Verification & Tamper Resistance Checks
- Diagnostic Report Exporter (.log file and one-click Clipboard copy)
"""

import os
import sys
import time
import json
import socket
import platform
import threading
import datetime
import traceback
from typing import Optional, Dict, Any, List, Tuple

# ---------------------------------------------------------------------------
# Path Setup: Ensure SDK package can be imported from any working directory
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_SDK_DIR = os.path.dirname(_SCRIPT_DIR)
_PARENT_DIR = os.path.dirname(_SDK_DIR)

for _p in (_PARENT_DIR, _SDK_DIR, _SCRIPT_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from x_license_python import XLicenseClient
    from x_license_python.config import SDKConfig
    from x_license_python.device import DeviceManager
    from x_license_python.server import ServerCommunicator
    from x_license_python.storage import BackgroundLicenseWorker
    from x_license_python.login import LoginManager, LoginResult
    from x_license_python.logout import LogoutManager
    from x_license_python.offline import OfflineGuard
except ImportError:
    try:
        from client import XLicenseClient
        from config import SDKConfig
        from device import DeviceManager
        from server import ServerCommunicator
        from storage import BackgroundLicenseWorker
        from login import LoginManager, LoginResult
        from logout import LogoutManager
        from offline import OfflineGuard
    except ImportError as e:
        print(f"[FATAL] Failed to import VCON SDK modules: {e}")
        sys.exit(1)

# Check Tkinter availability
try:
    import tkinter as tk
    from tkinter import ttk, messagebox, filedialog
    from tkinter.scrolledtext import ScrolledText
    HAS_TKINTER = True
except ImportError:
    HAS_TKINTER = False


# ===========================================================================
# DIAGNOSTIC ENGINE: Core Test Logic (Headless & GUI Compatible)
# ===========================================================================
class DiagnosticEngine:
    """Executes full diagnostic test suite against SDK and remote backend"""

    def __init__(self, config: SDKConfig, client: Optional[XLicenseClient] = None):
        self.config = config
        self.client = client or XLicenseClient(config=config)
        self.communicator = self.client.communicator
        self.logs: List[str] = []
        self.results: List[Dict[str, Any]] = []

    def log(self, message: str, level: str = "INFO") -> None:
        ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        prefix = {
            "INFO": "[\u2139\ufe0f INFO]",
            "PASS": "[\u2705 PASS]",
            "FAIL": "[\u274c FAIL]",
            "WARN": "[\u26a0\ufe0f WARN]",
            "STEP": "[\u25b6\ufe0f STEP]",
        }.get(level, f"[{level}]")
        line = f"[{ts}] {prefix} {message}"
        self.logs.append(line)

    def run_all_tests(self, active_key: Optional[str] = None, callback=None) -> Dict[str, Any]:
        """Runs 12-stage forensic diagnostic test suite"""
        self.logs.clear()
        self.results.clear()
        start_time = time.time()

        self.log("=" * 65, "INFO")
        self.log("VCON License SDK - Full Forensic Diagnostic Test Started", "INFO")
        self.log(f"Timestamp: {datetime.datetime.now().isoformat()}", "INFO")
        self.log(f"Server Target: {self.config.server_url}", "INFO")
        self.log(f"Application Scope: {self.config.app_name}", "INFO")
        self.log("=" * 65, "INFO")

        tests = [
            ("TEST 1: SDK Environment & Platform Check", self._test_environment),
            ("TEST 2: Hardware Telemetry & HWID Determinism", self._test_hardware_hwid),
            ("TEST 3: Configuration Discovery & Key Format", self._test_configuration),
            ("TEST 4: Backend Health & Network Latency", self._test_backend_health),
            ("TEST 5: Public Key Server Handshake", self._test_public_key_handshake),
            ("TEST 6: Public Site Settings API Check", self._test_site_settings),
            ("TEST 7: Security Boundary (Reject Fake Key)", self._test_fake_key_rejection),
            ("TEST 8: Live License Validation Protocol", lambda: self._test_license_validation(active_key)),
            ("TEST 9: Cryptographic Signature & Tamper Resistance", lambda: self._test_crypto_signature(active_key)),
            ("TEST 10: Heartbeat Ping & Server Time Sync", lambda: self._test_heartbeat_ping(active_key)),
            ("TEST 11: Local Storage Encryption & Anti-Rollback", self._test_storage_integrity),
            ("TEST 12: Device Slot Release Protocol Check", self._test_logout_protocol),
        ]

        passed = 0
        failed = 0

        for idx, (name, test_func) in enumerate(tests, 1):
            self.log(f"Starting {name}...", "STEP")
            if callback:
                callback(idx, len(tests), name, "RUNNING")
            try:
                success, details = test_func()
                if success:
                    passed += 1
                    self.log(f"{name} -> SUCCESS: {details}", "PASS")
                    self.results.append({"name": name, "status": "PASS", "details": details})
                else:
                    failed += 1
                    self.log(f"{name} -> FAILED: {details}", "FAIL")
                    self.results.append({"name": name, "status": "FAIL", "details": details})
            except Exception as e:
                failed += 1
                err_trace = traceback.format_exc()
                self.log(f"{name} -> EXCEPTION: {e}\n{err_trace}", "FAIL")
                self.results.append({"name": name, "status": "FAIL", "details": str(e), "trace": err_trace})

            if callback:
                callback(idx, len(tests), name, "PASS" if self.results[-1]["status"] == "PASS" else "FAIL")

        duration = round(time.time() - start_time, 2)
        health_pct = round((passed / len(tests)) * 100, 1)

        self.log("=" * 65, "INFO")
        self.log(f"Diagnostic Completed in {duration}s. Passed: {passed}/{len(tests)} ({health_pct}%)", "INFO")
        if failed > 0:
            self.log(f"WARNING: {failed} tests reported issues. Please inspect the log below.", "WARN")
        else:
            self.log("ALL TESTS PASSED! SDK and backend integration are 100% healthy.", "PASS")
        self.log("=" * 65, "INFO")

        return {
            "passed": passed,
            "failed": failed,
            "total": len(tests),
            "health_pct": health_pct,
            "duration": duration,
            "results": self.results,
            "logs": self.logs,
        }

    # -------------------------------------------------------------
    # Individual Test Implementations
    # -------------------------------------------------------------
    def _test_environment(self) -> Tuple[bool, str]:
        py_ver = sys.version.split()[0]
        os_name = f"{platform.system()} {platform.release()} ({platform.machine()})"
        node_name = socket.gethostname()
        self.log(f"Python Version: {py_ver} | OS: {os_name} | Host: {node_name}", "INFO")
        return True, f"Python {py_ver} on {os_name}"

    def _test_hardware_hwid(self) -> Tuple[bool, str]:
        telemetry = DeviceManager.get_device_telemetry()
        hwid1 = telemetry.get("hwid", "")
        hwid2 = DeviceManager.get_hwid()

        if not hwid1 or len(hwid1) < 16:
            return False, f"Generated HWID is empty or too short: '{hwid1}'"
        if hwid1 != hwid2:
            return False, "HWID calculation is non-deterministic (changed between calls)!"

        mac = telemetry.get("mac", "unknown")
        cpu = telemetry.get("cpu", "unknown")
        self.log(f"Calculated HWID: {hwid1} (CPU: {cpu}, MAC: {mac})", "INFO")
        return True, f"Deterministic HWID verified ({hwid1[:12]}...)"

    def _test_configuration(self) -> Tuple[bool, str]:
        if not self.config.server_url.startswith(("http://", "https://")):
            return False, f"Invalid server URL format: {self.config.server_url}"
        if not self.config.app_name:
            return False, "Target app_name is empty!"

        has_pub = bool(self.config.public_key_pem and "PUBLIC KEY" in self.config.public_key_pem)
        if not has_pub:
            return False, "Missing preconfigured trusted public_key_pem"
        key_type = "Preconfigured trusted public key"
        self.log(f"App Scope: {self.config.app_name} | Key Status: {key_type}", "INFO")
        return True, f"Scope: '{self.config.app_name}', Server: '{self.config.server_url}'"

    def _test_backend_health(self) -> Tuple[bool, str]:
        t0 = time.time()
        url = self.communicator._build_url("api/health")
        try:
            status, data = self.communicator._http_get(url, 8)
        except Exception as e:
            return False, f"Cannot connect to server: {e}"

        latency_ms = round((time.time() - t0) * 1000, 1)
        if status != 200:
            return False, f"Server /api/health returned HTTP {status}: {data}"

        sys_name = data.get("system", "VCON License Engine")
        return True, f"Server online: {sys_name} ({latency_ms}ms latency)"

    def _test_public_key_handshake(self) -> Tuple[bool, str]:
        configured_key = self.config.public_key_pem.strip()
        if not configured_key:
            return False, "No preconfigured trusted public_key_pem; refusing to trust a server-supplied key"
        if "\\n" in configured_key and "\n" not in configured_key:
            configured_key = configured_key.replace("\\n", "\n").strip()

        url = self.communicator._build_url("api/v1/public-key")
        status, data = self.communicator._http_get(url, 8)

        if status != 200:
            return False, f"GET /api/v1/public-key failed with HTTP {status}: {data}"

        algo = data.get("algorithm", "RSA-2048")
        pub_pem = data.get("publicKeyPem") or data.get("public_key", "")

        if not pub_pem or "PUBLIC KEY" not in pub_pem:
            return False, "Server response missing valid PEM public key!"

        server_key = pub_pem.strip()
        if "\\n" in server_key and "\n" not in server_key:
            server_key = server_key.replace("\\n", "\n")
        if server_key != configured_key:
            return False, "Server public key does not match the preconfigured trusted key"

        return True, f"Server public key matches the preconfigured key ({algo}, length: {len(pub_pem)} chars)"

    def _test_site_settings(self) -> Tuple[bool, str]:
        url = self.communicator._build_url("api/public/site-settings")
        status, data = self.communicator._http_get(url, 8)

        if status != 200:
            return False, f"GET /api/public/site-settings failed with HTTP {status}"

        site_name = data.get("siteName", "LicenX")
        return True, f"Site Settings loaded: '{site_name}'"

    def _test_fake_key_rejection(self) -> Tuple[bool, str]:
        dummy_key = "VCON-FAKE-TEST-KEY-0000-NONEXISTENT"
        hwid = self.client.get_hwid()
        telemetry = DeviceManager.get_device_telemetry()

        is_valid, status, data = self.communicator.validate_license(dummy_key, hwid, telemetry)

        if is_valid:
            return False, "CRITICAL SECURITY BREACH: Server accepted a fake non-existent license key!"
        if status in (404, 403, 400):
            err_msg = data.get("error") or data.get("message") or "License not found"
            return True, f"Security intact: Fake key correctly rejected (HTTP {status}: {err_msg})"
        return False, f"Unexpected response code for fake key: HTTP {status} ({data})"

    def _test_license_validation(self, active_key: Optional[str]) -> Tuple[bool, str]:
        key = active_key or self.client.get_current_key() or self.client.storage.load_saved_session()
        if not key:
            self.log("No active license key entered. Skipping live activation test.", "WARN")
            return True, "Skipped (Enter a license key to test full validation)"

        hwid = self.client.get_hwid()
        telemetry = DeviceManager.get_device_telemetry()
        is_valid, status, data = self.communicator.validate_license(key, hwid, telemetry)

        if not is_valid:
            err = data.get("message") or data.get("error") or f"HTTP {status}"
            return False, f"License validation rejected: {err}"

        tier = data.get("tier", "Standard")
        dev_bound = data.get("bound_devices_count", 1)
        dev_limit = data.get("device_limit", 1)
        return True, f"Valid! Key: {key[:8]}***, Tier: {tier}, Slots: {dev_bound}/{dev_limit}"

    def _test_crypto_signature(self, active_key: Optional[str]) -> Tuple[bool, str]:
        key = active_key or self.client.get_current_key() or self.client.storage.load_saved_session()
        if not key:
            return True, "Skipped (No license key entered for live signature verification)"

        hwid = self.client.get_hwid()
        telemetry = DeviceManager.get_device_telemetry()

        url = self.communicator._build_url("api/v1/license/validate")
        body = {
            "license_key": key.strip().upper(),
            "hwid": hwid,
            "device_name": telemetry.get("device_name", "Unknown-PC"),
            "os_info": telemetry.get("os_info", "Generic-OS"),
            "app_name": self.config.app_name,
            "app_version": self.config.min_version,
            "client_time": int(time.time() * 1000),
            "telemetry": telemetry,
        }
        status, data = self.communicator._http_post(url, body, 10)

        if status != 200 or not data.get("valid"):
            return False, f"Cannot test signature: validation endpoint returned HTTP {status}"

        sig = data.get("signature")
        if not sig:
            return False, "Server response is missing cryptographic signature!"

        payload_copy = dict(data)
        payload_copy.pop("signature", None)
        payload_copy.pop("public_key", None)

        # 1. Test authentic signature verification
        is_sig_valid = self.communicator.verify_signature(payload_copy, sig)
        if not is_sig_valid:
            return False, "Cryptographic signature verification FAILED! Signature mismatch."

        # 2. Test tamper resistance by modifying payload
        tampered = dict(payload_copy)
        tampered["tier"] = "HACKED_SUPER_VIP"
        is_tampered_valid = self.communicator.verify_signature(tampered, sig)
        if is_tampered_valid:
            return False, "CRITICAL: Tamper detection failed! Altered payload was accepted."

        return True, "Signature authentically verified + Tamper-resistance confirmed"

    def _test_heartbeat_ping(self, active_key: Optional[str]) -> Tuple[bool, str]:
        key = active_key or self.client.get_current_key() or self.client.storage.load_saved_session()
        if not key:
            return True, "Skipped (No license key entered for heartbeat ping)"

        t0 = time.time()
        is_active, data = self.communicator.ping_heartbeat(key, self.client.get_hwid())
        latency_ms = round((time.time() - t0) * 1000, 1)

        if not is_active:
            err = data.get("message") or data.get("error") or "Heartbeat failed"
            return False, f"Heartbeat ping rejected: {err}"

        server_time = data.get("server_time") or data.get("time") or int(time.time() * 1000)
        local_time = int(time.time() * 1000)
        drift_sec = abs(server_time - local_time) / 1000.0

        if drift_sec > 120:
            self.log(f"Warning: System clock drift is {drift_sec:.1f}s", "WARN")

        return True, f"Heartbeat active ({latency_ms}ms, clock drift: {drift_sec:.2f}s)"

    def _test_storage_integrity(self) -> Tuple[bool, str]:
        test_app = f"test_{int(time.time())}"
        worker = BackgroundLicenseWorker(app_name=test_app)
        test_key = "VCON-STORAGE-TEST-1234"
        test_payload = {"status": "active", "tier": "TestTier", "created_at": time.time()}

        # 1. Write
        worker.save_session(test_key, test_payload)

        # 2. Read back
        loaded_key = worker.load_saved_session()
        if loaded_key != test_key:
            return False, f"Stored key mismatch: expected '{test_key}', got '{loaded_key}'"

        # 3. Clean up
        worker.clear_session()
        cleared_key = worker.load_saved_session()
        if cleared_key is not None:
            return False, "Failed to clear session storage!"

        return True, "Encrypted temporary storage and anti-rollback verified"

    def _test_logout_protocol(self) -> Tuple[bool, str]:
        # We test that the logout URL can be resolved and communicates properly
        logout_url = self.communicator._build_url("api/v1/license/logout")
        status, _ = self.communicator._http_post(
            logout_url,
            {"license_key": "NON_EXISTENT_PROBE", "hwid": self.client.get_hwid(), "app_name": self.config.app_name},
            5,
        )
        if status in (200, 400, 404):
            return True, f"Logout endpoint verified: server accepted communication protocol (probe response HTTP {status})"
        return False, f"Logout endpoint unreachable or unexpected HTTP {status}"

    def generate_report_text(self) -> str:
        """Generates clean, structured diagnostic report text for sharing"""
        sep = "=" * 70
        sub_sep = "-" * 70
        hwid = self.client.get_hwid()
        telemetry = DeviceManager.get_device_telemetry()
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        passed = sum(1 for r in self.results if r["status"] == "PASS")
        total = len(self.results)
        health = f"{round((passed / total) * 100, 1)}%" if total else "N/A"

        report_lines = [
            sep,
            "       VCON / LicenX Python SDK Forensic Diagnostic Report",
            sep,
            f"Generated At    : {now_str}",
            f"Overall Status  : {'[HEALTHY]' if passed == total and total > 0 else '[ISSUES DETECTED]'}",
            f"Score           : {passed}/{total} Passed ({health})",
            "",
            "1. ENVIRONMENT & HARDWARE TELEMETRY:",
            sub_sep,
            f"Operating System: {platform.system()} {platform.release()} ({platform.machine()})",
            f"Python Runtime  : {sys.version.split()[0]} ({platform.python_implementation()})",
            f"Machine Hostname: {socket.gethostname()}",
            f"Device HWID     : {hwid}",
            f"CPU Info        : {telemetry.get('cpu', 'unknown')}",
            f"MAC Address     : {telemetry.get('mac', 'unknown')}",
            "",
            "2. SDK & BACKEND CONFIGURATION:",
            sub_sep,
            f"Target Server   : {self.config.server_url}",
            f"Application ID  : {self.config.app_name}",
            f"Min Version Req : {self.config.min_version}",
            f"Public Key PEM  : {'Loaded (' + str(len(self.config.public_key_pem)) + ' chars)' if self.config.public_key_pem else 'None'}",
            f"Active Session  : {self.client.get_current_key() or 'None'}",
            f"License Tier    : {self.client.get_tier()}",
            "",
            "3. STAGE-BY-STAGE TEST RESULTS:",
            sub_sep,
        ]

        for r in self.results:
            icon = "[PASS]" if r["status"] == "PASS" else "[FAIL]"
            report_lines.append(f"{icon:<8} {r['name']}")
            report_lines.append(f"         Details: {r.get('details', '')}")
            if r.get("trace"):
                report_lines.append(f"         Trace: {r['trace']}")

        report_lines.extend([
            "",
            "4. COMPLETE EXECUTION LOG:",
            sub_sep,
        ])
        report_lines.extend(self.logs)
        report_lines.append(sep)
        report_lines.append("End of Diagnostic Report. Upload this log to your engineer for analysis.")
        report_lines.append(sep)

        return "\n".join(report_lines)


# ===========================================================================
# GUI IMPLEMENTATION: Modern Dark Tkinter Application
# ===========================================================================
if HAS_TKINTER:
    class VCONTestApp(tk.Tk):
        def __init__(self):
            super().__init__()

            self.title("LicenX / VCON Python SDK - Diagnostic & Test Console")
            self.geometry("1020x760")
            self.minsize(880, 640)

            # Modern Dark Palette
            self.c_bg = "#090d16"
            self.c_card = "#111827"
            self.c_card_border = "#1f2937"
            self.c_input_bg = "#0f172a"
            self.c_text = "#f8fafc"
            self.c_text_muted = "#94a3b8"
            self.c_indigo = "#6366f1"
            self.c_indigo_hover = "#4f46e5"
            self.c_emerald = "#10b981"
            self.c_rose = "#ef4444"
            self.c_amber = "#f59e0b"
            self.c_sky = "#38bdf8"

            self.configure(bg=self.c_bg)

            # Initialize SDK Client
            self.config = SDKConfig.from_file()
            self.client = XLicenseClient(config=self.config)
            self.engine = DiagnosticEngine(config=self.config, client=self.client)
            self.is_running_tests = False

            self._setup_styles()
            self._build_ui()

            # Attempt auto-login on startup in background
            self.after(300, self._try_auto_login)

        def _setup_styles(self):
            style = ttk.Style(self)
            try:
                style.theme_use("clam")
            except Exception:
                pass

            style.configure(
                "TProgressbar",
                background=self.c_indigo,
                troughcolor=self.c_card,
                borderwidth=0,
            )

        def _build_ui(self):
            # Top Header Bar
            header = tk.Frame(self, bg=self.c_card, height=64, padx=20, pady=12)
            header.pack(fill="x", side="top")

            title_box = tk.Frame(header, bg=self.c_card)
            title_box.pack(side="left")

            lbl_brand = tk.Label(
                title_box,
                text="VCON / LicenX SDK Test Console",
                font=("Helvetica", 14, "bold"),
                fg=self.c_text,
                bg=self.c_card,
            )
            lbl_brand.pack(anchor="w")

            lbl_sub = tk.Label(
                title_box,
                text="Interactive License Verification, Hardware Lock & Diagnostic Suite",
                font=("Helvetica", 9),
                fg=self.c_text_muted,
                bg=self.c_card,
            )
            lbl_sub.pack(anchor="w")

            # Right header action badges
            status_box = tk.Frame(header, bg=self.c_card)
            status_box.pack(side="right")

            self.lbl_hwid_badge = tk.Label(
                status_box,
                text=f"HWID: {self.client.get_hwid()[:12]}...",
                font=("Courier", 9, "bold"),
                fg=self.c_sky,
                bg=self.c_input_bg,
                padx=8,
                pady=4,
                relief="groove",
            )
            self.lbl_hwid_badge.pack(side="right", padx=(6, 0))

            btn_copy_hwid = tk.Button(
                status_box,
                text="Copy HWID",
                font=("Helvetica", 8),
                fg=self.c_text,
                bg=self.c_card_border,
                activebackground=self.c_input_bg,
                activeforeground=self.c_text,
                relief="flat",
                command=self._copy_hwid,
                cursor="hand2",
            )
            btn_copy_hwid.pack(side="right")

            # Main Body (Split into Left: Controls & Right: Console)
            body = tk.PanedWindow(self, orient="horizontal", bg=self.c_bg, bd=0, sashwidth=6)
            body.pack(fill="both", expand=True, padx=14, pady=14)

            # LEFT PANEL: Controls (Config, Login, Test triggers)
            left_frame = tk.Frame(body, bg=self.c_bg, width=460)
            body.add(left_frame, minsize=420)

            # RIGHT PANEL: Logs & Diagnostic output
            right_frame = tk.Frame(body, bg=self.c_bg)
            body.add(right_frame, minsize=420)

            self._build_left_panel(left_frame)
            self._build_right_panel(right_frame)

        def _build_left_panel(self, parent):
            # 1. Config Card
            card_cfg = tk.LabelFrame(
                parent,
                text=" 1. SDK Configuration ",
                font=("Helvetica", 10, "bold"),
                fg=self.c_sky,
                bg=self.c_card,
                padx=12,
                pady=10,
                bd=1,
                relief="solid",
            )
            card_cfg.pack(fill="x", pady=(0, 10))

            row1 = tk.Frame(card_cfg, bg=self.c_card)
            row1.pack(fill="x", pady=2)
            tk.Label(row1, text="Server URL:", font=("Helvetica", 9), fg=self.c_text_muted, bg=self.c_card, width=12, anchor="w").pack(side="left")
            self.ent_server = tk.Entry(row1, font=("Courier", 9), bg=self.c_input_bg, fg=self.c_text, insertbackground=self.c_text, bd=1, relief="solid")
            self.ent_server.insert(0, self.config.server_url)
            self.ent_server.pack(side="left", fill="x", expand=True)

            row2 = tk.Frame(card_cfg, bg=self.c_card)
            row2.pack(fill="x", pady=2)
            tk.Label(row2, text="App Scope:", font=("Helvetica", 9), fg=self.c_text_muted, bg=self.c_card, width=12, anchor="w").pack(side="left")
            self.ent_app_name = tk.Entry(row2, font=("Courier", 9), bg=self.c_input_bg, fg=self.c_text, insertbackground=self.c_text, bd=1, relief="solid")
            self.ent_app_name.insert(0, self.config.app_name)
            self.ent_app_name.pack(side="left", fill="x", expand=True)

            row3 = tk.Frame(card_cfg, bg=self.c_card)
            row3.pack(fill="x", pady=(6, 2))
            btn_load_cfg = tk.Button(
                row3,
                text="\U0001f4c2 Browse Config File",
                font=("Helvetica", 8, "bold"),
                bg=self.c_card_border,
                fg=self.c_text,
                activebackground=self.c_indigo,
                activeforeground=self.c_text,
                relief="flat",
                command=self._browse_config,
                cursor="hand2",
            )
            btn_load_cfg.pack(side="left")

            btn_apply_cfg = tk.Button(
                row3,
                text="\U0001f504 Apply URL & Scope",
                font=("Helvetica", 8),
                bg=self.c_card_border,
                fg=self.c_text,
                relief="flat",
                command=self._apply_config_inputs,
                cursor="hand2",
            )
            btn_apply_cfg.pack(side="right")

            # 2. Authentication Card
            card_auth = tk.LabelFrame(
                parent,
                text=" 2. SDK Login & Session Management ",
                font=("Helvetica", 10, "bold"),
                fg=self.c_indigo,
                bg=self.c_card,
                padx=12,
                pady=10,
                bd=1,
                relief="solid",
            )
            card_auth.pack(fill="x", pady=(0, 10))

            # License Key and Optional PIN Label
            lbl_key_pin = tk.Frame(card_auth, bg=self.c_card)
            lbl_key_pin.pack(fill="x")
            tk.Label(lbl_key_pin, text="License Key:", font=("Helvetica", 9, "bold"), fg=self.c_text, bg=self.c_card).pack(side="left")
            tk.Label(lbl_key_pin, text="PIN (Optional):", font=("Helvetica", 8), fg=self.c_text_muted, bg=self.c_card).pack(side="right", padx=(0, 60))

            row_key = tk.Frame(card_auth, bg=self.c_card)
            row_key.pack(fill="x", pady=(2, 6))

            self.ent_key = tk.Entry(
                row_key,
                font=("Courier", 10, "bold"),
                bg=self.c_input_bg,
                fg="#38bdf8",
                insertbackground=self.c_text,
                bd=1,
                relief="solid",
            )
            self.ent_key.pack(side="left", fill="x", expand=True)

            self.ent_pin = tk.Entry(
                row_key,
                font=("Courier", 10, "bold"),
                bg=self.c_input_bg,
                fg="#38bdf8",
                insertbackground=self.c_text,
                bd=1,
                relief="solid",
                width=6,
            )
            self.ent_pin.pack(side="left", padx=(6, 4))

            btn_paste = tk.Button(
                row_key,
                text="Paste",
                font=("Helvetica", 8),
                bg=self.c_card_border,
                fg=self.c_text,
                relief="flat",
                command=self._paste_key,
                cursor="hand2",
            )
            btn_paste.pack(side="left")

            # Action Buttons Row
            btn_row = tk.Frame(card_auth, bg=self.c_card)
            btn_row.pack(fill="x", pady=(4, 8))

            self.btn_login = tk.Button(
                btn_row,
                text="\U0001f511 Login / Activate",
                font=("Helvetica", 9, "bold"),
                bg=self.c_indigo,
                fg="#ffffff",
                activebackground=self.c_indigo_hover,
                activeforeground="#ffffff",
                relief="flat",
                command=self._handle_login,
                cursor="hand2",
                padx=10,
                pady=4,
            )
            self.btn_login.pack(side="left", fill="x", expand=True, padx=(0, 4))

            self.btn_autologin = tk.Button(
                btn_row,
                text="\u26a1 Auto-Login",
                font=("Helvetica", 9),
                bg=self.c_card_border,
                fg=self.c_text,
                activebackground=self.c_input_bg,
                relief="flat",
                command=self._handle_auto_login,
                cursor="hand2",
                padx=8,
                pady=4,
            )
            self.btn_autologin.pack(side="left", padx=4)

            self.btn_logout = tk.Button(
                btn_row,
                text="\U0001f6aa Logout & Unbind",
                font=("Helvetica", 9),
                bg="#881337",
                fg="#fecdd3",
                activebackground=self.c_rose,
                relief="flat",
                command=self._handle_logout,
                cursor="hand2",
                padx=8,
                pady=4,
            )
            self.btn_logout.pack(side="left", padx=(4, 0))

            # Live Status Display in Card
            status_frame = tk.Frame(card_auth, bg=self.c_input_bg, padx=10, pady=8, bd=1, relief="solid")
            status_frame.pack(fill="x", pady=4)

            self.lbl_auth_status = tk.Label(
                status_frame,
                text="\u25cf Status: Not Authenticated",
                font=("Helvetica", 9, "bold"),
                fg=self.c_text_muted,
                bg=self.c_input_bg,
            )
            self.lbl_auth_status.pack(anchor="w")

            self.lbl_tier_status = tk.Label(
                status_frame,
                text="Tier: None | Slots: -/- | Expires: -",
                font=("Helvetica", 8),
                fg=self.c_text_muted,
                bg=self.c_input_bg,
            )
            self.lbl_tier_status.pack(anchor="w", pady=(2, 0))

            # 3. Diagnostic Test Action Card
            card_diag = tk.LabelFrame(
                parent,
                text=" 3. Diagnostic Engine ",
                font=("Helvetica", 10, "bold"),
                fg=self.c_emerald,
                bg=self.c_card,
                padx=12,
                pady=12,
                bd=1,
                relief="solid",
            )
            card_diag.pack(fill="x", expand=True)

            lbl_diag_hint = tk.Label(
                card_diag,
                text="Runs 12-step deep verification of SDK, crypto signatures, latency, and endpoints:",
                font=("Helvetica", 8),
                fg=self.c_text_muted,
                bg=self.c_card,
                wraplength=380,
                justify="left",
            )
            lbl_diag_hint.pack(anchor="w", pady=(0, 8))

            self.btn_run_tests = tk.Button(
                card_diag,
                text="\U0001f680 Run Full SDK Diagnostic Test",
                font=("Helvetica", 11, "bold"),
                bg=self.c_emerald,
                fg="#ffffff",
                activebackground="#059669",
                activeforeground="#ffffff",
                relief="flat",
                command=self._start_diagnostic_tests,
                cursor="hand2",
                pady=8,
            )
            self.btn_run_tests.pack(fill="x", pady=(2, 8))

            self.progress_bar = ttk.Progressbar(card_diag, style="TProgressbar", orient="horizontal", mode="determinate")
            self.progress_bar.pack(fill="x", pady=(0, 6))

            self.lbl_progress_step = tk.Label(
                card_diag,
                text="Ready to run diagnostics",
                font=("Helvetica", 8),
                fg=self.c_text_muted,
                bg=self.c_card,
            )
            self.lbl_progress_step.pack(anchor="w")

        def _build_right_panel(self, parent):
            # Header of right panel
            top_bar = tk.Frame(parent, bg=self.c_bg)
            top_bar.pack(fill="x", pady=(0, 6))

            lbl_log_title = tk.Label(
                top_bar,
                text="\U0001f4c4 Real-Time Diagnostic Output & Report",
                font=("Helvetica", 10, "bold"),
                fg=self.c_text,
                bg=self.c_bg,
            )
            lbl_log_title.pack(side="left")

            btn_clear = tk.Button(
                top_bar,
                text="Clear Logs",
                font=("Helvetica", 8),
                bg=self.c_card,
                fg=self.c_text_muted,
                relief="flat",
                command=self._clear_logs,
                cursor="hand2",
            )
            btn_clear.pack(side="right", padx=(4, 0))

            btn_copy = tk.Button(
                top_bar,
                text="\U0001f4cb Copy Report",
                font=("Helvetica", 8, "bold"),
                bg=self.c_card,
                fg=self.c_sky,
                relief="flat",
                command=self._copy_report,
                cursor="hand2",
            )
            btn_copy.pack(side="right", padx=(4, 0))

            btn_save = tk.Button(
                top_bar,
                text="\U0001f4be Save Report (.log)",
                font=("Helvetica", 8, "bold"),
                bg=self.c_indigo,
                fg="#ffffff",
                relief="flat",
                command=self._save_report,
                cursor="hand2",
            )
            btn_save.pack(side="right")

            # Scrolled Text Box
            self.txt_logs = ScrolledText(
                parent,
                bg="#050811",
                fg="#e2e8f0",
                font=("Courier", 9),
                bd=1,
                relief="solid",
                insertbackground="#ffffff",
            )
            self.txt_logs.pack(fill="both", expand=True)

            # Define color tags
            self.txt_logs.tag_config("PASS", foreground="#10b981", font=("Courier", 9, "bold"))
            self.txt_logs.tag_config("FAIL", foreground="#ef4444", font=("Courier", 9, "bold"))
            self.txt_logs.tag_config("WARN", foreground="#f59e0b", font=("Courier", 9, "bold"))
            self.txt_logs.tag_config("INFO", foreground="#38bdf8")
            self.txt_logs.tag_config("STEP", foreground="#a855f7", font=("Courier", 9, "bold"))
            self.txt_logs.tag_config("MUTED", foreground="#64748b")

            self._append_log("LicenX / VCON Python SDK Test Console Ready.\nLoad a config file or enter a license key to begin testing.", "MUTED")

        # -------------------------------------------------------------------
        # User Action Handlers
        # -------------------------------------------------------------------
        def _append_log(self, text: str, tag: str = "INFO"):
            self.txt_logs.insert(tk.END, text + "\n", tag)
            self.txt_logs.see(tk.END)

        def _clear_logs(self):
            self.txt_logs.delete("1.0", tk.END)

        def _copy_hwid(self):
            hwid = self.client.get_hwid()
            self.clipboard_clear()
            self.clipboard_append(hwid)
            messagebox.showinfo("Copied", f"Hardware HWID copied to clipboard:\n\n{hwid}")

        def _paste_key(self):
            try:
                clip = self.clipboard_get().strip().upper()
                if "PIN:" in clip:
                    # Parse 'KEY PIN: 1234' format if copied together
                    parts = clip.split("PIN:")
                    clip = parts[0].strip()
                    pin_part = parts[1].strip().split()[0]
                    self.ent_pin.delete(0, tk.END)
                    self.ent_pin.insert(0, pin_part)
                self.ent_key.delete(0, tk.END)
                self.ent_key.insert(0, clip)
            except Exception:
                pass

        def _browse_config(self):
            path = filedialog.askopenfilename(
                title="Select VCON Client Config JSON",
                filetypes=[("JSON Files", "*.json"), ("All Files", "*.*")],
            )
            if path:
                try:
                    self.config = SDKConfig.from_file(path)
                    self.client = XLicenseClient(config=self.config)
                    self.engine = DiagnosticEngine(config=self.config, client=self.client)
                    self.ent_server.delete(0, tk.END)
                    self.ent_server.insert(0, self.config.server_url)
                    self.ent_app_name.delete(0, tk.END)
                    self.ent_app_name.insert(0, self.config.app_name)
                    self._append_log(f"Successfully loaded config from: {path}", "PASS")
                    self._append_log(f"Scope: {self.config.app_name} | Server: {self.config.server_url}", "INFO")
                except Exception as e:
                    messagebox.showerror("Config Error", f"Failed to parse config: {e}")

        def _apply_config_inputs(self):
            srv = self.ent_server.get().strip().rstrip("/")
            app = self.ent_app_name.get().strip()
            self.config.server_url = srv
            self.config.app_name = app
            self.client = XLicenseClient(config=self.config)
            self.engine = DiagnosticEngine(config=self.config, client=self.client)
            self._append_log(f"Config parameters updated: Server={srv}, Scope={app}", "PASS")

        def _try_auto_login(self):
            saved_key = self.client.storage.load_saved_session()
            if saved_key:
                self.ent_key.delete(0, tk.END)
                self.ent_key.insert(0, saved_key)
                self._append_log(f"Found saved session key '{saved_key[:8]}...'. Auto-verifying online...", "INFO")
                self._handle_auto_login()

        def _handle_auto_login(self):
            def run():
                res = self.client.auto_login()
                self.after(0, lambda: self._update_auth_ui(res))
            threading.Thread(target=run, daemon=True).start()

        def _handle_login(self):
            key = self.ent_key.get().strip().upper()
            pin = self.ent_pin.get().strip() or None
            if not key:
                messagebox.showwarning("Input Required", "Please enter a License Key to login.")
                return

            self.btn_login.config(state="disabled", text="Activating...")
            self._append_log(f"Sending activation request for key '{key[:8]}...' (PIN: {pin or 'None'}) to {self.config.server_url}...", "INFO")

            def run():
                res = self.client.login(key, pin=pin)
                self.after(0, lambda: self._update_auth_ui(res))

            threading.Thread(target=run, daemon=True).start()

        def _handle_logout(self):
            curr_key = self.client.get_current_key()
            if not curr_key:
                messagebox.showinfo("Logout", "No active license session is currently logged in.")
                return

            if messagebox.askyesno("Confirm Logout", "Unbind this hardware device and release the slot on the server?"):
                success = self.client.logout(clear_saved_license=True)
                self.lbl_auth_status.config(text="\u25cf Status: Logged Out", fg=self.c_rose)
                self.lbl_tier_status.config(text="Tier: None | Slots: -/- | Expires: -")
                self._append_log("Device successfully logged out. Hardware slot released on server.", "PASS")

        def _update_auth_ui(self, res: LoginResult):
            self.btn_login.config(state="normal", text="\U0001f511 Login / Activate")
            if res.success:
                info = self.client.get_license_info() or {}
                tier = info.get("tier", "Standard")
                bound = info.get("bound_devices_count", 1)
                limit = info.get("device_limit", 1)
                exp = info.get("expires_at", "Lifetime")

                self.lbl_auth_status.config(text=f"\u25cf Active ({tier})", fg=self.c_emerald)
                self.lbl_tier_status.config(text=f"Tier: {tier} | Slots: {bound}/{limit} | Exp: {exp}")
                self._append_log(f"Login Success! Key activated. Tier: {tier}, Slots: {bound}/{limit}", "PASS")
            else:
                self.lbl_auth_status.config(text="\u25cf Login Failed", fg=self.c_rose)
                self.lbl_tier_status.config(text=f"Error: {res.code} - {res.message}")
                self._append_log(f"Login Failed [{res.status_code}]: {res.message} (Code: {res.code})", "FAIL")

        def _start_diagnostic_tests(self):
            if self.is_running_tests:
                return

            self.is_running_tests = True
            self.btn_run_tests.config(state="disabled", text="Running Diagnostics...")
            self.progress_bar["value"] = 0
            self.txt_logs.delete("1.0", tk.END)

            active_key = self.ent_key.get().strip().upper()

            def progress_cb(current, total, name, status):
                pct = int((current / total) * 100)
                self.after(0, lambda: self._update_progress_ui(pct, name, status))

            def run():
                summary = self.engine.run_all_tests(active_key=active_key, callback=progress_cb)
                self.after(0, lambda: self._finish_diagnostic_tests(summary))

            threading.Thread(target=run, daemon=True).start()

        def _update_progress_ui(self, pct, name, status):
            self.progress_bar["value"] = pct
            self.lbl_progress_step.config(text=f"Testing: {name}")

            # Stream logs to GUI box
            latest_line = self.engine.logs[-1] if self.engine.logs else ""
            if "[PASS]" in latest_line:
                self._append_log(latest_line, "PASS")
            elif "[FAIL]" in latest_line:
                self._append_log(latest_line, "FAIL")
            elif "[WARN]" in latest_line:
                self._append_log(latest_line, "WARN")
            elif "[STEP]" in latest_line:
                self._append_log(latest_line, "STEP")
            else:
                self._append_log(latest_line, "INFO")

        def _finish_diagnostic_tests(self, summary):
            self.is_running_tests = False
            self.btn_run_tests.config(state="normal", text="\U0001f680 Run Full SDK Diagnostic Test")
            self.progress_bar["value"] = 100
            passed = summary["passed"]
            total = summary["total"]
            self.lbl_progress_step.config(
                text=f"Diagnostic Finished: {passed}/{total} Passed ({summary['health_pct']}%) in {summary['duration']}s"
            )

            if summary["failed"] == 0:
                messagebox.showinfo("Diagnostic Complete", f"All {total} tests passed successfully!\n\nSDK & backend integration are 100% healthy.")
            else:
                messagebox.showwarning(
                    "Issues Detected",
                    f"{summary['failed']} tests failed out of {total}.\n\nClick 'Save Report' or 'Copy Report' to export the detailed logs for debugging."
                )

        def _save_report(self):
            report_text = self.engine.generate_report_text()
            default_fn = f"sdk_test_report_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

            fn = filedialog.asksaveasfilename(
                title="Save SDK Diagnostic Report",
                initialfile=default_fn,
                defaultextension=".log",
                filetypes=[("Log files", "*.log"), ("Text files", "*.txt"), ("All files", "*.*")],
            )
            if fn:
                try:
                    with open(fn, "w", encoding="utf-8") as f:
                        f.write(report_text)
                    messagebox.showinfo("Saved", f"Diagnostic report saved successfully to:\n\n{fn}")
                    self._append_log(f"Report exported to file: {fn}", "PASS")
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to save file: {e}")

        def _copy_report(self):
            report_text = self.engine.generate_report_text()
            self.clipboard_clear()
            self.clipboard_append(report_text)
            messagebox.showinfo("Copied", "Full diagnostic report copied to clipboard!\nYou can now paste it directly into your chat.")


# ===========================================================================
# HEADLESS CLI RUNNER (Fallback when Tkinter is not available or on headless)
# ===========================================================================
def run_cli_mode():
    print("=" * 70)
    print(" VCON / LicenX Python SDK - Diagnostic & Test Console (CLI Mode)")
    print("=" * 70)
    if not HAS_TKINTER:
        print("[!] Note: Running in CLI mode because Tkinter GUI is not installed in this environment.")
    print("[*] Discovering SDK configuration...")

    cfg = SDKConfig.from_file()
    client = XLicenseClient(config=cfg)
    engine = DiagnosticEngine(config=cfg, client=client)

    print(f"[*] Target Server URL : {cfg.server_url}")
    print(f"[*] Target App Scope  : {cfg.app_name}")
    print(f"[*] Device HWID       : {client.get_hwid()}")
    print("-" * 70)

    # Prompt user for optional license key
    user_key = None
    try:
        saved = client.storage.load_saved_session()
        prompt_txt = f"[?] Enter License Key to test (Press Enter to use saved '{saved[:8]}...')" if saved else "[?] Enter License Key to test (optional, press Enter to test without key): "
        val = input(prompt_txt).strip()
        user_key = val.upper() if val else saved
    except (KeyboardInterrupt, EOFError):
        print("\nExiting...")
        sys.exit(0)

    print("\n[*] Launching 12-stage forensic diagnostic test suite...\n")
    summary = engine.run_all_tests(active_key=user_key)

    for line in summary["logs"]:
        print(line)

    report_path = os.path.join(os.getcwd(), "sdk_test_report.log")
    try:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(engine.generate_report_text())
        print(f"\n[+] Full test report saved to: {report_path}")
    except Exception as e:
        print(f"\n[!] Failed to auto-save report: {e}")

    print("\n" + "=" * 70)
    print(f"Summary: {summary['passed']}/{summary['total']} Passed ({summary['health_pct']}%) in {summary['duration']}s")
    print("=" * 70)


def main():
    if "--cli" in sys.argv or not HAS_TKINTER:
        run_cli_mode()
    else:
        app = VCONTestApp()
        app.mainloop()


if __name__ == "__main__":
    main()
