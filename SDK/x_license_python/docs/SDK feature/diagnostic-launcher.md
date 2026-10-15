# Repository Diagnostic Launcher

Source: `SDK/test/app.py`

## Behavior

This thin launcher locates `SDK/x_license_python/test/app.py` relative to itself, with a parent-directory fallback. It reads and compiles the target Python file, then executes it in the current process. If neither path exists, it prints an error and exits nonzero.

It contains no SDK authentication, target validation, or diagnostics of its own; those live in the target app. Running the launcher does not bypass the console's allowlist or confirmation flow. The direct SDK test app can also be run with `python SDK/x_license_python/test/app.py` from the repository root.

## Maintenance

Keep path resolution aligned with the repository layout. Avoid adding credentials or target defaults to this wrapper; actual live target selection belongs to the operator and the guarded console.
