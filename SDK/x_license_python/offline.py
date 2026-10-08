"""
VCON Python Client SDK - Offline Policy & Security Guard
Enforces strict online-only authentication policy.
Rejects offline login attempts and detects client system clock tampering.
"""

import time
from typing import Dict, Any


class OfflineGuard:
    @staticmethod
    def is_clock_tampered(server_time_ms: int, max_drift_minutes: float = 15.0) -> bool:
        """
        Detects local PC clock manipulation or rollback attacks.
        Compares client machine epoch with server timestamp.
        """
        if not server_time_ms:
            return False

        local_time_ms = int(time.time() * 1000)
        drift_minutes = abs(local_time_ms - server_time_ms) / (1000 * 60)
        return drift_minutes > max_drift_minutes

    @staticmethod
    def verify_clock(server_time_ms: int = 0, max_drift_minutes: float = 15.0) -> bool:
        """
        Returns True if clock is valid and not tampered with.
        """
        if not server_time_ms:
            return True
        return not OfflineGuard.is_clock_tampered(server_time_ms, max_drift_minutes)

    @staticmethod
    def check_online_policy(strict_online_only: bool = True) -> bool:
        """
        Enforces online requirement.
        Offline logins are disallowed by design to guarantee instantaneous license revocation.
        """
        return not strict_online_only


# Alias for backward-compatibility and clean imports
OfflineLicenseManager = OfflineGuard
