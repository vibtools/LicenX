import json
import os
import tempfile
import unittest
from unittest.mock import Mock, patch

from x_license_python.config import SDKConfig
from x_license_python.device import DeviceManager
from x_license_python.login import LoginManager
from x_license_python.server import ServerCommunicator
from x_license_python.test.app import (
    DIAGNOSTIC_HEARTBEAT_INTERVAL_SECONDS,
    DiagnosticEngine,
    create_diagnostic_client,
    is_admin_device_logout_reason,
    load_live_config,
    record_session_revocation,
)


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

    def test_diagnostic_report_redacts_hardware_and_host_identifiers(self):
        identifiers = {
            "hwid": "HWID-REPORT-1234-5678-ABCD-EF01",
            "device_name": "host-report-secret",
            "mac_address": "02:11:22:33:44:55",
            "motherboard_uuid": "board-report-secret",
            "disk_serial": "disk-report-secret",
            "cpu_info": "cpu-report-secret",
            "local_ip": "192.0.2.44",
        }
        client = Mock()
        client.get_current_key.return_value = None
        client.get_hwid.return_value = identifiers["hwid"]
        client.get_tier.return_value = "Standard"
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )
        engine.logs.append(
            "diagnostic values: " + " ".join(identifiers.values())
        )

        with patch(
            "x_license_python.test.app.DeviceManager.get_device_telemetry",
            return_value=identifiers,
        ), patch(
            "x_license_python.test.app.socket.gethostname",
            return_value="host-report-secret",
        ), patch(
            "x_license_python.test.app.platform.node",
            return_value="host-report-secret",
        ):
            report = engine.generate_report_text()

        for identifier in identifiers.values():
            self.assertNotIn(identifier, report)
        self.assertIn("Device HWID     : [REDACTED]", report)
        self.assertIn("Machine Hostname: [REDACTED]", report)

    def test_login_uses_validation_metadata_without_public_ip_lookup(self):
        config = SDKConfig()
        communicator = Mock()
        communicator.validate_license.return_value = (
            False,
            404,
            {"error": "License not found", "code": "NOT_FOUND"},
        )
        manager = LoginManager(config, communicator, Mock())
        validation_metadata = {
            "device_name": "test-host",
            "os_info": "Test OS",
        }

        with patch.object(DeviceManager, "get_hwid", return_value="test-hwid"), patch.object(
            DeviceManager,
            "get_validation_telemetry",
            return_value=validation_metadata,
        ), patch.object(
            DeviceManager,
            "get_device_telemetry",
            side_effect=AssertionError("full telemetry must not be collected for login"),
        ), patch.object(
            DeviceManager,
            "get_public_ip",
            side_effect=AssertionError("login must not look up public IP"),
        ):
            result = manager.login("vcon-test-key")

        self.assertFalse(result.success)
        communicator.validate_license.assert_called_once_with(
            license_key="VCON-TEST-KEY",
            hwid="test-hwid",
            telemetry=validation_metadata,
        )

    def test_device_telemetry_looks_up_public_ip_only_when_requested(self):
        with patch.object(DeviceManager, "_cached_telemetry", None), patch.object(
            DeviceManager, "get_hwid", return_value="test-hwid"
        ), patch.object(
            DeviceManager, "get_motherboard_uuid", return_value="board-id"
        ), patch.object(
            DeviceManager, "get_disk_serial", return_value="disk-id"
        ), patch.object(
            DeviceManager, "get_cpu_info", return_value="cpu-model"
        ), patch.object(
            DeviceManager, "get_mac_address", return_value="02:11:22:33:44:55"
        ), patch.object(
            DeviceManager, "get_local_ip", return_value="192.0.2.10"
        ), patch.object(
            DeviceManager, "get_public_ip", return_value="198.51.100.20"
        ) as public_ip_lookup:
            local_telemetry = DeviceManager.get_device_telemetry()
            public_ip_lookup.assert_not_called()
            full_telemetry = DeviceManager.get_device_telemetry(include_public_ip=True)

        self.assertNotIn("public_ip", local_telemetry)
        self.assertEqual(full_telemetry["public_ip"], "198.51.100.20")
        public_ip_lookup.assert_called_once_with()

    def test_validation_request_omits_nested_full_telemetry(self):
        communicator = ServerCommunicator(SDKConfig())
        communicator._http_post = Mock(return_value=(400, {"error": "invalid"}))
        telemetry = {
            "device_name": "test-host",
            "os_info": "Test OS",
            "mac_address": "02:11:22:33:44:55",
            "motherboard_uuid": "board-secret",
            "public_ip": "198.51.100.9",
        }

        communicator.validate_license("VCON-TEST-KEY", "test-hwid", telemetry)

        request_body = communicator._http_post.call_args.args[1]
        self.assertEqual(
            set(request_body),
            {
                "license_key",
                "hwid",
                "device_name",
                "os_info",
                "app_name",
                "app_version",
                "client_time",
            },
        )
        self.assertEqual(request_body["device_name"], "test-host")
        self.assertEqual(request_body["os_info"], "Test OS")

    def test_diagnostic_signature_request_uses_only_validation_metadata(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        client.get_hwid.return_value = "test-hwid"
        engine = DiagnosticEngine(
            config=SDKConfig(app_name="vcon_default", min_version="1.0.0"),
            client=client,
            live_config_loaded=True,
        )
        engine.communicator._build_url.return_value = "https://license.test/validate"
        engine.communicator._http_post.return_value = (
            200,
            {"valid": True, "signature": "signed-response"},
        )
        engine.communicator.verify_signature.side_effect = [True, False]

        with patch.object(
            DeviceManager,
            "get_validation_telemetry",
            return_value={"device_name": "test-host", "os_info": "Test OS"},
        ):
            passed, _ = engine._test_crypto_signature(None)

        self.assertTrue(passed)
        request_body = engine.communicator._http_post.call_args.args[1]
        self.assertEqual(
            set(request_body),
            {
                "license_key",
                "hwid",
                "device_name",
                "os_info",
                "app_name",
                "app_version",
                "client_time",
            },
        )

    def test_diagnostic_client_uses_short_heartbeat_and_revocation_callback(self):
        callback = Mock()
        sentinel_client = object()
        config = SDKConfig(ping_interval_seconds=1200, enable_background_heartbeat=False)

        with patch("x_license_python.test.app.XLicenseClient", return_value=sentinel_client) as client_factory:
            client = create_diagnostic_client(config, callback)

        self.assertIs(client, sentinel_client)
        self.assertEqual(config.ping_interval_seconds, DIAGNOSTIC_HEARTBEAT_INTERVAL_SECONDS)
        self.assertTrue(config.enable_background_heartbeat)
        client_factory.assert_called_once_with(config=config, on_license_revoked=callback)

    def test_admin_logout_reason_is_distinguished_from_other_revocations(self):
        self.assertTrue(
            is_admin_device_logout_reason(
                "Device binding was logged out or unlinked by administrator"
            )
        )
        self.assertFalse(is_admin_device_logout_reason("License has expired"))

    def test_storage_and_clock_diagnostic_does_not_claim_encryption(self):
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=Mock(),
            live_config_loaded=True,
        )

        passed, details = engine._test_storage_integrity()

        self.assertTrue(passed)
        self.assertIn("clock drift checks passed", details)
        self.assertIn("not encrypted", details)

    def test_logout_diagnostic_checks_unbound_ping_and_clears_local_session(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        client.get_hwid.return_value = "HWID-TEST"
        client.logout.return_value = True
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )
        engine.communicator.ping_heartbeat.return_value = (
            False,
            {"valid": False, "code": "DEVICE_UNBOUND"},
        )

        passed, details = engine._test_logout_protocol("VCON-TEST-KEY")

        self.assertTrue(passed)
        self.assertIn("DEVICE_UNBOUND", details)
        client.logout.assert_called_once_with(clear_saved_license=True)
        engine.communicator.ping_heartbeat.assert_called_once_with(
            "VCON-TEST-KEY",
            "HWID-TEST",
        )

    def test_logout_diagnostic_fails_for_unrelated_ping_rejection(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        client.logout.return_value = True
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )
        engine.communicator.ping_heartbeat.return_value = (
            False,
            {"valid": False, "code": "LICENSE_EXPIRED"},
        )

        passed, details = engine._test_logout_protocol("VCON-TEST-KEY")

        self.assertFalse(passed)
        self.assertIn("Expected DEVICE_UNBOUND", details)

    def test_external_admin_logout_observation_is_included_in_report(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        client.get_hwid.return_value = "HWID-TEST"
        client.get_tier.return_value = "Standard"
        client.get_device_telemetry.return_value = {}
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )

        engine.record_external_test_result(
            "Admin Panel Device Logout Propagation",
            True,
            "Admin-panel device logout was detected.",
        )

        report = engine.generate_report_text()
        self.assertIn("Admin Panel Device Logout Propagation", report)
        self.assertIn("[PASS]", report)

    def test_admin_logout_callback_is_reported_without_changing_diagnostic_score(self):
        client = Mock()
        client.get_current_key.return_value = None
        client.get_hwid.return_value = "HWID-TEST"
        client.get_tier.return_value = "None"
        client.get_device_telemetry.return_value = {}
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )

        is_admin_logout = record_session_revocation(
            engine,
            "Device binding was logged out or unlinked by administrator",
            "session-1:admin-unbound",
        )
        report = engine.generate_report_text()

        self.assertTrue(is_admin_logout)
        self.assertEqual(engine.results, [])
        self.assertIn("Overall Status  : [NO DIAGNOSTICS RUN]", report)
        self.assertIn("OBSERVED SESSION EVENTS (not included in diagnostic score)", report)
        self.assertIn("[OBSERVED] Admin Panel Device Logout", report)
        self.assertIn("Score           : 0/0", report)

    def test_duplicate_admin_logout_callbacks_are_deduplicated(self):
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=Mock(),
            live_config_loaded=True,
        )

        for _ in range(3):
            record_session_revocation(
                engine,
                "Device binding was logged out or unlinked by administrator",
                "session-2:admin-unbound",
            )

        self.assertEqual(len(engine.observed_events), 1)
        self.assertEqual(engine.results, [])

    def test_revocation_report_uses_sanitized_details(self):
        client = Mock()
        client.get_current_key.return_value = None
        client.get_hwid.return_value = "HWID-TEST"
        client.get_tier.return_value = "None"
        client.get_device_telemetry.return_value = {}
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )
        record_session_revocation(
            engine,
            "DEVICE_UNBOUND key=VCON-SECRET-KEY pin=1234",
            "session-3:server-revoked",
        )

        report = engine.generate_report_text()

        self.assertIn("Server Revocation", report)
        self.assertNotIn("VCON-SECRET-KEY", report)
        self.assertNotIn("1234", report)

    def test_server_logout_stops_remaining_live_diagnostics(self):
        client = Mock()
        client.get_current_key.return_value = "VCON-TEST-KEY"
        engine = DiagnosticEngine(
            config=SDKConfig(),
            client=client,
            live_config_loaded=True,
        )
        engine._test_environment = lambda: (engine.request_stop() or (True, "ok"))
        engine._test_hardware_hwid = Mock(return_value=(True, "must not run"))

        summary = engine.run_all_tests()

        self.assertEqual(summary["failed"], 1)
        self.assertIn("Diagnostic interrupted", [result["name"] for result in summary["results"]])
        engine._test_hardware_hwid.assert_not_called()


if __name__ == "__main__":
    unittest.main()
