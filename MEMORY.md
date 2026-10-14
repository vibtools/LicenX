# LicenX Project Memory

This is a maintained orientation document for future AI-assisted work. It summarizes the current repository structure and source-backed product behavior; it is not a substitute for reading the relevant implementation before changing it.

## Tech Stack and Dependencies

- **Web application:** TypeScript (ES modules, ES2022), React 19, Vite 8, and Tailwind CSS 4. The UI uses Lucide React icons.
- **Server:** Node.js with Express 4; Vite middleware is mounted for local development, and built static assets are served in production.
- **Cloud runtime:** Cloudflare Pages Functions call the shared Cloudflare-compatible API handler. Deployment settings are in `wrangler.toml`.
- **Database:** `@libsql/client` for Turso/libSQL. Local Node development falls back to `file:vcon_data.db`; production/serverless configuration requires a remote libSQL/HTTP(S) database. Schema initialization and database access live in `src/server/db.ts`.
- **Object storage:** Cloudflare R2 through its S3-compatible API, using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`; helpers are in `src/server/r2.ts`.
- **Other server dependencies:** `archiver` builds the downloadable Python SDK archive; `cors` and `dotenv` support the Express server. Node's built-in crypto APIs are used for cryptographic operations.
- **Tooling and other declared packages:** TypeScript 7, `tsx`, Vite/React/Tailwind plugins, and their type packages support development and checks. The root manifest also declares `@google/genai` and `motion`; no active imports for these were found in the main `src/`, `scripts/`, or `server.ts` implementation during this overview, so confirm call sites before treating them as active features.
- **Python client SDK:** `SDK/x_license_python/` supports Python 3.8+ per its documentation. `cryptography` is required for signed-response verification; `requests` is optional because the SDK can use standard-library `urllib`. License validation requires the integrator-supplied `SDKConfig.app_version` (or `XLicenseClient(app_version=...)`); missing/blank values fail locally with `APP_VERSION_REQUIRED` before transport. Server `min_version` remains policy metadata and is never used as the client version. Its release package version is maintained in the SDK itself.
- **SDK diagnostic test console:** `SDK/x_license_python/test/app.py` is a Tkinter/CLI live diagnostic harness guarded by the exact-host `LICENX_STAGING_HOSTS` allowlist; it is intended for disposable non-production staging only, and the allowlist does not prove the target is non-production. Its selected config must include the actual client `app_version` separately from server policy. Secure license-key persistence is disabled, so GUI Auto-Login reports that no saved session is available; Login / Activate is the supported test-key path. The full diagnostic binds and finally logs out the supplied license. Local test coverage does not certify Node/Cloudflare parity or production behavior.
- **Package note:** Root `package.json` currently identifies the private package as `react-example` version `0.0.5`; the product/repository is branded LicenX (also called VCON in some SDK/runtime text). Check the manifest before relying on this metadata.

## Architecture and Folder Map

- `src/App.tsx`, `src/main.tsx`, and `src/index.css`: React application entry, route/tab selection, global styles, and top-level error boundary.
- `src/components/`: Admin console, public landing/customer pages, dialogs, and individual dashboard tabs.
- `src/context/`: Shared React context, including confirmation UI.
- `src/services/apiClient.ts`: Browser-side API client and authentication/error handling.
- `src/server/`: Shared server-side business logic: Express API routes, Cloudflare handler, cryptography, database, license/device policy, admin authentication/rate limits, public-access settings, and R2 storage.
- `server.ts`: Node/Express entry point; mounts the shared API routes under `/api` and `/v1`, initializes the database, and serves the frontend.
- `functions/`: Cloudflare Pages adapters for the shared API handler, versioned API, and health endpoint.
- `.github/workflows/`: GitHub Actions workflows for CI and Python SDK release automation.
- `SDK/x_license_python/`: Python SDK implementation, user guides, example app, requirements, and SDK tests.
- `tests/`: Node.js TypeScript tests and Python SDK archive verification.
- `scripts/`: Build utilities, including Python SDK archive creation.
- `public/`, `index.html`, `vite.config.ts`, and `tailwind.config.js`: Frontend shell, static assets, and build styling/tool configuration.
- `dist/`: Generated frontend build output; do not treat it as the source of truth.
- `notes/`: Local planning, forensic/audit, and implementation-status documents. `/notes/` is ignored by `.gitignore`; existing snapshots can become stale, so verify their dates and claims against current source and Git state.

The central deployment design is one shared licensing API implemented for both Node/Express and Cloudflare Pages. The browser admin UI and external SDK clients use that API; the Node and Cloudflare entry points supply their runtime-specific database, crypto, and storage bindings.

## Main Features and Business Logic

- **License administration:** Setup/admin authentication; application and license management; single and bulk key issuance; bulk actions; license status/validity and device-limit management.
- **Application-scoped policy:** Applications carry version and licensing settings, including device lease, heartbeat interval, and offline-grace values. Server/database creation defaults are `7200/1200/0`; Edit App accepts integer lease seconds above the heartbeat + grace + 10-second timeout invariant.
- **Device authorization:** Client hardware identifiers are bound to licenses subject to device limits; validation, heartbeat, logout/deactivation, and admin device management coordinate active bindings. Node and Cloudflare trim HWIDs during validation before binding/logging and reject whitespace-only identifiers. Phase 3 focused parity coverage passed 13 tests locally on 2026-10-14; only the local DB snapshot was inspected, not remote/production data.
- **Signed client validation:** `/v1/license/validate` validates a license and device and returns a signed authorization response. Client verification uses a trusted configured public key.
- **Minimum-version gate:** For an app with a configured minimum, Node and Cloudflare resolve `app_version || client_version` and reject requests missing both with HTTP 400 / `APP_VERSION_REQUIRED`; the legacy `client_version` alias remains supported in both. The focused parity suite passed 12 tests locally on 2026-10-14; hosted behavior remains unverified.
- **Validation payload guards:** Node and Cloudflare reject malformed parsed `/v1/license/validate` payloads with the same HTTP 400 `INVALID_REQUEST` response before DB work. Focused parity suite passed 14 tests on 2026-10-14; Express-level JSON syntax handling and hosted behavior remain unverified.
- **Python SDK error correlation:** The shared non-2xx sanitizer preserves only a canonical UUID-shaped `request_id` alongside safe `error`/`code`; diagnostics and arbitrary fields remain omitted. Focused requests/urllib tests passed 6 cases on 2026-10-14.
- **Integrated validation verification:** On 2026-10-14, Phase 6 passed focused Node/Cloudflare parity, signing, and error-redaction suites (24 tests), focused Phase 1/5 Python SDK regressions (65 tests), `npm.cmd run lint`, `npm.cmd run build` (SDK archive plus Vite), and `git.exe diff --check`. No Phase 6 source/UI change or deployment occurred; staging/production remain unverified.
- **Server parity publication:** Commit `0d53d1c` containing the Phase 2–4 Node/Cloudflare validation parity changes and regression tests was pushed to `origin/main` on 2026-10-14. A Cloudflare build/deployment may be triggered by the main-branch push, but no hosted deployment status was verified.
- **Heartbeat and session lifecycle:** `/v1/license/ping` checks active sessions; `/v1/license/logout` and `/v1/license/deactivate` release bindings. The Python SDK provides login, heartbeat monitoring, and logout lifecycle hooks.
- **Customer self-service:** Public license status checks and PIN-protected device-control/reset flows are available when public access settings allow them.
- **Admin console:** Overview, apps, licenses, devices, logs, cryptographic simulator, client/SDK code, profile, admin API keys, site settings, and general settings tabs.
- **Cloudflare error diagnostics:** License validation failures and generic Cloudflare 500s log redacted exception details correlated by UUID; generic responses remain `Internal server error` and include an additive `request_id`. Only the authenticated Live Validator gets its safe stage/name/message envelope. Schema initialization and unexpected auth-verifier failures propagate to the generic catch; expected auth denials remain unchanged. Local Node tests pass, but hosted runtime behavior and the reported 500 root causes remain unverified until deployment/runtime logs are checked.
- **Audit and branding:** Validation/audit logs, configurable site metadata and public-access controls, branding asset uploads, and R2-backed storage/backup helpers.
- **Python SDK distribution:** The admin/API surface can provide the Python SDK archive; `npm run build:sdk-archive` builds it.
- **Security-sensitive behavior:** Preserve the existing authentication/authorization, CSRF protections, rate limits, input validation, TLS requirements, signature verification, secret handling, and runtime parity. Consult the relevant implementation and security documentation before modifying these flows.

For endpoint details and deployment/setup guidance, see the root `README.md`. For SDK module responsibilities and integration policy, see `SDK/x_license_python/README.md`.

## Coding and Workflow Conventions

- Follow the complete root `AI_INSTRUCTIONS.md` and this repository's `AGENTS.md` before work. Preserve architecture, public APIs, data, security controls, user changes, and deployment strategy.
- Make the smallest complete change within the requested scope. Reuse the shared server helpers and existing UI components; avoid duplicated Node/Cloudflare behavior.
- Frontend code is React with TypeScript; shared application types are in `src/types.ts`. TypeScript uses the `@/` path alias for the repository root.
- Server API routes are organized in the shared `src/server/api.ts` Express router; Cloudflare requests are adapted through `src/server/cloudflareHandler.ts`.
- Keep API and database changes backward-compatible. Follow the existing schema initialization approach in `src/server/db.ts`; do not change schemas or migrations unless explicitly required.
- Preserve existing validation, error-redaction, authentication, and security patterns. Do not put secrets, credentials, or private keys in source, logs, documentation, or generated examples.
- Use focused tests that exercise the requested behavior. Root scripts: `npm test` (Node built-in test runner via `tsx`), `npm run lint` (`tsc --noEmit`), `npm run build` (Vite production build, preceded by the SDK archive prebuild), and `npm run verify:sdk-archive`. Python SDK tests are under `SDK/x_license_python/test/` and use `unittest`.
- Run only the verification needed for the task; report whether evidence is source-present, locally tested, hosted, staging, or production. Never claim deployment verification based only on local checks.
- Preserve the `/notes/` ignore rule and existing local notes/worktree data. Do not commit, reset, or discard user changes unless explicitly asked.

## Context Freshness

Source code and manifests are authoritative for current implementation and dependencies. README files describe intended/user-facing behavior; dated audit and phase notes are historical evidence and may not reflect later edits. Check current Git status before modifying files and treat pre-existing changes as protected. Do not record secrets or assume local test evidence proves hosted or production behavior.
