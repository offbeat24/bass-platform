# BASS repository

This repository builds the `@offbeat24/bass` CLI and the shared Codex/Claude plugin. Keep the TypeScript core host-neutral; adapters must remain thin. Do not publish packages, install plugins globally, or merge the NAN branch without explicit user approval. Preserve completed 0.2 task/record history in place.

For changes, run the smallest affected checks. Before release work, run `npm run verify`, the Codex plugin validator, and `claude plugin validate .`. Keep CLI, Codex manifest, Claude manifest, and marketplace versions identical.

<!-- bass:managed:start -->
BASS 0.3.0: use `bass agent guide --json` before work.
- Keep human ownership of product direction and risk decisions.
- Inspect repository facts and implement the smallest accepted change.
- Follow `execution_plan`; do not add checks, critics, or loops beyond it.
- Run `bass evaluate --task <id>`; reuse unchanged passing evidence.
- Keep handoff evidence in `.bass/tasks/` and `.bass/records/` only when needed.
<!-- bass:managed:end -->
