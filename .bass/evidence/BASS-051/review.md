# Instruction pruning review

Four instruction files: 6164 -> 4861 UTF-8 bytes (21.1% reduction).

Verified in /private/tmp/bass-prune-NEhZpp, an archive of the initial clean HEAD with only this patch:
- Existing plugin/context suites: 2 files, 10 tests passed.
- npm run validate:plugin: PASS bass@0.5.0.
- skill-creator quick_validate.py: both changed skills valid.
- Manual review: provider run/reuse/uncertain semantics, host doctor, record mapping, scope, bounded attempts, and explicit final approval retained.
- Worker and evaluator are always composed after base/behavior, which retains common evidence and retry rules.
- No host behavioral benchmark was run; byte reduction does not establish better model quality.

Not applied to the source checkout: pre-task gate rejects overlap with REVIEW task BASS-040; adding the accurate predecessor dependency reports blocked by BASS-040. The orchestration command initially continued to ACTIVE/attempt start after the failed gate; no product source was changed. The attempt is closed; the no-progress limit moved the task to NEEDS_DECISION. A requested BLOCKED transition was rejected, so NEEDS_DECISION remains unchanged.

AGENTS.md is already compact and repository-specific. Retained it, security/approval policies, runtime features, model routing, and existing history. No global plugins were edited.

Source: https://developers.openai.com/api/docs/guides/latest-model
Official guidance recommends auditing sensitive/conflicting instructions; it does not establish the linked post's claim that purchased skills are useless.
