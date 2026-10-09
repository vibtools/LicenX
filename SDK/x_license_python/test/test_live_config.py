import json
import os
import tempfile
import unittest
from unittest.mock import Mock

from x_license_python.config import SDKConfig
from x_license_python.test.app import DiagnosticEngine, load_live_config


PUBLIC_KEY = "-----BEGIN PUBLIC KEY-----\ntest-key\n-----END PUBLIC KEY-----"


class LiveConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.temp_dir.name, "live_vcon_config.json")
        self.config_data = {
            "server_url": "https://staging.licenx.com",
            "public_key_pem": PUBLIC_KEY,
            "app_name": "vcon_default",
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_config(self, data):
        with open(self.config_path, "w", encoding="utf-8") as config_file:
            json.dump(data, config_file)

    def test_loads_explicit_remote_https_config(self):
        self.write_config(self.config_data)

        config = load_live_config(self.config_path)

        self.assertEqual(config.server_url, "https://staging.licenx.com")
        self.assertEqual(config.app_name, "vcon_default")
        self.assertEqual(config.public_key_pem, PUBLIC_KEY)

    def test_requires_an_existing_explicit_config_file(self):
        with self.assertRaises(ValueError):
            load_live_config("")

        with self.assertRaises(ValueError):
            load_live_config(os.path.join(self.temp_dir.name, "missing.json"))

    def test_rejects_malformed_config_without_sdk_defaults(self):
        with open(self.config_path, "w", encoding="utf-8") as config_file:
            config_file.write("{")

        with self.assertRaises(ValueError):
            load_live_config(self.config_path)

    def test_rejects_non_live_or_placeholder_server_urls(self):
        for server_url in (
            "http://licenses.example.com",
            " https://staging.licenx.com",
            "https://localhost:3000",
            "https://127.0.0.1",
            "https://127.1",
            "https://10.0.0.8",
            "https://licenses",
            "https://api.demo.licenx.com",
            "https://api.example.com",
            "https://api.licenx.test",
        ):
            with self.subTest(server_url=server_url):
                self.write_config({**self.config_data, "server_url": server_url})
                with self.assertRaises(ValueError):
                    load_live_config(self.config_path)

    def test_requires_app_scope_and_trusted_public_pem(self):
        for override in (
            {"app_name": ""},
            {"public_key_pem": ""},
            {"public_key_pem": "demo-key"},
        ):
            with self.subTest(override=override):
                self.write_config({**self.config_data, **override})
                with self.assertRaises(ValueError):
                    load_live_config(self.config_path)

    def test_diagnostics_are_blocked_without_explicit_config(self):
        client = Mock()
        engine = DiagnosticEngine(
            config=SDKConfig(server_url="", public_key_pem="", app_name=""),
            client=client,
        )

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["total"], 1)
        client.communicator._http_get.assert_not_called()
        client.communicator._http_post.assert_not_called()

    def test_diagnostics_require_an_activated_license(self):
        client = Mock()
        client.get_current_key.return_value = None
        engine = DiagnosticEngine(
            config=SDKConfig(
                server_url="https://staging.licenx.com",
                public_key_pem=PUBLIC_KEY,
                app_name="vcon_default",
            ),
            client=client,
            live_config_loaded=True,
        )

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["total"], 1)
        client.communicator._http_get.assert_not_called()
        client.communicator._http_post.assert_not_called()

    def test_failed_health_preflight_stops_before_license_validation(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        engine = DiagnosticEngine(
            config=SDKConfig(
                server_url="https://staging.licenx.com",
                public_key_pem=PUBLIC_KEY,
                app_name="vcon_default",
            ),
            client=client,
            live_config_loaded=True,
        )
        engine._test_environment = lambda: (True, "ok")
        engine._test_hardware_hwid = lambda: (True, "ok")
        engine._test_configuration = lambda: (True, "ok")
        engine._test_backend_health = lambda: (False, "unavailable")
        engine._test_license_validation = Mock(return_value=(True, "unexpected"))

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["total"], 4)
        engine._test_license_validation.assert_not_called()

    def test_failed_key_handshake_stops_before_license_validation(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        engine = DiagnosticEngine(
            config=SDKConfig(
                server_url="https://staging.licenx.com",
                public_key_pem=PUBLIC_KEY,
                app_name="vcon_default",
            ),
            client=client,
            live_config_loaded=True,
        )
        engine._test_environment = lambda: (True, "ok")
        engine._test_hardware_hwid = lambda: (True, "ok")
        engine._test_configuration = lambda: (True, "ok")
        engine._test_backend_health = lambda: (True, "ok")
        engine._test_public_key_handshake = lambda: (False, "key mismatch")
        engine._test_license_validation = Mock(return_value=(True, "unexpected"))

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["total"], 5)
        engine._test_license_validation.assert_not_called()

    def test_preflight_exception_stops_before_license_validation(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        engine = DiagnosticEngine(
            config=SDKConfig(
                server_url="https://staging.licenx.com",
                public_key_pem=PUBLIC_KEY,
                app_name="vcon_default",
            ),
            client=client,
            live_config_loaded=True,
        )
        engine._test_environment = lambda: (True, "ok")
        engine._test_hardware_hwid = lambda: (True, "ok")
        engine._test_configuration = lambda: (True, "ok")
        engine._test_backend_health = Mock(side_effect=RuntimeError("offline"))
        engine._test_license_validation = Mock(return_value=(True, "unexpected"))

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["total"], 4)
        engine._test_license_validation.assert_not_called()

    def test_diagnostic_report_redacts_the_active_license_key(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-LIVE-SECRET-KEY"
        client.get_hwid.return_value = "HWID-TEST"
        client.get_tier.return_value = "Standard"
        client.get_device_telemetry.return_value = {"cpu": "test", "mac": "test"}
        engine = DiagnosticEngine(
            config=SDKConfig(
                server_url="https://staging.licenx.com",
                public_key_pem=PUBLIC_KEY,
                app_name="vcon_default",
            ),
            client=client,
            live_config_loaded=True,
        )

        report = engine.generate_report_text()

        self.assertNotIn("VCON-LIVE-SECRET-KEY", report)
        self.assertIn("VCON-LIV***", report)


if __name__ == "__main__":
    unittest.main()
