# Diagnostic Console Test README

Source: `SDK/x_license_python/test/README.md`

This is the operator guide for running the Tkinter/CLI test console. It documents Python/Tkinter setup, dependencies, explicit config selection, actual app-version entry, exact-host staging/Production allowlists, consent requirements, possible binding/audit side effects, report redaction, and the 12-stage suite.

Follow the safety gates exactly. An allowlisted host is not independently proven to be non-production; Production needs separate authorization and a disposable test license. The full run ends with a logout/unbind attempt, but remote cleanup can fail. A passing report is scoped to this SDK and its configured public endpoints, not overall product readiness.
