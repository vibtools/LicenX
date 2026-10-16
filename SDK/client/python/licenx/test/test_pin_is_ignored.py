import unittest
from unittest.mock import Mock, patch

from licenx.config import SDKConfig
from licenx.login import LoginManager
from licenx.server import ServerCommunicator


class LicensePinSeparationTests(unittest.TestCase):
    def test_login_does_not_forward_legacy_pin(self):
        config = SDKConfig(auto_login_enabled=False, enable_background_heartbeat=False)
        communicator = Mock()
        communicator.validate_license.return_value = (
            False,
            403,
            {"code": "AUTH_REJECTED"},
        )
        manager = LoginManager(config, communicator, Mock())

        with patch(
            "licenx.login.DeviceManager.get_device_telemetry",
            return_value={"hwid": "test-hwid"},
        ):
            manager.login("test-license", pin="1234")

        self.assertNotIn("pin", communicator.validate_license.call_args.kwargs)

    def test_communicator_does_not_send_legacy_pin(self):
        communicator = ServerCommunicator(SDKConfig(app_version="1.0.0"))
        communicator._http_post = Mock(return_value=(403, {"code": "AUTH_REJECTED"}))

        communicator.validate_license(
            license_key="test-license",
            hwid="test-hwid",
            telemetry={},
            pin="1234",
        )

        sent_body = communicator._http_post.call_args.args[1]
        self.assertNotIn("pin", sent_body)


if __name__ == "__main__":
    unittest.main()
