import unittest
from unittest.mock import Mock, patch

from x_license_python.client import XLicenseClient
from x_license_python.device import DeviceManager
from x_license_python.login import LoginResult
from x_license_python.logout import LogoutManager


class ClientSessionReplacementTests(unittest.TestCase):
    def setUp(self):
        self.communicator = Mock()
        self.communicator.send_logout.return_value = True
        self.storage = Mock()
        self.logout_manager = LogoutManager(
            self.communicator,
            self.storage,
            auto_logout_on_exit=False,
        )
        self.logout_manager.set_active_session("OLD-KEY")

        self.client = XLicenseClient.__new__(XLicenseClient)
        self.client._authenticated = True
        self.client._current_key = "OLD-KEY"
        self.client._license_payload = {"tier": "Old"}
        self.client.storage = self.storage
        self.client.logout_manager = self.logout_manager
        self.client.login_manager = Mock()

    @staticmethod
    def login_result(success, code, license_key=None, license_data=None):
        return LoginResult(
            success=success,
            status_code=200 if success else 403,
            message="Login result",
            code=code,
            license_data=license_data,
            license_key=license_key,
        )

    def test_first_login_does_not_logout_an_existing_session(self):
        self.client._authenticated = False
        self.client._current_key = None
        self.client.login_manager.login.return_value = self.login_result(
            True,
            "OK",
            license_key="NEW-KEY",
            license_data={"tier": "New"},
        )

        result = self.client.login("NEW-KEY")

        self.assertTrue(result.success)
        self.communicator.send_logout.assert_not_called()
        self.client.login_manager.login.assert_called_once_with("NEW-KEY")

    def test_successful_replacement_releases_old_key_before_new_validation(self):
        events = []
        self.communicator.send_logout.side_effect = (
            lambda key, hwid: events.append(("logout", key, hwid)) or True
        )
        self.client.login_manager.login.side_effect = lambda key: (
            events.append(("login", key))
            or self.login_result(
                True,
                "OK",
                license_key=key,
                license_data={"tier": "New"},
            )
        )

        with patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"):
            result = self.client.login("NEW-KEY")

        self.assertEqual(
            events,
            [("logout", "OLD-KEY", "HWID-TEST"), ("login", "NEW-KEY")],
        )
        self.assertTrue(result.success)
        self.storage.stop_monitoring.assert_called_once()
        self.assertTrue(self.client.is_authenticated())
        self.assertEqual(self.client.get_current_key(), "NEW-KEY")
        self.assertEqual(self.client.get_license_info(), {"tier": "New"})
        self.assertEqual(self.logout_manager._current_license_key, "NEW-KEY")

    def test_failed_replacement_leaves_no_old_local_session_or_worker(self):
        self.client.login_manager.login.return_value = self.login_result(
            False,
            "LICENSE_REVOKED",
            license_key="NEW-KEY",
        )

        with patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"):
            result = self.client.login("NEW-KEY")

        self.assertFalse(result.success)
        self.assertEqual(result.code, "LICENSE_REVOKED")
        self.communicator.send_logout.assert_called_once_with("OLD-KEY", "HWID-TEST")
        self.storage.stop_monitoring.assert_called_once()
        self.assertFalse(self.client.is_authenticated())
        self.assertIsNone(self.client.get_current_key())
        self.assertIsNone(self.client.get_license_info())
        self.assertIsNone(self.logout_manager._current_license_key)

    def test_failed_old_session_logout_stops_replacement_validation(self):
        self.communicator.send_logout.return_value = False

        with patch.object(DeviceManager, "get_hwid", return_value="HWID-TEST"):
            result = self.client.login("NEW-KEY")

        self.assertFalse(result.success)
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.code, "PREVIOUS_SESSION_LOGOUT_FAILED")
        self.assertEqual(result.license_key, "NEW-KEY")
        self.client.login_manager.login.assert_not_called()
        self.storage.stop_monitoring.assert_called_once()
        self.assertFalse(self.client.is_authenticated())
        self.assertIsNone(self.client.get_current_key())
        self.assertIsNone(self.logout_manager._current_license_key)


if __name__ == "__main__":
    unittest.main()
