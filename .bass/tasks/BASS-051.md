---
id: BASS-051
title: Prune redundant agent and skill instructions
status: REVIEW
type: refactor
profile: cli
risk:
  level: medium
  reasons: []
human:
  owner: user
  reviewer_required: true
coordination:
  parent_task: null
  depends_on: []
  owned_paths:
    - plugins/bass/skills/bass-work
    - plugins/bass/skills/bass-shape
    - prompt-library/roles
    - src/task/taskGraph.ts
    - src/workflow/gates.ts
    - src/cli/main.ts
    - tests/taskGraph.test.ts
    - tests/workflow.test.ts
    - tests/cli-workflow.test.ts
    - docs/workflows.md
loop:
  max_minutes: 120
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: []
---

## Problem

BASS Work routes exploration through implementation ceremony, repeats shared rules, and unconditionally asks for final approval. Shape includes historical harness attribution as an execution step; role prompts repeat the always-composed base behavior.

## What we are shipping

A bounded instruction cleanup of Work, Shape, Worker, and Evaluator, plus REVIEW path release and CLI pre-task enforcement on activation/attempt start. Preserve explicit dependencies, operational commands, and safety invariants.

## What we are not shipping

Model changes, feature removal, global plugin edits, publication, or changes to BASS-040 task and record history.

## Facts

- Initial working tree was clean.
- compose always includes base/behavior before the selected role.
- Official guidance recommends auditing conflicting instructions, not discarding all skills: https://developers.openai.com/api/docs/guides/latest-model
- The linked post was read in the browser: https://x.com/Gencoin8/status/2096107750589857989

## Decisions

- Extend this task wall-clock ceiling to 120 minutes because the prior attempt started before the intervening planning conversation; retain maxAttempts=2 and all historical events.
- User explicitly approved the expanded implementation plan: REVIEW releases path ownership, explicit dependencies still require DONE, and CLI activation/attempt start enforce pre-task checks.
- Remove the artificial BASS-040 dependency; this task does not require its final product approval.
- Apply the minimal graph fix first to bootstrap the currently self-blocked maintenance task, then recheck from CAPTURED before the implementation attempt.

Retain task graph, scope, attempt limits, provider claims, evidence, and human final judgment. Read-only inspection does not imply implementation or finalization.

## Assumptions

none

## Relevant context

- prompt-library/base/behavior.md

## Allowed scope

- src/task/taskGraph.ts
- src/workflow/gates.ts
- src/cli/main.ts
- tests/taskGraph.test.ts
- tests/workflow.test.ts
- tests/cli-workflow.test.ts
- docs/workflows.md

- plugins/bass/skills/bass-work/SKILL.md
- plugins/bass/skills/bass-shape/SKILL.md
- prompt-library/roles/worker.md
- prompt-library/roles/evaluator.md
- .bass/tasks/BASS-051.md
- .bass/records/BASS-051.json
- .bass/evidence/BASS-051/
- .bass/events.jsonl

## Forbidden scope

- registry/
- policies/
- previous task history
- global plugins

## Acceptance criteria

- REVIEW/HUMAN_REVIEW releases path ownership; ACTIVE overlap and explicit dependency blocking remain.
- Reactivation checks the projected ACTIVE task without mutating state/events on rejection.
- CLI activation and attempt start enforce pre-task; successful repeats remain idempotent.

- Read-only requests do not trigger implementation/finalization ceremony.
- Work retains provider idempotency and record field mappings.
- Existing user approval is not requested again; final approval is never inferred.
- Shape omits historical provider attribution; roles rely on the composed base for shared rules.
- Changed instructions shrink in total and relevant checks pass.

## Human judgment

Present the local diff and evidence for review; do not record final approval on the user's behalf.

## Verification

- BASS affected evaluators (typecheck, tests, build)
- Existing plugin and context tests
- Plugin validator and skill frontmatter validation
- Manual comparison of command, scope, provider, and approval invariants

## Rollback

Revert only this task's instruction, graph, gate, CLI, test, and workflow-document changes. Keep its evidence/events and BASS-040 history.
