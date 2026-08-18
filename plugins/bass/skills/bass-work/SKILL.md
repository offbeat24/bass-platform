---
name: bass-work
description: Execute coding tasks in BASS-connected repositories when the user asks to build, fix, delete, refactor, explore, or release. Use the generated ExecutionPlan to limit validation, critics, optional plugin calls, records, and rework loops.
---

# BASS Work

Resolve `../../scripts/bass-launcher.cjs` from this `SKILL.md` to an absolute path before any BASS CLI step. `<BASS>` below means `node <absolute launcher path>`; use the same launcher in Codex and Claude Code.

1. Read repository instructions and run `<BASS> agent guide <task-id> --json`.
2. Load only `Relevant context` and the PRODUCT, TECH, or DESIGN sections named by the composed context manifest. Read another file only when the task exposes a concrete need.
3. Treat `execution_plan`, `contractVersion`, and `planFingerprint` as the current completion contract. Do not add critics, capability calls, checks, agents, or loops absent from it.
4. Run `<BASS> gate pre-task <task-id>` when the task is CAPTURED, then `<BASS> task transition <task-id> ACTIVE`. Run `<BASS> task graph`, followed by `<BASS> task attempt start <task-id> --json`. If BASS reports a budget, repeated-failure, or no-progress block, stop and surface `NEEDS_DECISION` or `NEEDS_EXPERT`.
5. For delete tasks, enforce every `scopeLock`: remove stale references and affected tests, and create no adjacent improvement or follow-up task.
6. Implement the smallest accepted change. Keep Fast records to scope, acceptance, and verification only.
7. Before each external call named in `capabilityCalls`, run `<BASS> doctor --capabilities --host <codex-or-claude>` and `<BASS> capability claim <task-id> <capability-call> --host <codex-or-claude> --json`. On `run`, invoke the installed host plugin once and record it with `<BASS> capability complete ... --status <pass|fail|skipped|error> --summary <text>`. On `reuse`, use the recorded result. On `uncertain`, stop without reinvoking because prior side effects are unknown.
8. Prime Agent is a runner, Graft supplies context only after repeated large-repository exploration, OMC/Orca obey the BASS graph and owned paths, and Buzz consumes sanitized events. Never auto-install, emulate, copy, or silently substitute a provider. Treat Prime Agent `/refine` as a pending `refinement_proposal` requiring review.
9. Run `<BASS> evaluate --task <task-id>` once after the meaningful change. After a failure, rerun only failed and directly affected checks. Save full logs under `.bass/evidence/<task-id>/`; put only summaries in prompts and `events.jsonl`.
10. Finish every attempt with `<BASS> task attempt finish <task-id> --result <pass|fail|no-progress> --summary <text>`, including turns when available. Record unavailable usage as `unknown`.
11. Prepare run record v2. Map `execution_plan.contractVersion`, `planFingerprint`, and `capabilityCalls` exactly to `execution_contract.contract_version`, `plan_fingerprint`, and `capability_calls`; copy completed capability events into `capability_invocations` without inference.
12. Run `<BASS> gate pre-review <task-id>`, transition to REVIEW, obtain explicit human approval with `<BASS> approval final <task-id> --approver <name>`, then run `<BASS> task finalize <task-id>`. Use `<BASS> status` or `<BASS> status --watch` only for observation.
