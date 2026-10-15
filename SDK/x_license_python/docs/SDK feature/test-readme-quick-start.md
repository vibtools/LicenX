# README Quick-Start Contract Tests

Test source: `SDK/x_license_python/test/test_readme_quick_start.py`

This module checks two documentation contracts: every fenced Python example in the package README parses as valid Python, and the repository-root basic integration example remains aligned with the exported client API and expected usage. Treat it as a lightweight regression check; it does not execute every documented workflow or contact a real license server.

Run with `python -m unittest -q x_license_python.test.test_readme_quick_start` from `SDK/`. If the example changes, update the README and this contract test together.
