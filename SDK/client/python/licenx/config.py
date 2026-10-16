"""Python-first application config loading with legacy JSON compatibility."""

import ast
import os
import sys
import json
from dataclasses import dataclass, fields
from typing import Optional

MIN_PING_INTERVAL_SECONDS = 60
MAX_PING_INTERVAL_SECONDS = 1200
MAX_OFFLINE_GRACE_SECONDS = 3600


class SDKConfigError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass
class SDKConfig:
    server_url: str = "http://localhost:3000"
    public_key_pem: str = ""
    app_name: str = "vcon_default"
    display_name: str = "Default App"
    min_version: str = "1.0.0"
    ping_interval_seconds: int = 1200  # 20 minutes periodic verification
    offline_grace_seconds: int = 0
    auto_logout_on_exit: bool = True
    request_timeout_seconds: int = 35
    auto_login_enabled: bool = True
    auto_save_session: bool = True
    enable_background_heartbeat: bool = True
    strict_online_only: bool = True
    app_version: Optional[str] = None

    def __post_init__(self) -> None:
        if (
            type(self.ping_interval_seconds) is not int
            or not MIN_PING_INTERVAL_SECONDS <= self.ping_interval_seconds <= MAX_PING_INTERVAL_SECONDS
        ):
            raise ValueError(
                "ping_interval_seconds must be an integer between 60 and 1200 seconds"
            )
        if (
            type(self.offline_grace_seconds) is not int
            or not 0 <= self.offline_grace_seconds <= MAX_OFFLINE_GRACE_SECONDS
        ):
            raise ValueError(
                "offline_grace_seconds must be an integer between 0 and 3600 seconds"
            )

    @classmethod
    def _from_mapping(
        cls,
        data,
        *,
        reject_unknown_fields: bool,
        normalize_server_url: bool = False,
    ) -> "SDKConfig":
        if not isinstance(data, dict) or any(type(key) is not str for key in data):
            raise SDKConfigError("CONFIG_SCHEMA_ERROR", "Config must be a string-keyed object")

        config_fields = {field.name for field in fields(cls)}
        allowed_fields = config_fields | {"generated_at"}
        unknown_fields = set(data) - allowed_fields
        if reject_unknown_fields and unknown_fields:
            raise SDKConfigError("CONFIG_SCHEMA_ERROR", "Config contains unsupported fields")

        config_values = {key: value for key, value in data.items() if key in config_fields}
        string_fields = {
            "server_url",
            "public_key_pem",
            "app_name",
            "display_name",
            "min_version",
        }
        boolean_fields = {
            "auto_logout_on_exit",
            "auto_login_enabled",
            "auto_save_session",
            "enable_background_heartbeat",
            "strict_online_only",
        }
        integer_fields = {
            "ping_interval_seconds",
            "offline_grace_seconds",
            "request_timeout_seconds",
        }

        for field_name in string_fields:
            if field_name in config_values and type(config_values[field_name]) is not str:
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", f"{field_name} must be a string")
        if "app_version" in config_values and config_values["app_version"] is not None:
            if type(config_values["app_version"]) is not str:
                raise SDKConfigError(
                    "CONFIG_SCHEMA_ERROR", "app_version must be a string or None"
                )
        for field_name in boolean_fields:
            if field_name in config_values and type(config_values[field_name]) is not bool:
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", f"{field_name} must be a boolean")
        for field_name in integer_fields:
            if field_name in config_values and type(config_values[field_name]) is not int:
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", f"{field_name} must be an integer")
        if "generated_at" in data and type(data["generated_at"]) is not str:
            raise SDKConfigError("CONFIG_SCHEMA_ERROR", "generated_at must be a string")

        for field_name in ("server_url", "app_name"):
            value = config_values.get(field_name)
            if value is not None and not value.strip():
                raise SDKConfigError("CONFIG_VALUE_ERROR", f"{field_name} cannot be blank")

        public_key_pem = config_values.get("public_key_pem")
        if not isinstance(public_key_pem, str) or not public_key_pem.strip():
            raise SDKConfigError(
                "CONFIG_VALUE_ERROR", "public_key_pem must contain a trusted public key"
            )

        try:
            from cryptography.exceptions import UnsupportedAlgorithm
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
            from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
            from cryptography.hazmat.primitives.serialization import load_pem_public_key
        except ImportError:
            raise SDKConfigError(
                "CONFIG_VALUE_ERROR", "cryptography is required to validate public_key_pem"
            ) from None

        normalized_public_key = public_key_pem.strip()
        if "\\n" in normalized_public_key and "\n" not in normalized_public_key:
            normalized_public_key = normalized_public_key.replace("\\n", "\n")
        try:
            public_key = load_pem_public_key(normalized_public_key.encode("utf-8"))
        except (TypeError, ValueError, UnsupportedAlgorithm):
            raise SDKConfigError(
                "CONFIG_VALUE_ERROR", "public_key_pem must be a valid public key PEM"
            ) from None
        if not isinstance(public_key, (RSAPublicKey, Ed25519PublicKey)):
            raise SDKConfigError(
                "CONFIG_VALUE_ERROR", "public_key_pem must be an RSA or Ed25519 public key"
            )

        if normalize_server_url and "server_url" in config_values:
            server_url = config_values["server_url"].rstrip("/")
            if server_url.endswith("/api"):
                server_url = server_url[:-4]
            config_values["server_url"] = server_url

        try:
            return cls(**config_values)
        except ValueError as error:
            raise SDKConfigError("CONFIG_VALUE_ERROR", str(error)) from None

    @classmethod
    def from_file(cls, config_path: Optional[str] = None) -> "SDKConfig":
        """
        Load a legacy JSON config file, or discover one when no path is supplied.

        Prefer from_config_path() or from_discovered_file() for Python-first loading.
        """
        target_path = None

        if config_path:
            if not os.path.isfile(config_path):
                raise SDKConfigError("CONFIG_FILE_NOT_FOUND", "Config file was not found")
            target_path = config_path
        else:
            raw_dirs = [os.getcwd()]
            try:
                if "__main__" in sys.modules and hasattr(sys.modules["__main__"], "__file__"):
                    main_file = sys.modules["__main__"].__file__
                    if main_file:
                        raw_dirs.append(os.path.dirname(os.path.abspath(main_file)))
            except Exception:
                pass

            try:
                if getattr(sys, "frozen", False) or not sys.executable.lower().endswith("python.exe"):
                    raw_dirs.append(os.path.dirname(os.path.abspath(sys.executable)))
            except Exception:
                pass

            seen_dirs = set()
            candidate_dirs = []
            for d in raw_dirs:
                if not d or not os.path.isdir(d):
                    continue
                c_d = os.path.normcase(os.path.realpath(os.path.abspath(d)))
                if c_d not in seen_dirs:
                    seen_dirs.add(c_d)
                    candidate_dirs.append(d)

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

        return cls.from_json_file(target_path)

    @classmethod
    def from_json_file(cls, config_path: str) -> "SDKConfig":
        """Load one JSON config file, returning safe errors instead of defaults on failure."""
        try:
            with open(config_path, "r", encoding="utf-8") as config_file:
                data = json.load(config_file)
        except FileNotFoundError:
            raise SDKConfigError("CONFIG_FILE_NOT_FOUND", "Config file was not found") from None
        except (OSError, UnicodeError):
            raise SDKConfigError("CONFIG_FILE_READ_ERROR", "Config file could not be read") from None
        except json.JSONDecodeError:
            raise SDKConfigError("CONFIG_PARSE_ERROR", "Config file contains invalid JSON") from None

        return cls._from_mapping(
            data,
            reject_unknown_fields=False,
            normalize_server_url=True,
        )

    @classmethod
    def from_config_path(cls, config_path: Optional[str] = None) -> "SDKConfig":
        """Load an explicit Python/JSON config path, or discover a config when omitted."""
        if not config_path:
            return cls.from_discovered_file()
        if not os.path.isfile(config_path):
            raise SDKConfigError("CONFIG_FILE_NOT_FOUND", "Config file was not found")
        if os.path.splitext(os.fspath(config_path))[1].lower() == ".py":
            return cls.from_python_file(config_path)
        return cls.from_json_file(config_path)

    @classmethod
    def from_discovered_file(cls) -> "SDKConfig":
        """Prefer one app-root Python config and retain legacy JSON discovery."""
        raw_candidates = [os.getcwd()]
        try:
            main_module = sys.modules.get("__main__")
            main_file = getattr(main_module, "__file__", None)
            if main_file:
                raw_candidates.append(os.path.dirname(os.path.abspath(main_file)))
        except (OSError, TypeError, ValueError):
            pass

        try:
            if getattr(sys, "frozen", False) or not sys.executable.lower().endswith("python.exe"):
                raw_candidates.append(os.path.dirname(os.path.abspath(sys.executable)))
        except (OSError, TypeError, ValueError):
            pass

        def _canonical(p: str) -> str:
            try:
                return os.path.normcase(os.path.realpath(os.path.abspath(p)))
            except Exception:
                return os.path.normcase(os.path.abspath(p))

        seen_dirs = set()
        candidate_dirs = []
        for directory in raw_candidates:
            if not directory or not os.path.isdir(directory):
                continue
            c_dir = _canonical(directory)
            if c_dir not in seen_dirs:
                seen_dirs.add(c_dir)
                candidate_dirs.append(directory)

        seen_python = set()
        python_candidates = []
        seen_json = set()
        json_candidates = []
        for directory in candidate_dirs:
            try:
                filenames = os.listdir(directory)
            except OSError:
                continue
            for filename in filenames:
                path = os.path.join(directory, filename)
                if not os.path.isfile(path):
                    continue
                c_path = _canonical(path)
                if filename == "licenx.config.py":
                    if c_path not in seen_python:
                        seen_python.add(c_path)
                        python_candidates.append(path)
                elif filename.endswith("_vcon_config.json") or filename == "vcon_config.json":
                    if c_path not in seen_json:
                        seen_json.add(c_path)
                        json_candidates.append(path)

        if len(python_candidates) > 1 or (python_candidates and json_candidates):
            raise SDKConfigError(
                "CONFIG_SOURCE_AMBIGUOUS",
                "Multiple Python/JSON config files were found; select one explicitly",
            )
        if python_candidates:
            return cls.from_python_file(python_candidates[0])
        if len(json_candidates) > 1:
            raise SDKConfigError(
                "CONFIG_SOURCE_AMBIGUOUS",
                "Multiple Python/JSON config files were found; select one explicitly",
            )
        if json_candidates:
            return cls.from_json_file(json_candidates[0])
        return cls()

    @classmethod
    def from_python_file(cls, config_path: str) -> "SDKConfig":
        """Load a literal app_config mapping without executing the Python file."""
        try:
            with open(config_path, "r", encoding="utf-8") as config_file:
                source = config_file.read()
        except FileNotFoundError:
            raise SDKConfigError("CONFIG_FILE_NOT_FOUND", "Config file was not found") from None
        except (OSError, UnicodeError):
            raise SDKConfigError("CONFIG_FILE_READ_ERROR", "Config file could not be read") from None

        try:
            module = ast.parse(source, filename=config_path)
        except SyntaxError:
            raise SDKConfigError("CONFIG_PARSE_ERROR", "Python config contains invalid syntax") from None

        allowed_assignments = {"app_config", "client_options", "sdk_fixed_constraints"}
        literal_assignments = {}
        for statement_index, statement in enumerate(module.body):
            if (
                statement_index == 0
                and isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Constant)
                and isinstance(statement.value.value, str)
            ):
                continue
            if (
                not isinstance(statement, ast.Assign)
                or len(statement.targets) != 1
                or not isinstance(statement.targets[0], ast.Name)
            ):
                raise SDKConfigError(
                    "CONFIG_PARSE_ERROR",
                    "Python config may contain only literal dictionary assignments",
                )

            name = statement.targets[0].id
            if name not in allowed_assignments:
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", "Python config contains an unsupported assignment")
            if name in literal_assignments:
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", "Python config contains a duplicate assignment")

            try:
                value = ast.literal_eval(statement.value)
            except (ValueError, TypeError, MemoryError, RecursionError):
                raise SDKConfigError(
                    "CONFIG_PARSE_ERROR",
                    "Python config assignments must contain literal values",
                ) from None
            if not isinstance(value, dict):
                raise SDKConfigError("CONFIG_SCHEMA_ERROR", f"Python config {name} must be a dictionary")
            literal_assignments[name] = value

        if "app_config" not in literal_assignments:
            raise SDKConfigError("CONFIG_SCHEMA_ERROR", "Python config must define app_config")
        return cls._from_mapping(
            literal_assignments["app_config"],
            reject_unknown_fields=True,
        )

    def export_to_file(self, file_path: str) -> None:
        """Export config to a JSON file compatible across languages"""
        payload = {
            "server_url": self.server_url,
            "public_key_pem": self.public_key_pem,
            "app_name": self.app_name,
            "display_name": self.display_name,
            "min_version": self.min_version,
            "app_version": self.app_version,
            "ping_interval_seconds": self.ping_interval_seconds,
            "offline_grace_seconds": self.offline_grace_seconds,
            "auto_logout_on_exit": self.auto_logout_on_exit,
            "request_timeout_seconds": self.request_timeout_seconds,
            "auto_login_enabled": self.auto_login_enabled,
            "auto_save_session": self.auto_save_session,
            "enable_background_heartbeat": self.enable_background_heartbeat,
            "strict_online_only": self.strict_online_only,
        }
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
