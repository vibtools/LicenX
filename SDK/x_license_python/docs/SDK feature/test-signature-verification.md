# Signature Verification Tests

Test source: `SDK/x_license_python/test/test_signature_verification.py`

The suite verifies that Ed25519 and RSA responses fail closed without `cryptography`, valid and invalid signatures are distinguished when it is available, malformed RSA PKCS#1 v1.5 padding is rejected, and validation trusts only the configured PEM key rather than a key supplied by the response.

It also covers the diagnostic key handshake: missing pin or mismatched keys are rejected; only a match is accepted. Tests use local keys and mocked responses. They do not establish the identity or custody of a deployed private key. Run with `python -m unittest -q x_license_python.test.test_signature_verification` from `SDK/`.
