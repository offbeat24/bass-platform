---
name: bass-work
description: Execute coding tasks in BASS-connected repositories when the user asks to build, fix, delete, refactor, explore, or release. Use the generated ExecutionPlan to limit validation, critics, optional plugin calls, records, and rework loops.
---

# BASS Work

1. Read repository instructions and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/bass-launcher.cjs" agent guide <task-id> --json`.
2. Load only `Relevant context` and the PRODUCT, TECH, or DESIGN sections named by the composed context manifest. Read another file only when the task exposes a concrete need.
3. Treat `execution_plan` as a ceiling. Do not add critics, capability calls, checks, agents, or loops absent from it.
4. Run `task graph`, then `task attempt start <task-id>` before implementation. If BASS reports a budget, repeated-failure, or no-progress block, stop and surface the recorded `NEEDS_DECISION` or `NEEDS_EXPERT` state.
5. For delete tasks, enforce every `scopeLock`: remove stale references and affected tests, and create no adjacent improvement or follow-up task.
6. Implement the smallest accepted change. Keep Fast records to scope, acceptance, and verification only.
7. Run `evaluate --task <task-id>` once after the meaningful change. After a failure, rerun only the failed and directly affected checks. Save full logs under `.bass/evidence/<task-id>/`; place only summaries in prompts and `events.jsonl`.
8. Finish every attempt with `task attempt finish <task-id> --result ... --summary ...`, including reported turns when the host exposes them. Record unavailable token or cost metrics as `unknown`.
9. Call any external provider only when named in `capabilityCalls` and `doctor --capabilities` plus the current host confirms it is active. Prime Agent is a runner, Graft supplies context only after repeated large-repo exploration, OMC/Orca obey the BASS graph and owned paths, and Buzz consumes sanitized events. Never auto-install, emulate, or silently substitute one.
10. Treat Prime Agent `/refine` or any learned harness change as a pending `refinement_proposal`. Apply it only after review; never rewrite the BASS base prompt automatically.
11. Run `gate pre-review <task-id>`, then move `CAPTURED -> ACTIVE -> REVIEW -> DONE`. Ask humans only for explicit risk approval and final product judgment; use `status` or `status --watch` for observation.
