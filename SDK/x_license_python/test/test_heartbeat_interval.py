import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

from x_license_python.client import XLicenseClient
from x_license_python.config import SDKConfig
from x_license_python.storage import BackgroundLicenseWorker


class HeartbeatIntervalValidationTests(unittest.TestCase):
    invalid_intervals = (0, -1, 1.5, True, "15", 59, 1201)
    invalid_grace_values = (-1, 1.5, True, "600", 3601)

    def test_sdk_config_rejects_invalid_intervals(self):
        for interval in self.invalid_intervals:
            with self.subTest(interval=interval):
                with self.assertRaisesRegex(ValueError, "integer between 60 and 1200"):
                    SDKConfig(ping_interval_seconds=interval)

    def test_worker_rejects_invalid_intervals_before_starting(self):
        for interval in self.invalid_intervals:
            with self.subTest(interval=interval):
                with self.assertRaisesRegex(ValueError, "integer between 60 and 1200"):
                    BackgroundLicenseWorker(
                        "interval-test",
                        ping_interval_seconds=interval,
                    )

    def test_config_and_worker_reject_invalid_offline_grace(self):
        for grace in self.invalid_grace_values:
            with self.subTest(grace=grace):
                with self.assertRaisesRegex(ValueError, "integer between 0 and 3600"):
                    SDKConfig(offline_grace_seconds=grace)
                with self.assertRaisesRegex(ValueError, "integer between 0 and 3600"):
                    BackgroundLicenseWorker("grace-test", offline_grace_seconds=grace)

    def test_invalid_file_interval_warns_and_uses_safe_default(self):
        for interval in self.invalid_intervals:
            with self.subTest(interval=interval), tempfile.TemporaryDirectory() as directory:
                config_path = Path(directory) / "vcon_config.json"
                config_path.write_text(
                    json.dumps({"ping_interval_seconds": interval}),
                    encoding="utf-8",
                )
                warning = io.StringIO()

                with redirect_stdout(warning):
                    config = SDKConfig.from_file(str(config_path))

                self.assertEqual(config.ping_interval_seconds, 1200)
                self.assertIn("ping_interval_seconds must be an integer between 60 and 1200", warning.getvalue())

    def test_client_does_not_replace_explicit_zero_with_default(self):
        with self.assertRaisesRegex(ValueError, "integer between 60 and 1200"):
            XLicenseClient(
                app_name="interval-test",
                server_url="https://license.example",
                ping_interval_seconds=0,
            )

    def test_positive_values_are_preserved_and_worker_waits_between_pings(self):
        config = SDKConfig(ping_interval_seconds=60, offline_grace_seconds=600)
        worker = BackgroundLicenseWorker(
            "interval-test",
            ping_interval_seconds=60,
            offline_grace_seconds=600,
        )
        communicator = Mock()
        communicator.ping_heartbeat.return_value = (True, {"valid": True})
        worker._server_communicator = communicator
        worker._current_license_key = "LIC-TEST"
        worker._current_hwid = "HWID-TEST"
        worker._running = True

        with patch.object(worker._stop_event, "wait", side_effect=[False, True]) as wait:
            worker._worker_loop()

        self.assertEqual(config.ping_interval_seconds, 60)
        self.assertEqual(config.offline_grace_seconds, 600)
        self.assertEqual(worker.ping_interval_seconds, 60)
        self.assertEqual(worker.offline_grace_seconds, 600)
        self.assertEqual(wait.call_args_list[0].kwargs, {"timeout": 60})
        communicator.ping_heartbeat.assert_called_once_with("LIC-TEST", "HWID-TEST")

    def test_file_positive_interval_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "vcon_config.json"
            config_path.write_text(
                json.dumps({"ping_interval_seconds": 60, "offline_grace_seconds": 600}),
                encoding="utf-8",
            )

            config = SDKConfig.from_file(str(config_path))

        self.assertEqual(config.ping_interval_seconds, 60)
        self.assertEqual(config.offline_grace_seconds, 600)

    def test_config_export_includes_offline_grace(self):
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "vcon_config.json"
            SDKConfig(ping_interval_seconds=300, offline_grace_seconds=900).export_to_file(
                str(config_path)
            )
            config = SDKConfig.from_file(str(config_path))

        self.assertEqual(config.ping_interval_seconds, 300)
        self.assertEqual(config.offline_grace_seconds, 900)


if __name__ == "__main__":
    unittest.main()
