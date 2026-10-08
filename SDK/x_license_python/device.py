"""
VCON Python Client SDK - Hardware Device Telemetry & HWID Generator
Gathers comprehensive hardware signatures (HDD/SSD, CPU, Motherboard UUID, MAC, OS, IP, Location)
and calculates a robust, deterministic SHA-256 hardware identifier.
"""

import os
import sys
import time
import uuid
import socket
import hashlib
import platform
import subprocess
from typing import Dict, Any, Optional
import urllib.request


class DeviceManager:
    _cached_hwid: Optional[str] = None
    _cached_telemetry: Optional[Dict[str, Any]] = None
    _cached_public_ip: Optional[str] = None

    @classmethod
    def get_motherboard_uuid(cls) -> str:
        """Retrieves system/motherboard unique UUID based on OS"""
        try:
            if sys.platform.startswith("win"):
                cmd = "wmic csproduct get uuid"
                output = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode()
                lines = [line.strip() for line in output.splitlines() if line.strip()]
                if len(lines) >= 2:
                    return lines[1]
            elif sys.platform.startswith("darwin"):
                cmd = "ioreg -rd1 -c IOPlatformExpertDevice | grep -E '(IOPlatformUUID)'"
                output = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode()
                for part in output.split("="):
                    val = part.strip().strip('"')
                    if "-" in val and len(val) >= 30:
                        return val
            elif sys.platform.startswith("linux"):
                if os.path.exists("/etc/machine-id"):
                    with open("/etc/machine-id", "r") as f:
                        mid = f.read().strip()
                        if mid:
                            return mid
                if os.path.exists("/var/lib/dbus/machine-id"):
                    with open("/var/lib/dbus/machine-id", "r") as f:
                        mid = f.read().strip()
                        if mid:
                            return mid
        except Exception:
            pass
        return platform.node() or "GENERIC-SYSTEM-UUID"

    @classmethod
    def get_disk_serial(cls) -> str:
        """Retrieves Primary Storage Drive (HDD/SSD) serial number"""
        try:
            if sys.platform.startswith("win"):
                cmd = "wmic diskdrive get serialnumber"
                output = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode()
                lines = [line.strip() for line in output.splitlines() if line.strip()]
                if len(lines) >= 2:
                    return lines[1].replace(" ", "")
            elif sys.platform.startswith("linux"):
                try:
                    cmd = "lsblk --nodeps -no serial 2>/dev/null | head -n 1"
                    output = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode().strip()
                    if output:
                        return output
                except Exception:
                    pass
                for p in ["/sys/class/block/sda/device/serial", "/sys/class/block/vda/device/serial"]:
                    if os.path.exists(p):
                        with open(p, "r") as f:
                            serial = f.read().strip()
                            if serial:
                                return serial
                if os.path.exists("/etc/machine-id"):
                    with open("/etc/machine-id", "r") as f:
                        return f"DISK-{f.read().strip()[:16]}"
            elif sys.platform.startswith("darwin"):
                cmd = "system_profiler SPStorageDataType | grep 'Volume UUID' | head -n 1"
                output = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode().strip()
                if output:
                    return output.split(":")[-1].strip()
        except Exception:
            pass
        return "GENERIC-DISK-SERIAL"

    @classmethod
    def get_mac_address(cls) -> str:
        """Retrieves system MAC address"""
        try:
            mac_num = uuid.getnode()
            mac_hex = ":".join(f"{(mac_num >> elements) & 0xff:02x}" for elements in range(0, 2 * 6, 8)[::-1])
            return mac_hex.upper()
        except Exception:
            return "00:00:00:00:00:00"

    @classmethod
    def get_cpu_info(cls) -> str:
        """Retrieves processor model name and specs"""
        if sys.platform.startswith("linux") and os.path.exists("/proc/cpuinfo"):
            try:
                with open("/proc/cpuinfo", "r") as f:
                    for line in f:
                        if "model name" in line:
                            model = line.split(":", 1)[1].strip()
                            return f"{model}:{os.cpu_count() or 1}"
            except Exception:
                pass
        return f"{platform.processor() or platform.machine() or 'CPU_GENERIC'}:{os.cpu_count() or 1}"

    @classmethod
    def get_local_ip(cls) -> str:
        """Retrieves internal LAN IP address"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    @classmethod
    def get_public_ip(cls) -> str:
        """Retrieves external internet IP (cached to avoid blocking)"""
        if cls._cached_public_ip:
            return cls._cached_public_ip

        try:
            req = urllib.request.Request(
                "https://api.ipify.org?format=text",
                headers={"User-Agent": "VCON-License-SDK/1.0"},
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                cls._cached_public_ip = resp.read().decode("utf-8").strip()
                return cls._cached_public_ip
        except Exception:
            cls._cached_public_ip = cls.get_local_ip()
            return cls._cached_public_ip

    @classmethod
    def get_hwid(cls) -> str:
        """
        Generates deterministic, tamper-resistant SHA-256 hardware identifier.
        Combines Motherboard UUID + Primary Disk Serial + CPU Spec + MAC Address.
        Format: HWID-XXXX-XXXX-XXXX-XXXX
        """
        if cls._cached_hwid:
            return cls._cached_hwid

        parts = [
            cls.get_motherboard_uuid(),
            cls.get_disk_serial(),
            cls.get_cpu_info(),
            cls.get_mac_address(),
        ]
        raw = "||".join(parts)
        sha = hashlib.sha256(raw.encode("utf-8")).hexdigest().upper()
        # Form formatted chunk: HWID-XXXX-XXXX-XXXX-XXXX
        cls._cached_hwid = f"HWID-{sha[0:4]}-{sha[4:8]}-{sha[8:12]}-{sha[12:16]}"
        return cls._cached_hwid

    @classmethod
    def get_device_telemetry(cls) -> Dict[str, Any]:
        """
        Builds full JSON device details payload for server-side monitoring
        including hardware, OS, network, and location/timezone.
        """
        if cls._cached_telemetry:
            return cls._cached_telemetry

        hwid = cls.get_hwid()
        device_name = platform.node() or socket.gethostname() or "Unknown-PC"
        os_info = f"{platform.system()} {platform.release()} ({platform.machine()})"

        try:
            tz = time.tzname[0] if time.tzname else "UTC"
        except Exception:
            tz = "UTC"

        cls._cached_telemetry = {
            "hwid": hwid,
            "device_name": device_name,
            "os_info": os_info,
            "platform": sys.platform,
            "mac_address": cls.get_mac_address(),
            "motherboard_uuid": cls.get_motherboard_uuid(),
            "disk_serial": cls.get_disk_serial(),
            "cpu_info": cls.get_cpu_info(),
            "local_ip": cls.get_local_ip(),
            "public_ip": cls.get_public_ip(),
            "timezone": tz,
            "system_locale": f"{tz} ({time.strftime('%z')})",
        }
        return cls._cached_telemetry

    @classmethod
    def get_full_telemetry(cls) -> Dict[str, Any]:
        """Alias for get_device_telemetry"""
        return cls.get_device_telemetry()
