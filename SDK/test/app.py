#!/usr/bin/env python3
"""
Launcher for VCON / LicenX Python SDK Test Console
"""
import os
import sys

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_TARGET_APP = os.path.join(_SCRIPT_DIR, "x_license_python", "test", "app.py")

if not os.path.exists(_TARGET_APP):
    _TARGET_APP = os.path.join(os.path.dirname(_SCRIPT_DIR), "x_license_python", "test", "app.py")

if os.path.exists(_TARGET_APP):
    with open(_TARGET_APP, "rb") as f:
        code = compile(f.read(), _TARGET_APP, "exec")
        exec(code)
else:
    print(f"[ERROR] Could not find SDK test app at: {_TARGET_APP}")
    sys.exit(1)
