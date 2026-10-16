# SDK Dependencies

Source: `SDK/x_license_python/requirements.txt`

The requirements file declares:

- `requests>=2.28.0` for the preferred HTTP transport. It is optional at runtime because `server.py` falls back to Python's `urllib`.
- `cryptography>=41.0.0` for RSA and Ed25519 response signature verification. This dependency is security-critical: when absent, the SDK rejects signed authorization responses rather than accepting unverified data.

Install with `python -m pip install -r requirements.txt` from the package directory (or pass its path). Do not remove `cryptography` merely because the package can be imported without it; license authorization requires successful cryptographic verification.
