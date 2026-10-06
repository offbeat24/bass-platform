---
id: BASS-059
title: Polish observer steps with phase cues and purposeful motion
status: CANCELLED
type: feature
profile: cli

config:
  changed_surfaces: [ui, docs, tests]

risk:
  level: low
  reasons: []

# models 는 생략하면 프로파일/프로젝트 설정을 따른다. 필요할 때만 override.
# models:
#   worker: auto

human:
  owner: user
  reviewer_required: true

coordination:
  parent_task: null
  depends_on: []
  owned_paths: []

loop:
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: [verification, simplicity-review]
---

<!-- Eligible Fast, low-risk work can keep only Problem, shipping, acceptance, and verification populated. Fill exclusions, context, task-level rollback, and custom loop fields when they affect the task. Implementation tasks need literal Allowed scope paths; read-only exploration can omit them. -->

## Problem

The observer's numbered task history is readable but every process phase uses the same muted styling. Users must read each label to tell starts, tool work, validation, evidence, and review apart.

## What we are shipping

Give each process phase a short symbol, a distinct accessible color, and a clear label. Add brief motion only when moving between overview and task detail, plus a restrained live-connection cue. Respect reduced-motion preferences and keep the existing task flow and event data unchanged.

## What we are not shipping

New event collection, routing, persistence, frontend dependencies, charts, or changes to BASS workflow behavior.

## Facts

- The observer is a single-file generated HTML/CSS/JS page served from `src/observe/index.ts`.
- Its current design uses dark blue-gray surfaces with muted teal accents.
- The existing design guidance rejects decorative motion; motion here must communicate navigation or live connection state.

## Decisions

- Use distinct phase tones for start/resume, attempt, tool activity, validation, evidence, review, and result; keep the phase label visible so meaning does not depend on color.
- Animate only explicit overview/detail transitions. Honor `prefers-reduced-motion`.
- Keep the existing typography, dark surfaces, responsive layout, security boundaries, and one-second refresh behavior.

## Assumptions

The existing local observer remains the only runtime and browser interaction target.

## Relevant context

- `src/observe/index.ts`, `tests/observe.test.ts`, `DESIGN.md`
- Previously completed BASS-056/057/058 work remains uncommitted in this shared checkout. The run record will identify carry-forward paths as such; their existing BASS records remain the attribution.
- `DESIGN.md` records Session Observer and Agents Observe as the closest available references. `oh-my-design` and `getdesign.md` are unavailable in this workspace.

## Allowed scope

- `src/observe/`
- `tests/observe.test.ts`
- `DESIGN.md`
- `.gitignore`
- `PRODUCT.md`
- `README.md`
- `docs/agent-harness-plugins.md`
- `docs/semantic.md`
- `docs/workflows.md`
- `plugins/bass/hooks/hooks.json`
- `plugins/bass/hooks/observer-event.cjs`
- `scripts/evaluate-semantic.mjs`
- `scripts/validate-plugin.mjs`
- `src/cli/main.ts`
- `src/semantic/workflow.ts`
- `src/task/events.ts`
- `src/task/status.ts`
- `tests/events.test.ts`
- `tests/semantic.test.ts`
- `.bass/tasks/BASS-059.md`
- `.bass/records/BASS-059.json`
- `.bass/evidence/BASS-059/`
- `.bass/events.jsonl`

## Forbidden scope

- Workflow event schemas, hook payloads, persistence, or runtime dependencies
- Global browser settings, plugin installs, package release, or remote services
- Other task, record, or evidence files

## Acceptance criteria

- Task detail steps visibly distinguish their phase with a symbol, color, and text label while retaining the step number and status.
- Overview/detail changes use a brief, non-distracting transition; the live connection cue is subtle; reduced-motion settings disable both.
- Keyboard focus, status text, color contrast, desktop layout, and narrow viewport behavior remain usable.
- Event refresh, ordering, redaction, and all observer security boundaries remain unchanged.

## Human judgment

Implementation and local verification are authorized. BASS final acceptance remains a human decision.

## Verification

Add a focused check for phase mapping and reduced-motion/transition hooks; run affected observer tests and typecheck/build; inspect overview and task detail in a browser at desktop and narrow viewports; record screenshots and console state.

## Rollback

Revert the phase styles, transition classes, and corresponding DESIGN.md notes; the observer data flow remains unchanged.
