---
name: bass-work
description: Implement repository changes in BASS using the task ExecutionPlan. Read-only questions do not start implementation.
---

# BASS Work

Resolve `../../scripts/bass-launcher.cjs` relative to this file. `<BASS>` means `node <absolute launcher path>` on both Codex and Claude Code.

1. Read repository instructions and `<BASS> agent guide <task-id> --json`; its plan, fingerprint, scope, limits, approvals, and named capability calls are the execution contract.
2. Transition to `ACTIVE` and start one attempt. Implement the smallest accepted change. Inspect the task graph only for dependency or path conflicts; stop on the guide's budget, repeated-failure, or no-progress limits.
3. For each named external call, run host-specific doctor and capability claim. Invoke only on `run`, reuse on `reuse`, and stop on `uncertain`; complete every invocation with its real status. Never install, emulate, or substitute a provider.
4. Evaluate after the meaningful change. Reuse unchanged passing evidence, rerun only affected failures, and keep full logs under `.bass/evidence/<task-id>/`.
5. Finish the attempt and prepare a proportional run record v2 from the execution plan and completed events. Leave unavailable usage `unknown` and never infer evidence.
6. Pass the pre-review gate, transition to `REVIEW`, and present results, evidence, limitations, and remaining human judgment. Finalize only after explicit final approval is recorded; implementation authorization is not final approval.
