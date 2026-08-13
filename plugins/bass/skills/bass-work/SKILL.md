---
name: bass-work
description: Execute coding tasks in BASS-connected repositories when the user asks to build, fix, delete, refactor, explore, or release. Use the generated ExecutionPlan to limit validation, critics, optional plugin calls, records, and rework loops.
---

# BASS Work

1. Read repository instructions and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/bass-launcher.cjs" agent guide <task-id> --json`.
2. Load only `Relevant context` and the PRODUCT, TECH, or DESIGN sections named by the composed context manifest. Read another file only when the task exposes a concrete need.
3. Treat `execution_plan` as a ceiling. Do not add critics, capability calls, checks, or loops absent from it.
4. For delete tasks, enforce every `scopeLock`: remove stale references and affected tests, and create no adjacent improvement or follow-up task.
5. Implement the smallest accepted change. Keep Fast records to scope, acceptance, and verification only.
6. Run `evaluate --task <task-id>` once after the meaningful change. After a failure, rerun only the failed and directly affected checks.
7. Use external Ouroboros or Ponytail only when named in `capabilityCalls`; never duplicate their BASS builtin critic.
8. Move `CAPTURED -> ACTIVE -> REVIEW -> DONE`. Ask humans only for explicit risk approval and final product judgment.
