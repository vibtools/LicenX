# Mandatory Instructions for AI Agents

These rules apply to every AI agent, coding assistant, reviewer, and automated contributor working in this repository.

## Binding project instructions

Before starting any task, read the complete `AI_INSTRUCTIONS.md` and follow every rule in it. Those 30 sections are incorporated here by reference and are mandatory, not optional suggestions. This file makes them explicit for tools that discover `AGENTS.md`; it does not replace or weaken `AI_INSTRUCTIONS.md`. If instructions conflict, obey the user's current request where applicable, then follow the safer and more restrictive compatible rule.

## Non-negotiable project constraints

- Treat this as an established project. Preserve its architecture, APIs, behavior, user experience, database, security controls, and deployment strategy unless the user explicitly requests a change.
- Work only on the exact requested bug or feature. For bug fixes, fix the root cause with the smallest complete change; do not recreate, remove, redesign, or independently alter existing features or logic.
- Lock scope before editing. Inspect only relevant code, follow existing patterns, reuse existing helpers, and stop exploring when sufficient context is available.
- Protect all existing user changes. Never overwrite or discard unrelated modifications; never use destructive Git operations or create commits unless explicitly requested.
- Do not add dependencies, refactor, clean up, optimize, redesign, change schemas, or fix unrelated issues unless required to complete the requested task.
- Preserve existing API contracts and backwards compatibility wherever possible. Any unavoidable behavior change must be confined to the requested root-cause fix.
- Never expose or commit credentials, tokens, private keys, or other secrets, and never weaken security controls without an explicit, legitimate requirement.
- Use the user's language (including Bangla/Banglish) for explanations when practical; keep code and technical identifiers in their appropriate form.

## Required implementation workflow

For ordinary tasks, follow:

1. Understand the request and identify its exact scope.
2. Inspect the relevant existing implementation and establish the root cause.
3. Make only the necessary, complete change, following existing code style and architecture.
4. Add or update focused regression coverage when appropriate.
5. Run the smallest relevant tests, lint, type check, or build that verifies the behavior.
6. Review the diff for regressions, unrelated edits, and preserved features.
7. Summarize the changes, changed files, verification, and any known limitation; then stop.

Do not turn a small fix into an audit, migration, redesign, broad refactor, or dependency project. Ask the user only when requirements are materially ambiguous, a product decision is needed, or proceeding risks data loss or a significant compatibility break.

## Code, repository, and verification safeguards

- Read enough context before editing; batch related changes and avoid repeated searches or reads.
- Prefer the minimum correct change over speculative abstractions or extra features.
- Match established naming, formatting, localization, validation, and error-handling patterns.
- Keep type safety; use proper types and guards rather than unnecessary casts.
- Make errors visible through established reporting mechanisms; do not silently swallow failures or return success-shaped fallbacks.
- Do not modify unrelated files or unrelated sections in a necessary file. Avoid broad formatting.
- Follow the repository's dependency and database migration practices; do not make unnecessary dependency or schema changes.
- Test the actual requested behavior, not merely a proxy. Distinguish failures caused by this task from pre-existing or environment failures; report verification honestly.
- Do not claim live/deployment verification unless it was actually performed.
- After verification and review are sufficient, stop. Do not continue with unsolicited improvements, cleanup, suggestions, or unrelated fixes.

## Communication

Keep progress updates concise. At completion, state what changed, identify changed files with links where supported, list the checks run and their outcomes, and disclose any remaining task-related limitation. Follow the user's language where practical.

## Mandatory Pre-Update Planning

Before any bug fix, feature change, production update, deployment change, or other implementation:

1. Read this file and the complete `AI_INSTRUCTIONS.md`.
2. Record the current `git rev-parse HEAD` and `git status --short`; treat the current working tree, including pre-existing user changes, as the baseline. Do not silently reset the baseline to `HEAD`.
3. Review the relevant forensic finding and current source evidence. Record any mismatch between notes and code before planning implementation.
4. Before editing product code/configuration, create or update the relevant Markdown plan under `notes/`. The plan must identify the objective, evidence/root cause, severity, exact in-scope files and behavior, explicit non-goals, compatibility/security/data risks, acceptance checks, and rollback considerations.
5. Lock one phase's scope at a time. Do not combine adjacent findings or expand the phase without explicit user direction.
6. Planning/documentation requests do not authorize implementation. Finish the requested documents and wait for the user's explicit instruction to start implementation.
7. After applying a phase patch, audit the exact diff against that phase's scope lock and acceptance criteria. Check for missing behavior, mismatches, regressions, and accidental out-of-scope edits.
8. If the audit finds a defect within the approved phase scope, fix it and rerun the same focused checks. If a required fix crosses the scope boundary, stop and document the blocker; do not make the out-of-scope change.
9. After an authorized phase, update all relevant Markdown under `notes/`, especially `PHASE_UPDATE_LOG.md`, `IMPLEMENTATION_STATUS.md`, the forensic finding, and roadmap status, with tested proof before starting another phase.
10. Never mark behavior as working solely because it compiles. Distinguish source-present, locally tested, and production/deployment verified; do not claim live verification without performing it.
11. Do not implement the next phase until the user provides a separate explicit approval command for that phase.

All development-time Markdown plans, forensic notes, error audits, and phase logs belong under `notes/`. Preserve the existing `.gitignore` behavior unless the user explicitly asks to change tracking policy.
