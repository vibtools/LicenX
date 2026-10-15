import contextlib
import io
import unittest
from unittest.mock import Mock, patch

from x_license_python import example_app


class ExampleAppSecurityTests(unittest.TestCase):
    def test_processing_output_never_prints_license_key(self):
        license_key = "VCON-PRIVATE-TEST-LICENSE"
        client = Mock()
        client.auto_login.return_value = Mock(success=False, message="No session")
        client.login.return_value = Mock(success=True, hwid="HWID-TEST")
        client.get_tier.return_value = "Pro"
        client.get_hwid.return_value = "HWID-TEST"
        client.get_license_info.return_value = None
        client.is_authenticated.return_value = True

        output = io.StringIO()
        with patch.object(example_app, "XLicenseClient", return_value=client), patch(
            "builtins.input", return_value=license_key
        ), patch.object(example_app.time, "sleep"), contextlib.redirect_stdout(output):
            example_app.main()

        self.assertNotIn(license_key, output.getvalue())
        self.assertIn("Processing task #1", output.getvalue())


if __name__ == "__main__":
    unittest.main()
