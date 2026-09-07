---
name: bass-work
description: Implement repository changes in BASS using the task ExecutionPlan. Read-only questions do not start implementation.
---

# BASS Work

Resolve `../../scripts/bass-launcher.cjs` relative to this file. `<BASS>` means `node <absolute launcher path>` on both Codex and Claude Code.

1. Read repository instructions and `<BASS> agent guide <task-id> --json`. Follow its operating rules, `execution_plan`, `contractVersion`, and `planFingerprint`. Load composed `Relevant context`; inspect more files when the task requires them.
2. Run `<BASS> task transition <task-id> ACTIVE`, then `<BASS> task attempt start <task-id> --json`; both enforce pre-task checks. Inspect `<BASS> task graph` when diagnosing dependency or path conflicts. Surface any budget, repeated-failure, or no-progress block as `NEEDS_DECISION` or `NEEDS_EXPERT`.
3. Implement within Allowed scope and `scopeLock`. Delete tasks include stale references and affected tests, without adjacent work.
4. For a named external call, run `<BASS> doctor --capabilities --host <codex-or-claude>` and `<BASS> capability claim <task-id> <capability-call> --host <codex-or-claude> --json`. On `run`, invoke the active host plugin and record `<BASS> capability complete ... --status <pass|fail|skipped|error> --summary <text>`. On `reuse`, reuse the result; on `uncertain`, stop because prior side effects are unknown. Never install, emulate, copy, or silently substitute providers. Runner refinement remains a reviewable proposal.
5. Run `<BASS> evaluate --task <task-id>` after the meaningful change. Reuse unchanged passing evidence; rerun only failed or newly affected checks within the plan. Save full logs under `.bass/evidence/<task-id>/` and summaries in prompts/events.
6. Finish the attempt with `<BASS> task attempt finish <task-id> --result <pass|fail|no-progress> --summary <text>`. Include measured turns when available; unavailable usage stays `unknown`.
7. Prepare a proportional run record v2. Map `execution_plan.contractVersion`, `planFingerprint`, and `capabilityCalls` to `execution_contract.contract_version`, `plan_fingerprint`, and `capability_calls`. Copy completed events into `capability_invocations` without inference.
8. Pass `<BASS> gate pre-review <task-id>`, transition to REVIEW, and present the result and evidence. Finalize only with explicit human final approval: record `<BASS> approval final <task-id> --approver <name>`, then `<BASS> task finalize <task-id>`. Reuse an applicable recorded approval; implementation authorization alone is not final approval.
