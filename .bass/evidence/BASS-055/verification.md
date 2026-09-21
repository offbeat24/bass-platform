# Verification

- npm run typecheck: pass (completed before the full suite).
- npm test: 213 passed, 2 obsolete wording assertions failed; see full-tests-first.log.
- Updated those assertions to the intended task-scoped guide and shared scope contract.
- npx vitest run tests/project.test.ts: 13 passed; see project-tests.log. All 215 test cases have passing results for the final implementation; unchanged passing suites were reused.
- Affected execution/context suites: 44 passed after correcting the new test's assumption that every profile uses Ponytail full rather than lite.
- npm run build: pass, build.log.
- npm run smoke:package: pass, package-smoke.log.
- npm run validate:plugin: pass, plugin-validation.log.
- claude plugin validate --strict plugins/bass: pass, claude-plugin.log.
- quick_validate.py: bass-work, bass-shape, bass-setup all valid.
- node scripts/benchmark-performance.mjs: pass after correcting source-size measurement to emitted session text and reducing redundant worker wording. See benchmark-after.json and same-method comparison.json.
- git diff --check: pass.

Tests use local fixtures. No publication, installation into the user's global plugins, or live model A/B took place.
