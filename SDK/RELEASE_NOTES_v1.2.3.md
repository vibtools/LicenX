# Python SDK v1.2.3

This patch release improves SDK-side error correlation and makes the live diagnostic console safer and clearer to operate.

## Highlights

- Adds an optional `LoginResult.request_id` for canonical UUID request IDs returned with sanitized failed validation responses. The SDK does not add a diagnostic request-ID header.
- Keeps transport errors sanitized across `requests` and the standard-library `urllib` fallback while preserving only a safe error code and valid request ID.
- Requires the integrator's actual client `app_version` for validation. The diagnostic console prompts for it when an Admin config omits it; it does not substitute or overwrite server policy `min_version`.
- Restricts live diagnostics to explicitly allowlisted staging or separately allowlisted Production hostnames. Production activation and full diagnostics require separate operator confirmations.
- Redacts license keys and device/host identifiers in diagnostic output, preserves the selected heartbeat/offline-grace settings, and disables live/config controls while diagnostics run.
- Removes the active license key from the sample application's progress output and adds a regression test that checks captured stdout.
- Corrects the package README's request-ID example and parses its fenced Python snippets in the test suite.

## Compatibility and Security

No existing public SDK exports were removed. `app_version` must be supplied through configuration or the client constructor before validation; missing values fail closed before transport. License-key persistence remains disabled. The example no longer prints the key, and a regression test guards its output. The README's documented `request_id` snippet is syntactically valid and covered by a fenced-Python syntax check.

The local v1.2.3 source candidate has not been tagged or published. No staging or production validation was performed, and this release note is not a production-readiness certification.

---

# Python SDK v1.2.3 (বাংলা)

এই patch release-এ SDK error correlation এবং live diagnostic console চালানোর নিরাপত্তা ও স্পষ্টতা উন্নত করা হয়েছে।

## উল্লেখযোগ্য পরিবর্তন

- Sanitized validation error-এর সঙ্গে server canonical UUID request ID দিলে `LoginResult.request_id`-এ সেটি পাওয়া যায়। SDK নিজে diagnostic request-ID header পাঠায় না।
- `requests` এবং standard-library `urllib` transport-এ error sanitization বজায় থাকে; কেবল নিরাপদ error code এবং valid request ID রাখা হয়।
- License validation-এর আগে integrator-কে চলমান client-এর আসল `app_version` দিতে হয়। Admin config-এ এটি না থাকলে diagnostic console prompt করে; server policy `min_version`-কে client version হিসেবে ব্যবহার বা overwrite করে না।
- Live diagnostic চালাতে স্পষ্ট allowlisted staging অথবা আলাদা allowlisted Production hostname লাগে। Production activation এবং পূর্ণ diagnostics-এর জন্য আলাদা operator confirmation আবশ্যক।
- Diagnostic output-এ license key এবং device/host identifier redacted থাকে, নির্বাচিত heartbeat/offline-grace policy বজায় থাকে এবং diagnostics চলার সময় live/config control বন্ধ থাকে।
- Sample application-এর progress output থেকে license key সরানো হয়েছে এবং captured stdout-এ key না থাকার regression test যোগ হয়েছে।
- Package README-র request-ID example-এর syntax ঠিক করা হয়েছে; test suite fenced Python snippets parse করে।

## সামঞ্জস্য ও নিরাপত্তা

বিদ্যমান public SDK export সরানো হয়নি। Validation-এর আগে config অথবা client constructor-এ `app_version` দিতে হবে; না থাকলে transport শুরু হওয়ার আগেই fail closed হয়। License-key persistence বন্ধই আছে। Sample app আর license key print করে না; regression test output-এ key অনুপস্থিতি নিশ্চিত করে। README-র Python snippets-ও syntax test-এর আওতায় আছে।

স্থানীয় v1.2.3 source candidate এখনো tag বা publish করা হয়নি। Staging/production validation হয়নি এবং এই release note production-readiness certification নয়।
