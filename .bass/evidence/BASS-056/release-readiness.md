# BASS-056 local release readiness

Status: implementation candidate; 0.6.0 stable release is not accepted or published.

## Completed locally

- BASS-055 was verified and preserved separately as commit `f3d264c`.
- `npm run verify`: 22 test files and 229 tests passed, followed by build, packaged CLI installation smoke, Codex plugin validation, and performance fixture. Full output: `verify.log`.
- Claude strict validation passed for the marketplace and plugin manifests. Outputs: `claude-root.log`, `claude-plugin.log`.
- `git diff --check` passed.
- The 120-case evaluation dry-run has 40 spec, 40 context, 40 evidence cases; 60 Korean and 60 English cases; 30 development and 90 held-out cases. Its maximum first-pass reservation is $0.323. Output: `evaluation-dry-run.json`.

## Required before stable release

- Provide `TYPESAFE_API_KEY` through the execution environment and run the live evaluation. The shared local evaluation ledger enforces a total $1 cap across reruns. Record measured quality, actual tokens, cost, latency, errors, and abstentions. Do not lower the approved thresholds or silently change enforcement if it fails.
- Push the review branch, open a PR, and pass Ubuntu, macOS, and Windows CI.
- Complete BASS-056 review, human final acceptance, merge, tag, GitHub Release, workflow publication, and clean installation of the published package.

The live evaluation was not run because `TYPESAFE_API_KEY` is absent. This document records local verification only; it is not a claim that 0.6.0 has shipped.
