# BASS 0.8.0 release readiness

The release candidate passed local verification, including `npm run verify` (23 test files and 238 tests), strict Claude plugin validation, package smoke checks, and BASS evaluations at levels 1–3.

PR #11 merged to `main` as `0be2bea323ba3110fb95fec04449124081e6cdeb`; its Ubuntu, macOS, Windows, and GitGuardian checks passed. GitHub Release `v0.8.0` is the latest release and targets that merge commit.

The release-triggered workflow run #6 succeeded. It ran `npm ci`, `npm run verify`, and `npm publish`; the publish step completed successfully for the release's 0.8.0 package metadata. No separate `workflow_dispatch` run was used. Browser verification details are recorded in `release-publish.md`.

GitHub Actions emitted a non-blocking notice that checkout/setup-node actions currently target Node 20 and were forced onto Node 24, plus an Ubuntu runner migration notice. All release and publish steps succeeded.
