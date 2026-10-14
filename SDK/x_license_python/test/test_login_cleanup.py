import unittest
from unittest.mock import Mock, patch

from x_license_python.config import SDKConfig
from x_license_python.device import DeviceManager
from x_license_python.login import LoginManager


class LoginBindingCleanupTests(unittest.TestCase):
    def setUp(self):
        self.communicator = Mock()
        self.storage = Mock()
        self.manager = LoginManager(
            SDKConfig(),
            self.communicator,
            self.storage,
        )

    def test_signature_rejection_attempts_to_release_new_binding(self):
        self.communicator.validate_license.return_value = (
            False,
            403,
            {"code": "SIGNATURE_FAILED", "error": "Signature rejected"},
        )
        self.communicator.send_logout.return_value = True

        with patch.object(
            DeviceManager, "get_validation_telemetry", return_value={}
        ), patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"):
            result = self.manager.login(" lic-test ")

        self.assertFalse(result.success)
        self.assertEqual(result.code, "SIGNATURE_FAILED")
        self.communicator.send_logout.assert_called_once_with("LIC-TEST", "HWID-TEST")

    def test_clock_rejection_attempts_to_release_new_binding(self):
        self.communicator.validate_license.return_value = (
            True,
            200,
            {"valid": True, "server_time": 123},
        )
        self.communicator.send_logout.return_value = True

        with patch.object(
            DeviceManager, "get_validation_telemetry", return_value={}
        ), patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"), patch(
            "x_license_python.login.OfflineGuard.is_clock_tampered", return_value=True
        ):
            result = self.manager.login("LIC-TEST")

        self.assertFalse(result.success)
        self.assertEqual(result.code, "CLOCK_TAMPERED")
        self.communicator.send_logout.assert_called_once_with("LIC-TEST", "HWID-TEST")

    def test_ordinary_server_denial_does_not_send_logout(self):
        self.communicator.validate_license.return_value = (
            False,
            403,
            {"code": "LICENSE_REVOKED", "message": "License revoked"},
        )

        with patch.object(
            DeviceManager, "get_validation_telemetry", return_value={}
        ), patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"):
            result = self.manager.login("LIC-TEST")

        self.assertFalse(result.success)
        self.assertEqual(result.code, "LICENSE_REVOKED")
        self.communicator.send_logout.assert_not_called()

    def test_cleanup_failure_does_not_replace_signature_rejection(self):
        self.communicator.validate_license.return_value = (
            False,
            403,
            {"code": "SIGNATURE_FAILED", "error": "Signature rejected"},
        )
        self.communicator.send_logout.side_effect = RuntimeError("network failure")

        with patch.object(
            DeviceManager, "get_validation_telemetry", return_value={}
        ), patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"), patch(
            "builtins.print"
        ) as print_warning:
            result = self.manager.login("LIC-TEST")

        self.assertFalse(result.success)
        self.assertEqual(result.code, "SIGNATURE_FAILED")
        print_warning.assert_called_once()


if __name__ == "__main__":
    unittest.main()
