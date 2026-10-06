# BASS 0.8.0 browser-verified publication

Verified in the logged-in GitHub browser using BrowserSkill on 2026-10-06.

- Pull request [#11](https://github.com/offbeat24/bass-platform/pull/11) merged to `main` as `0be2bea323ba3110fb95fec04449124081e6cdeb`. GitGuardian and Ubuntu, macOS, and Windows checks all passed (4/4).
- GitHub Release [v0.8.0](https://github.com/offbeat24/bass-platform/releases/tag/v0.8.0) is marked latest. The release page shows tag `v0.8.0` targeting merge commit `0be2bea`.
- Release workflow [history](https://github.com/offbeat24/bass-platform/actions/workflows/release.yml) shows run #6, triggered by the release and completed successfully. Its `publish` job completed `npm ci`, `npm run verify` (23 test files, 238 tests), and `npm publish` successfully.
- The release workflow used the release tag's package metadata at version 0.8.0. The browser showed the publish step succeeded; no separate manual workflow dispatch was run.
- GitHub displayed a Node 20 deprecation warning for existing actions (forced onto Node 24) and an Ubuntu runner migration notice. Neither warning failed the run.
