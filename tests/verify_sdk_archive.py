from pathlib import Path
import sys
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
SDK_ROOT = ROOT / "SDK" / "x_license_python"
ARCHIVE_PATH = ROOT / "public" / "x_license_python.zip"
ARCHIVE_ROOT = "x_license_python/"


def eligible_source_files() -> dict[str, Path]:
    files = {}
    for source_path in SDK_ROOT.rglob("*"):
        if not source_path.is_file():
            continue
        relative_path = source_path.relative_to(SDK_ROOT).as_posix()
        if (
            "__pycache__" in relative_path
            or relative_path.endswith(".pyc")
            or ".DS_Store" in relative_path
        ):
            continue
        files[f"{ARCHIVE_ROOT}{relative_path}"] = source_path
    return files


def main() -> int:
    expected_files = eligible_source_files()
    errors: list[str] = []

    try:
        with ZipFile(ARCHIVE_PATH) as archive:
            corrupt_entry = archive.testzip()
            if corrupt_entry:
                errors.append(f"Corrupt ZIP entry: {corrupt_entry}")

            actual_files = {
                entry.filename
                for entry in archive.infolist()
                if not entry.is_dir()
            }
            missing_files = sorted(expected_files.keys() - actual_files)
            extra_files = sorted(actual_files - expected_files.keys())
            errors.extend(f"Missing from ZIP: {name}" for name in missing_files)
            errors.extend(f"Unexpected ZIP entry: {name}" for name in extra_files)

            for archive_name in sorted(expected_files.keys() & actual_files):
                source_path = expected_files[archive_name]
                if archive.read(archive_name) != source_path.read_bytes():
                    errors.append(f"Content differs from source: {archive_name}")
    except (BadZipFile, OSError) as error:
        errors.append(f"Cannot read SDK ZIP: {error}")

    if errors:
        print(
            f"SDK ZIP parity failed ({len(expected_files)} eligible source files, "
            f"{ARCHIVE_PATH.name}):"
        )
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"SDK ZIP parity passed for {len(expected_files)} source files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
