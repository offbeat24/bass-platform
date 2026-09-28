# BASS repository

This repository builds the `@offbeat24/bass` CLI and the shared Codex/Claude plugin. Keep the TypeScript core host-neutral; adapters must remain thin. Do not publish packages, install plugins globally, or merge the NAN branch without explicit user approval. Preserve completed 0.2 task/record history in place.

Treat BASS rules and procedures as current defaults that can keep improving. When a better approach is supported by evidence, apply it within a defined scope and update the relevant documentation and evaluation criteria.

For changes, run the smallest affected checks. Before release work, run `npm run verify`, the Codex plugin validator, and `claude plugin validate .`. Keep CLI, Codex manifest, Claude manifest, and marketplace versions identical.

<!-- bass:managed:start -->
BASS 0.6.0: for implementation, use `bass agent guide <task-id> --json` and follow its contract.
Read-only questions need only relevant evidence; do not start an implementation workflow.
Continue authorized local work through affected verification; ask only for missing product/risk decisions.
Reuse recorded approvals, honor rejections, and leave final acceptance to the human.
Load task-relevant context only; keep full logs in task evidence.
<!-- bass:managed:end -->
