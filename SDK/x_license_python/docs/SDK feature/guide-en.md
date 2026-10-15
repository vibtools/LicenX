# English Integration Guide

Source: `SDK/x_license_python/docs/GUIDE_EN.md`

This is the English end-to-end developer guide for installing and integrating the Python client. It complements the package README with deeper workflow and API explanations. Use it alongside the source references in this folder for current implementation details.

Security-sensitive setup should follow the current source contract: keep the trusted public key provisioned out of band, supply actual client `app_version`, use HTTPS for remote servers, and treat offline grace as heartbeat-session policy rather than permission to log in offline. Historical guide statements should not be interpreted as hosted verification.
