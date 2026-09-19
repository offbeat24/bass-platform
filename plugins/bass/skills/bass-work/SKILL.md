---
name: bass-work
description: Implement or resume a defined BASS task through verification and review. Excludes read-only questions and initial product shaping.
---

# BASS Work

Resolve `../../scripts/bass-launcher.cjs` relative to this file. `<BASS>` means `node <absolute launcher path>` on Codex and Claude.

Reuse the current task and decisions. Use bass-shape only if scope or acceptance still needs definition.

- Read `<BASS> agent guide <task-id> --json` for the plan, scope, approvals, limits and capability calls. Transition to ACTIVE and start an attempt; inspect the graph only for dependency or ownership conflicts.
- For named providers, use host-specific doctor and capability claim. Invoke on `run`, reuse on `reuse`, stop on `uncertain`; complete with the real status. Never install, emulate or substitute providers.
- Continue through acceptance and affected verification, fixing change-caused failures within the plan budget. Evaluate after meaningful changes; reuse unchanged passing evidence and store full logs in `.bass/evidence/<task-id>/`.
- Finish the attempt and write a proportional run record v2 from the plan and events; unavailable usage stays `unknown`.
- Pass pre-review before REVIEW. Present results, evidence, limitations and human judgment. Finalize only after explicit final approval is recorded; implementation authorization is not final approval.
