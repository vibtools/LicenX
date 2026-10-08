import builtins
import contextlib
import io
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from x_license_python import LoginResult, SDKConfig, XLicenseClient


class ReadmeQuickStartTests(unittest.TestCase):
    def test_basic_integration_example_matches_sdk_api(self):
        readme_path = Path(__file__).resolve().parents[3] / "README.md"
        with open(readme_path, encoding="utf-8") as readme_file:
            readme = readme_file.read()

        section = readme.split("### Basic Integration", 1)[1].split(
            "### Manual Heartbeat & Logout", 1
        )[0]
        example = section.split("```python", 1)[1].split("```", 1)[0]
        config = SDKConfig(
            server_url="https://license.example",
            app_name="readme-test",
            public_key_pem="trusted-public-key",
        )

        class ExampleClient:
            def __init__(self, supplied_config):
                self.config = supplied_config
                self.assert_trust_anchor()

            def assert_trust_anchor(self):
                if not self.config.public_key_pem:
                    raise AssertionError("README example must load a trusted public key")

            def login(self, license_key):
                return LoginResult(
                    success=True,
                    status_code=200,
                    message="Activated",
                    code="OK",
                    hwid="HWID-TEST",
                    license_key=license_key,
                )

            def get_tier(self):
                return "Pro"

        original_import = builtins.__import__

        def import_sdk(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "x_license_python":
                return SimpleNamespace(XLicenseClient=ExampleClient, SDKConfig=SDKConfig)
            return original_import(name, globals, locals, fromlist, level)

        example_globals = {
            "__builtins__": {**vars(builtins), "__import__": import_sdk},
        }
        output = io.StringIO()
        with patch.object(SDKConfig, "from_file", return_value=config) as load_config:
            with contextlib.redirect_stdout(output):
                exec(compile(example, "README.md", "exec"), example_globals)

        load_config.assert_called_once_with("my_app_vcon_config.json")
        self.assertTrue(
            {"success", "hwid", "code", "message"}.issubset(
                LoginResult.__dataclass_fields__
            )
        )
        self.assertTrue(hasattr(XLicenseClient, "login"))
        self.assertTrue(hasattr(XLicenseClient, "get_tier"))
        self.assertIn("License Activated! Tier: Pro", output.getvalue())
        self.assertIn("Hardware ID: HWID-TEST", output.getvalue())


if __name__ == "__main__":
    unittest.main()
