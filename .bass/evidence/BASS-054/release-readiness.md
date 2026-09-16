# Release readiness

- Version: 0.5.1
- Package, lockfile, bass.yaml, Codex manifest, Claude manifest, Codex marketplace,
  and Claude marketplace are aligned.
- Release notes describe deterministic benchmark measurements and explicitly exclude
  live token, cache, cost, and model-quality claims.
- PR #6 merged as `ee4bb8b82ff4f7134bbc0d84ac4bae839d235510` after Ubuntu,
  macOS, Windows, and GitGuardian checks passed.
- GitHub Release `v0.5.1` triggered `.github/workflows/release.yml` once.
- Release workflow 35068791618 completed successfully, including `npm run verify`
  and `npm publish`.
- Manual `workflow_dispatch` was not used for the same release.
- The user's explicit release approval is recorded under rule `deploy-release`.

Published release: https://github.com/offbeat24/bass-platform/releases/tag/v0.5.1
Release workflow: https://github.com/offbeat24/bass-platform/actions/runs/35068791618
