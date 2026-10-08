"""
VCON Python Client SDK - Configuration Module
Supports loading from global '<app_name>_vcon_config.json', 'vcon_config.json',
or direct programmatic instantiation.
"""

import os
import sys
import json
from dataclasses import dataclass
from typing import Optional


@dataclass
class SDKConfig:
    server_url: str = "http://localhost:3000"
    public_key_pem: str = ""
    app_name: str = "vcon_default"
    display_name: str = "Default App"
    min_version: str = "1.0.0"
    ping_interval_seconds: int = 1200  # 20 minutes periodic verification
    auto_logout_on_exit: bool = True
    request_timeout_seconds: int = 15
    auto_login_enabled: bool = True
    auto_save_session: bool = True
    enable_background_heartbeat: bool = True
    strict_online_only: bool = True

    @classmethod
    def from_file(cls, config_path: Optional[str] = None) -> "SDKConfig":
        """
        Auto-discovers and loads config from JSON file.
        Searches for specified file, or any '*_vcon_config.json' or 'vcon_config.json' in
        the current working directory or the script's directory.
        """
        target_path = None

        if config_path and os.path.exists(config_path):
            target_path = config_path
        else:
            candidate_dirs = [os.getcwd()]
            try:
                if "__main__" in sys.modules and hasattr(sys.modules["__main__"], "__file__"):
                    main_file = sys.modules["__main__"].__file__
                    if main_file:
                        main_dir = os.path.dirname(os.path.abspath(main_file))
                        if main_dir not in candidate_dirs:
                            candidate_dirs.append(main_dir)
            except Exception:
                pass

            for d in candidate_dirs:
                if not os.path.isdir(d):
                    continue
                try:
                    for filename in os.listdir(d):
                        if filename.endswith("_vcon_config.json") or filename == "vcon_config.json":
                            target_path = os.path.join(d, filename)
                            break
                except Exception:
                    continue
                if target_path:
                    break

        if not target_path:
            return cls()

        try:
            with open(target_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            server_url = data.get("server_url", "http://localhost:3000").rstrip("/")
            if server_url.endswith("/api"):
                server_url = server_url[:-4]

            return cls(
                server_url=server_url,
                public_key_pem=data.get("public_key_pem", ""),
                app_name=data.get("app_name", "vcon_default"),
                display_name=data.get("display_name", "Default App"),
                min_version=data.get("min_version", "1.0.0"),
                ping_interval_seconds=int(data.get("ping_interval_seconds", 1200)),
                auto_logout_on_exit=bool(data.get("auto_logout_on_exit", True)),
                request_timeout_seconds=int(data.get("request_timeout_seconds", 15)),
                auto_login_enabled=bool(data.get("auto_login_enabled", True)),
                auto_save_session=bool(data.get("auto_save_session", True)),
                enable_background_heartbeat=bool(data.get("enable_background_heartbeat", True)),
                strict_online_only=bool(data.get("strict_online_only", True)),
            )
        except Exception as e:
            print(f"[VCON-SDK] Warning: Could not parse config at '{target_path}': {e}")
            return cls()

    def export_to_file(self, file_path: str) -> None:
        """Export config to a JSON file compatible across languages"""
        payload = {
            "server_url": self.server_url,
            "public_key_pem": self.public_key_pem,
            "app_name": self.app_name,
            "display_name": self.display_name,
            "min_version": self.min_version,
            "ping_interval_seconds": self.ping_interval_seconds,
            "auto_logout_on_exit": self.auto_logout_on_exit,
            "request_timeout_seconds": self.request_timeout_seconds,
            "auto_login_enabled": self.auto_login_enabled,
            "auto_save_session": self.auto_save_session,
            "enable_background_heartbeat": self.enable_background_heartbeat,
            "strict_online_only": self.strict_online_only,
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
