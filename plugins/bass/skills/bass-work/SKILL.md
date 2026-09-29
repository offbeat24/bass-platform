---
name: bass-work
description: Implement or resume a defined BASS task through verification and review. Excludes read-only questions and initial product shaping.
---

# BASS Work

Use `node <launcher>`; resolve `../../scripts/bass-launcher.cjs` relative to this file. Reuse task decisions; use bass-shape only for unresolved scope or acceptance.

- Read `<BASS> agent guide <id> --json`; follow its scope, plan, approvals, limits and capability calls. If semantic mode is `enforce`, run `semantic prepare` before ACTIVE and resolve findings.
- Route each role with `<BASS> route <id> --role <role>`. Apply alias and effort when supported; record deviations in `models_used` with actual alias/model, `followed_recommendation: false` and reason.
- Before a named provider call, use its doctor and capability claim. Invoke only on `run`, reuse on `reuse`, stop on `uncertain`, then record actual status. Never install or substitute providers.
- Match criteria to the smallest affected checks and evidence. For material UI, record target renders, screenshots, viewports and console count. For remaining errors, record normalized, secret-redacted before/after SHA-256 signatures and evidence under the same conditions; unchanged baseline warns, missing/new/increased errors fail.
- After meaningful changes, run affected checks; reuse passing evidence and save logs to `.bass/evidence/<id>/`. Retry only failed or directly affected checks.
- With semantic mode on, record exact criteria, claims and quoted evidence, then run `semantic verify`; missing or failed judgments never pass.
- Finish the attempt and proportional Run Record (`unknown` usage stays `unknown`). Pass pre-review before REVIEW and present results/evidence/limits. Finalization needs explicit final approval; implementation authorization is not final approval.
