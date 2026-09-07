# BASS-051 implementation review

Implemented the user-approved plan in the local checkout. Instruction text: 6164 -> 4847 UTF-8 bytes (21.4% smaller). The earlier instruction-pruning.patch and review.md are historical drafts, not the final runtime diff.

## Verification

- Typecheck and build passed in attempt-2 evaluator logs.
- The first full test run found a legacy composed-prompt assertion requiring the Ponytail approved-scope sentence. Kept that meaningful scope boundary in Worker, then reran the failed test command: 21 suites / 180 tests passed (tests-final.log). TypeScript code remained unchanged after passing typecheck/build.
- Plugin validation and both changed skill frontmatters passed.
- Twelve new regression cases cover review/legacy-review path release, explicit dependencies, active overlap, projected reactivation, capacity, CLI rejection without state/event changes, and successful activation/start idempotency. CLI tests load the source entrypoint rather than stale dist output.
- Manual instruction cases: read-only inspection does not start implementation; normal edits use bounded attempts; deletion includes stale references without adjacent work; provider run/reuse/uncertain and record mappings remain; final approval must be explicit and applicable recorded approval is reused.
- Manual implementation review: graph filtering uses normalized states, reactivation projects the task in memory into both graph and active count, and CLI guards run before mutators. No open high/medium findings. This is same-agent review, not independent agent evaluation.

## Boundaries and history

- BASS-040 task and record, AGENTS.md, model routing, runtime dependencies, and global plugin files are unchanged.
- First attempted work and blocked events are retained; the artificial BASS-040 dependency is removed. User approval of the expanded implementation is recorded in BASS-051 Decisions. A minimal graph bootstrap enabled the previously self-blocked pre-task gate.
- Wall-clock budget was expanded for this task only to account for the intervening planning conversation. Attempt 2 remains the last allowed attempt.
- Ponytail full was applied from the installed skill already loaded in this host session. Host-specific active capability declaration reflects that observed session use; no external plugin execution or installation was fabricated.
- Full tests, typecheck, build, plugin and skill checks do not demonstrate improved model behavior. No Codex/Claude live behavior benchmark or Windows host run was performed.
- No commit, push, publication, or final human approval is included.
