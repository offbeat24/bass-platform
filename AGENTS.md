# BASS repository

This repository builds the `@offbeat24/bass` CLI and the shared Codex/Claude plugin. Keep the TypeScript core host-neutral; adapters must remain thin. Do not publish packages, install plugins globally, or merge the NAN branch without explicit user approval. Preserve completed 0.2 task/record history in place.

For changes, run the smallest affected checks. Before release work, run `npm run verify`, the Codex plugin validator, and `claude plugin validate .`. Keep CLI, Codex manifest, Claude manifest, and marketplace versions identical.

<!-- bass:managed:start -->
BASS 0.5.0: use `bass agent guide --json` before work.
- Humans own product direction, risk, and final judgment.
- Inspect facts; implement the smallest accepted change.
- Obey the plan fingerprint, task graph, scope, bounded loop, and gates.
- Claim named providers only after host-specific doctor confirmation.
- Run affected checks once; reuse unchanged passing evidence.
- Load selected product context only; keep full logs in task evidence.
<!-- bass:managed:end -->
