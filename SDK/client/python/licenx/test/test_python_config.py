import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from licenx.client import XLicenseClient
from licenx.config import SDKConfig, SDKConfigError


class PythonConfigLoaderTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp_dir.name) / "licenx.config.py"
        self.public_key_pem = (
            Ed25519PrivateKey.generate()
            .public_key()
            .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
            .decode("ascii")
        )
        self.app_config = {
            "server_url": "https://license.example.test",
            "public_key_pem": self.public_key_pem,
            "app_name": "config-test",
            "display_name": "Config Test",
            "min_version": "1.0.0",
            "app_version": "2.1.0",
            "ping_interval_seconds": 300,
            "offline_grace_seconds": 0,
            "auto_logout_on_exit": False,
            "request_timeout_seconds": 9,
            "auto_login_enabled": False,
            "auto_save_session": False,
            "enable_background_heartbeat": True,
            "strict_online_only": True,
            "generated_at": "2026-10-15T00:00:00Z",
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_config(self, app_config=None, suffix=""):
        values = self.app_config if app_config is None else app_config
        self.config_path.write_text(
            '"""Local SDK configuration."""\n'
            f"app_config = {values!r}\n"
            "client_options = {'on_license_revoked': None}\n"
            "sdk_fixed_constraints = {'license_key_persistence_enabled': False}\n"
            f"{suffix}",
            encoding="utf-8",
        )

    def test_loads_literal_app_config_and_ignores_metadata_maps(self):
        self.write_config()

        config = SDKConfig.from_python_file(str(self.config_path))

        self.assertEqual(config.server_url, self.app_config["server_url"])
        self.assertEqual(config.public_key_pem, self.public_key_pem)
        self.assertEqual(config.app_name, "config-test")
        self.assertEqual(config.app_version, "2.1.0")
        self.assertEqual(config.ping_interval_seconds, 300)
        self.assertEqual(config.offline_grace_seconds, 0)
        self.assertFalse(config.auto_logout_on_exit)
        self.assertFalse(config.auto_login_enabled)
        self.assertFalse(config.auto_save_session)
        self.assertTrue(config.enable_background_heartbeat)
        self.assertFalse(hasattr(config, "generated_at"))

    def test_omitted_fields_keep_sdk_defaults(self):
        self.write_config({"public_key_pem": self.public_key_pem})

        config = SDKConfig.from_python_file(str(self.config_path))

        self.assertEqual(config.app_name, "vcon_default")
        self.assertEqual(config.ping_interval_seconds, 1200)
        self.assertEqual(config.offline_grace_seconds, 0)
        self.assertIsNone(config.app_version)

    def test_rejects_unknown_fields_and_wrong_types(self):
        cases = (
            ({**self.app_config, "unexpected": "value"}, "unsupported fields"),
            ({**self.app_config, "auto_login_enabled": "false"}, "must be a boolean"),
            ({**self.app_config, "ping_interval_seconds": True}, "must be an integer"),
            ({**self.app_config, "generated_at": 123}, "generated_at must be a string"),
        )
        for app_config, message in cases:
            with self.subTest(message=message):
                self.write_config(app_config)
                with self.assertRaisesRegex(ValueError, message):
                    SDKConfig.from_python_file(str(self.config_path))

    def test_rejects_invalid_ranges_and_missing_or_invalid_trusted_key(self):
        cases = (
            ({**self.app_config, "ping_interval_seconds": 59}, "between 60 and 1200"),
            ({**self.app_config, "offline_grace_seconds": 3601}, "between 0 and 3600"),
            ({key: value for key, value in self.app_config.items() if key != "public_key_pem"}, "trusted public key"),
            ({**self.app_config, "public_key_pem": "not a PEM key"}, "valid public key PEM"),
        )
        for app_config, message in cases:
            with self.subTest(message=message):
                self.write_config(app_config)
                with self.assertRaisesRegex(ValueError, message):
                    SDKConfig.from_python_file(str(self.config_path))

    def test_rejects_executable_statements_without_running_them(self):
        marker_path = Path(self.temp_dir.name) / "executed.txt"
        self.write_config(
            suffix=(
                "from pathlib import Path\n"
                f"Path({str(marker_path)!r}).write_text('executed')\n"
            )
        )

        with self.assertRaisesRegex(ValueError, "literal dictionary assignments"):
            SDKConfig.from_python_file(str(self.config_path))

        self.assertFalse(marker_path.exists())

    def test_rejects_nonliteral_duplicate_and_missing_app_config(self):
        cases = (
            ("app_config = build_config()\n", "literal values"),
            (f"app_config = {self.app_config!r}\napp_config = {self.app_config!r}\n", "duplicate assignment"),
            ("client_options = {}\n", "must define app_config"),
        )
        for source, message in cases:
            with self.subTest(message=message):
                self.config_path.write_text(source, encoding="utf-8")
                with self.assertRaisesRegex(ValueError, message):
                    SDKConfig.from_python_file(str(self.config_path))

    def test_missing_path_is_reported_without_discovery(self):
        with self.assertRaises(SDKConfigError) as error:
            SDKConfig.from_python_file(str(self.config_path))
        self.assertEqual(error.exception.code, "CONFIG_FILE_NOT_FOUND")

    def test_client_loads_explicit_python_path_without_network(self):
        self.write_config()

        with patch("licenx.server.ServerCommunicator._http_post") as http_post:
            client = XLicenseClient(config_path=str(self.config_path))

        self.assertEqual(client.config.app_name, "config-test")
        self.assertEqual(client.config.server_url, self.app_config["server_url"])
        http_post.assert_not_called()

    def test_existing_sdk_config_constructor_inputs_remain_supported(self):
        config = SDKConfig(
            server_url="https://configured.example.test",
            public_key_pem=self.public_key_pem,
            auto_logout_on_exit=False,
        )

        self.assertIs(XLicenseClient(config=config).config, config)
        self.assertIs(XLicenseClient(config_path=config).config, config)

    def test_discovery_loads_python_config_from_working_directory(self):
        self.write_config()
        with tempfile.TemporaryDirectory() as script_dir:
            script_file = Path(script_dir) / "app.py"
            with patch("licenx.config.os.getcwd", return_value=self.temp_dir.name), patch.object(
                sys.modules["__main__"], "__file__", str(script_file), create=True
            ):
                config = SDKConfig.from_discovered_file()
                client = XLicenseClient()

        self.assertEqual(config.app_name, "config-test")
        self.assertEqual(client.config.app_name, "config-test")
        self.assertEqual(client.config.server_url, self.app_config["server_url"])

    def test_discovery_loads_python_config_from_main_script_directory(self):
        with tempfile.TemporaryDirectory() as working_dir, tempfile.TemporaryDirectory() as script_dir:
            self.config_path = Path(script_dir) / "licenx.config.py"
            self.write_config()
            script_file = Path(script_dir) / "app.py"
            with patch("licenx.config.os.getcwd", return_value=working_dir), patch.object(
                sys.modules["__main__"], "__file__", str(script_file), create=True
            ):
                config = SDKConfig.from_discovered_file()

        self.assertEqual(config.app_name, "config-test")

    def test_discovery_rejects_python_json_ambiguity(self):
        self.write_config()
        (Path(self.temp_dir.name) / "vcon_config.json").write_text(
            json.dumps({"app_name": "legacy"}),
            encoding="utf-8",
        )
        with tempfile.TemporaryDirectory() as script_dir:
            script_file = Path(script_dir) / "app.py"
            with patch("licenx.config.os.getcwd", return_value=self.temp_dir.name), patch.object(
                sys.modules["__main__"], "__file__", str(script_file), create=True
            ):
                with self.assertRaisesRegex(ValueError, "Multiple Python/JSON config files"):
                    SDKConfig.from_discovered_file()

    def test_discovery_rejects_multiple_python_configs(self):
        self.write_config()
        with tempfile.TemporaryDirectory() as script_dir:
            script_config = Path(script_dir) / "licenx.config.py"
            script_config.write_text(self.config_path.read_text(encoding="utf-8"), encoding="utf-8")
            script_file = Path(script_dir) / "app.py"
            with patch("licenx.config.os.getcwd", return_value=self.temp_dir.name), patch.object(
                sys.modules["__main__"], "__file__", str(script_file), create=True
            ):
                with self.assertRaisesRegex(ValueError, "Multiple Python/JSON config files"):
                    SDKConfig.from_discovered_file()

    def test_discovery_falls_back_to_legacy_json(self):
        json_path = Path(self.temp_dir.name) / "legacy_vcon_config.json"
        json_path.write_text(
            json.dumps({
                "app_name": "legacy-json",
                "public_key_pem": self.public_key_pem,
                "auto_logout_on_exit": False,
            }),
            encoding="utf-8",
        )
        with tempfile.TemporaryDirectory() as script_dir:
            script_file = Path(script_dir) / "app.py"
            with patch("licenx.config.os.getcwd", return_value=self.temp_dir.name), patch.object(
                sys.modules["__main__"], "__file__", str(script_file), create=True
            ):
                config = SDKConfig.from_discovered_file()

        self.assertEqual(config.app_name, "legacy-json")
        self.assertFalse(config.auto_logout_on_exit)

    def test_explicit_json_and_direct_constructor_paths_remain_available(self):
        json_path = Path(self.temp_dir.name) / "legacy_vcon_config.json"
        json_path.write_text(
            json.dumps({
                "app_name": "explicit-json",
                "public_key_pem": self.public_key_pem,
                "auto_logout_on_exit": False,
            }),
            encoding="utf-8",
        )
        json_client = XLicenseClient(config_path=str(json_path))
        direct_client = XLicenseClient(
            app_name="direct-config",
            server_url="https://direct.example.test",
            auto_logout_on_exit=False,
        )

        self.assertEqual(json_client.config.app_name, "explicit-json")
        self.assertEqual(direct_client.config.app_name, "direct-config")
        self.assertEqual(direct_client.config.server_url, "https://direct.example.test")

    def test_json_config_errors_are_typed_and_fail_before_transport(self):
        cases = (
            ("{", "CONFIG_PARSE_ERROR"),
            (
                json.dumps({"public_key_pem": self.public_key_pem, "auto_login_enabled": "false"}),
                "CONFIG_SCHEMA_ERROR",
            ),
            (json.dumps({"app_version": "2.1.0"}), "CONFIG_VALUE_ERROR"),
        )
        for contents, expected_code in cases:
            with self.subTest(expected_code=expected_code):
                json_path = Path(self.temp_dir.name) / "invalid_vcon_config.json"
                json_path.write_text(contents, encoding="utf-8")
                with self.patch_http_post() as http_post:
                    with self.assertRaises(SDKConfigError) as error:
                        XLicenseClient(config_path=str(json_path))
                self.assertEqual(error.exception.code, expected_code)
                http_post.assert_not_called()

    def test_discovery_deduplicates_case_variations_on_windows(self):
        self.write_config()
        script_file = Path(self.temp_dir.name) / "app.py"
        # Simulate casing variance between getcwd and main module __file__
        cwd_variant = str(self.temp_dir.name).lower()
        main_variant = str(script_file)
        if not main_variant[0].isupper():
            main_variant = main_variant[0].upper() + main_variant[1:]

        with patch("licenx.config.os.getcwd", return_value=cwd_variant), patch.object(
            sys.modules["__main__"], "__file__", main_variant, create=True
        ):
            config = SDKConfig.from_discovered_file()
            self.assertEqual(config.app_name, "config-test")

    @staticmethod
    def patch_http_post():
        return patch("licenx.server.ServerCommunicator._http_post")


if __name__ == "__main__":
    unittest.main()
