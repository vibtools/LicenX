# Package README

Source: `SDK/x_license_python/README.md`

This is the package's primary integration guide. It summarizes module responsibilities, Python compatibility/testing claims, installation, client configuration, a quick-start flow, trust-anchor handling, HTTPS requirements, hardware identity, telemetry minimization, logout hooks, background heartbeats, and troubleshooting/documentation links.

Use the README for onboarding, but treat the implementation and release workflow as authoritative when claims differ. In particular, persistent license-key storage is currently disabled even though legacy config flags remain available, `app_version` must be supplied by the integrator, and failed `LoginResult` values can expose a validated safe `request_id` for support correlation. The sample app does not print license keys; see the [forensic summary](AUDIT_SUMMARY.md) for verification scope and remaining caveats.

The detailed language guides and the diagnostic console have separate file references: [English guide](guide-en.md), [Bangla guide](guide-bn.md), and [test README](test-readme.md).
