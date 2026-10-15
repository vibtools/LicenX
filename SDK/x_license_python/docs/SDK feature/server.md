# Transport and Signed Protocol

Source: `SDK/x_license_python/server.py`

## Transport

`ServerCommunicator` normalizes the configured base URL and builds `/api/v1/license/*` endpoints. Remote HTTP is rejected before credentials are sent; HTTP is allowed only for localhost/loopback development targets. TLS certificate verification uses the platform defaults and is not disabled.

If installed, `requests` is preferred. Otherwise, POST and GET use `urllib` with JSON bodies, explicit timeouts, and a default SSL context. Install `cryptography` for response signature verification; missing crypto support causes signed responses to fail closed. `requests` is optional for HTTP transport.

## Validation and Heartbeat

`validate_license()` requires nonblank `config.app_version`, sends the normalized key, HWID, minimal device metadata, app scope, client timestamp, and client version, then verifies a successful signed payload using only configured `public_key_pem`. Any `public_key` in the server response is discarded as untrusted.

`ping_heartbeat()` adds a fresh random nonce and accepts only an active, correctly signed response echoing that nonce. Transient service/network failures are classified for the worker's grace policy; TLS errors, malformed responses, server denials, and failed signatures do not receive that grace.

`send_logout()` tries `/logout`, then `/deactivate` as a fallback. `_safe_response()` strips backend details from failed responses and preserves a request ID only when it matches UUID syntax. Public `LoginResult.request_id` exposes this safe correlation value; no diagnostic header is sent.

## Cryptographic Format

The signature payload is canonical sorted compact JSON (`sort_keys=True`, separators `(',', ':')`). The client supports RSA PKCS#1 v1.5 with SHA-256 and Ed25519, through `cryptography`. Keep the matching public key in trusted config and rotate it through a trusted distribution process.
