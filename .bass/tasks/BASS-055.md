---
id: BASS-055
title: Route BASS instructions only when relevant
status: DONE
type: refactor
profile: cli
risk:
  level: medium
  reasons: []
human:
  owner: user
  reviewer_required: true
config:
  changed_surfaces: [src, plugins, docs]
loop:
  max_minutes: 60
  required_evidence: [verification, review]
---

## Problem

Session startup demands a guide without a task, plans select providers for unrelated work, and evaluator composition repeats full task prose.

## What we are shipping

Conditional entrypoints, precise skill routing, task-scoped provider selection, evaluator task projection, context deduplication, and regression coverage.

## What we are not shipping

Model migration, release, global plugin installation, removal of approval or evidence gates, or changes to other projects.

## Facts

The user requested implementation on a new branch, including substantial redesign if justified. Both X threads were read in the browser. The official source is https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra . Current main is 252b9f6 and was clean.

## Decisions

Keep the host-neutral runtime and existing completed records. Fix routing at the source shared by Codex and Claude. Preserve explicit context and unknown task sections. Measure bytes and deterministic behavior; do not claim live token or quality gains.

## Assumptions

none

## Relevant context

- src/execution/planner.ts
- src/compose/composer.ts
- src/compose/context.ts

## Allowed scope

- src/
- plugins/bass/
- prompt-library/
- tests/
- scripts/benchmark-performance.mjs
- AGENTS.md
- CLAUDE.md
- .cursor/rules/bass.mdc
- README.md
- docs/
- .bass/tasks/BASS-055.md
- .bass/records/BASS-055.json
- .bass/evidence/BASS-055/
- .bass/events.jsonl

## Forbidden scope

- package.json
- package-lock.json
- policies/
- .github/

## Acceptance criteria

- Sessions outside BASS do not receive BASS instructions; BASS sessions receive routing, not an unconditional guide command.
- Plans without a task have no capability calls. Read-only and documentation work do not automatically invoke code-simplicity providers; explicit supported requests still work.
- Evaluator composition preserves metadata, scope, criteria, verification, decisions, and custom constraints without unrelated standard narrative. Other roles retain complete task text.
- Explicit whole-document context suppresses overlapping automatic sections, and symlinks cannot expose sensitive files.
- Narrow skill descriptions and managed entrypoints preserve existing approval, provider, evidence and completion boundaries.
- Affected tests, typecheck, build, plugin/package checks and benchmark pass.

## Human judgment

Implementation is authorized. Final acceptance and publication remain with the user.

## Verification

Affected Vitest suites, typecheck, build, package smoke, plugin validation, performance benchmark, and git diff --check.

## Rollback

Revert BASS-055 source changes on this branch; retain task and evidence history. Main and installed plugins remain unchanged.
