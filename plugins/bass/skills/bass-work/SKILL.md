---
name: bass-work
description: Implement or resume a defined BASS task through verification and review. Excludes read-only questions and initial product shaping.
---

# BASS Work

Resolve `../../scripts/bass-launcher.cjs` relative to this file. `<BASS>` means `node <absolute launcher path>` on Codex and Claude.

Reuse the current task and decisions. Use bass-shape only if scope or acceptance still needs definition.

- Read `<BASS> agent guide <task-id> --json` for the plan, scope, approvals, limits and capability calls. If `bass.yaml` enables `semantic.mode: enforce`, run `<BASS> semantic prepare <task-id>` and resolve findings before transitioning to ACTIVE; inspect the graph only for dependency or ownership conflicts.
- For named providers, use host-specific doctor and capability claim. Invoke on `run`, reuse on `reuse`, stop on `uncertain`; complete with the real status. Never install, emulate or substitute providers.
- Before implementation, run `<BASS> route <task-id> --role <role>` for each role you will use (at least `worker`); inspect the recommended alias, resolved model, `reasoningEffort` and reasons. Apply the recommendation when the execution host allows model and effort selection. Recheck routing if scope, risk or required capabilities change enough to affect it. Treat routing as guidance: do not create an agent just to force a match. If the host cannot apply the recommendation or you choose a suitable alternative, proceed when appropriate and record the alias actually used, `actual_model` when known, `followed_recommendation: false` and a specific `reason` in `models_used`; include unavailable effort control in the reason when relevant.
- Before implementation, map each acceptance criterion to the smallest relevant observable check and evidence source; one check may cover several criteria. Choose checks only for affected surfaces and revise the map when scope changes. For UI changes, satisfy the existing BASS gate with rendered verification, viewport(s), screenshot evidence paths included in the evidence list, and zero console errors.
- Continue through acceptance and affected verification, fixing change-caused failures within the plan budget. Evaluate after meaningful changes; reuse unchanged passing evidence and store full logs in `.bass/evidence/<task-id>/`.
- If semantic mode is enabled, write `.bass/semantic/<task-id>/claims.json` with one exact acceptance criterion, claim, and quoted `.bass/evidence/<task-id>/` source per criterion. Run `<BASS> semantic verify <task-id>` after verification and resolve findings. Never mark a failed or missing semantic judgment as a pass.
- Finish the attempt and write a proportional run record (v3 with semantic hashes and resolutions when enabled, otherwise v2) from the plan and events; unavailable usage stays `unknown`.
- Pass pre-review before REVIEW. Present results, evidence, limitations and human judgment. Finalize only after explicit final approval is recorded; implementation authorization is not final approval.
