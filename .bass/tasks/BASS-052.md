---
id: BASS-052
title: Apply cross-profile instruction audit
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
    - src/agent/guide.ts
    - src/compose/composer.ts
    - src/compose/context.ts
    - plugins/bass/skills
    - prompt-library/base/behavior.md
    - prompt-library/roles/discovery.md
    - prompt-library/roles/planner.md
    - tests/agent.test.ts
    - tests/context.test.ts
    - tests/project.test.ts
    - docs/agent-operations.md
    - docs/audit/instruction-audit.md
loop:
  max_attempts: 3
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: []
---

## Problem

BASS still injects profile-wide discovery/critic catalogs into unrelated work, directs non-UI web work toward DESIGN.md, and describes triggered approvals without their recorded decisions. Skills contain broad descriptions and redundant selection/approval instructions across product shaping, setup, reporting, UI and game work.

## What we are shipping

Apply the six-category instruction audit across common instructions, all six skills, role/critic prompts, profiles, generated AGENTS/shims, templates and hooks. Change only demonstrated routing, repetition and approval guidance issues. Preserve domain facts and operational contracts.

## What we are not shipping

New audit runtime, model changes, global plugin edits, profile/approval policy changes, dependency changes, deployment, commit, push, or automatic final approval.

## Facts

- Working tree started clean after BASS-051 was committed and pushed.
- Existing context selection and ExecutionPlan already provide task-specific scope.
- The user's instruction authorizes applying the audit across BASS, not only games.
- Source checklist: https://x.com/Gencoin8/status/2096819118595084431
- Official guidance: https://developers.openai.com/api/docs/guides/latest-model

## Decisions

- Full verification exposed an existing project fixture whose unconditional web DESIGN assumption is intentionally obsolete. Include tests/project.test.ts and allow one final corrective attempt; no check is removed or bypassed.

- Follow-up source tracing found automaticReferences also injects DESIGN solely for the web profile. Include src/compose/context.ts under the approved cross-profile cleanup; start a second bounded attempt with the amended plan.

- Retain domain-specific safety, evidence, plan ceilings, provider idempotency, and final human approval.
- Reuse existing approved decisions; keep rejected and missing policy approvals blocking. Never manufacture an approval record from a vague instruction.
- Do not split already-small skills into new reference files.
- Test composition and guide behavior across common, CLI, server, web, game and event profiles.

## Assumptions

none

## Relevant context

- docs/workflows.md
- profiles/common.yaml

## Allowed scope

- src/agent/guide.ts
- src/compose/composer.ts
- src/compose/context.ts
- plugins/bass/skills/bass-work/SKILL.md
- plugins/bass/skills/bass-shape/SKILL.md
- plugins/bass/skills/bass-setup/SKILL.md
- plugins/bass/skills/bass-game-runtime/SKILL.md
- plugins/bass/skills/bass-ui-direction/SKILL.md
- plugins/bass/skills/bass-html-report/SKILL.md
- prompt-library/base/behavior.md
- prompt-library/roles/discovery.md
- prompt-library/roles/planner.md
- tests/agent.test.ts
- tests/context.test.ts
- tests/project.test.ts
- docs/agent-operations.md
- docs/audit/instruction-audit.md
- .bass/tasks/BASS-052.md
- .bass/records/BASS-052.json
- .bass/evidence/BASS-052/
- .bass/events.jsonl

## Forbidden scope

- policies/
- registry/
- profiles/
- .bass/tasks/BASS-040.md
- .bass/records/BASS-040.json
- .bass/tasks/BASS-051.md
- .bass/records/BASS-051.json
- global plugins

## Acceptance criteria

- Worker/evaluator prompts omit unrelated discovery catalogs; discovery keeps its selected profile checklist.
- Composed critic names match ExecutionPlan, not the full configured catalog.
- DESIGN preparation is conditional on UI work, not merely the web profile.
- Approved, rejected and missing approvals are accurately distinguished; real gates remain intact.
- Read-only requests do not imply implementation, task creation or finalization.
- Skill descriptions are concise and role-specific; previous explicit choices are preserved across domains.
- Audit records what changed and what remains, with reasons and limitations.
- Affected/full tests, typecheck, build, plugin and skill validation pass.

## Human judgment

Present the local diff and evidence in REVIEW; do not infer final approval.

## Verification

- BASS affected evaluators: typecheck, tests, build
- Plugin validator and all six skill frontmatter validators
- Cross-profile composition, UI/non-UI routing, approval status, and read-only guide regression tests
- Manual instruction scenarios and byte comparison; no claim of live model quality improvement

## Rollback

Revert only BASS-052 implementation files while retaining task/event/evidence history.
