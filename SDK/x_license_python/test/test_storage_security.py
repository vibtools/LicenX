import base64
import json
import os
import tempfile
import unittest

from x_license_python.storage import BackgroundLicenseWorker


class LicenseSessionStorageSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.worker = BackgroundLicenseWorker(app_name="storage-security-test")
        self.worker._session_file = os.path.join(self.temp_dir.name, "session.dat")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_does_not_persist_license_key(self):
        self.worker.save_session("VCON-SECRET-KEY", {"tier": "Pro"})

        self.assertFalse(os.path.exists(self.worker._session_file))
        self.assertIsNone(self.worker.load_saved_session())

    def test_legacy_base64_session_is_rejected_and_removed(self):
        payload = {
            "license_key": "VCON-LEGACY-KEY",
            "app_name": self.worker.app_name,
        }
        with open(self.worker._session_file, "w", encoding="utf-8") as session_file:
            session_file.write(
                base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")
            )

        self.assertIsNone(self.worker.load_saved_session())
        self.assertFalse(os.path.exists(self.worker._session_file))

    def test_clear_session_removes_existing_file(self):
        with open(self.worker._session_file, "w", encoding="utf-8") as session_file:
            session_file.write("legacy session")

        self.worker.clear_session()

        self.assertFalse(os.path.exists(self.worker._session_file))


if __name__ == "__main__":
    unittest.main()
