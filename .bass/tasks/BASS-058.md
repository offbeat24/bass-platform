---
id: BASS-058
title: Add auditable human-approved loop-budget resume
status: DONE
type: feature
profile: cli
risk:
  level: medium
  reasons: [explicit reset of a bounded task loop]
human:
  owner: user
  reviewer_required: true
config:
  changed_surfaces: [src, docs, tests]
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

## Problem

BASS measures the loop time budget from the first attempt. If a session is interrupted and left open, elapsed idle time can permanently block a task even after a human approves continuing it. There is no audited way to renew only the time window while preserving the original attempt history and other limits.

## What we are shipping

Add `bass task resume <taskId> --approved-by <person> --reason <reason>` for tasks blocked specifically by `loop time budget exhausted`. It records approval as an existing `task.started` event named `loop-budget-resume`, then returns the task to ACTIVE. Subsequent time checks use that event as the start of a new time window.

## What we are not shipping

No event schema version change, timestamp edits, attempt/turn/failure-counter reset, automatic approval, resume from other block reasons, or bypass of review and final-approval gates.

## Facts

- BASS-056 attempt 1 began on 2026-09-19 and was closed on 2026-10-06 as no-progress after the 60-minute hardened loop elapsed.
- Its historical events must remain append-only and auditable.
- A resume approval resets only the wall-clock window. Attempt count, total turns, no-progress and repeated-failure history remain cumulative.
- Existing `task.started` events support an optional name and remain schema-compatible.

## Decisions

- Require explicit `--approved-by` and `--reason` on every resume.
- Permit resume only when the task is NEEDS_DECISION, its latest block reason is exactly `loop time budget exhausted`, and no attempt remains open.
- Store the approval and timestamp in `.bass/events.jsonl` using the existing event shape; do not create a second ledger.
- A new resume event is a new time-window anchor; it never alters prior events or run records.

## Assumptions

The caller supplies an approver only after receiving that person's explicit decision, as with existing BASS approval commands.

## Relevant context

- `src/task/events.ts`
- `src/task/status.ts`
- `src/cli/main.ts`
- `tests/events.test.ts`
- `docs/workflows.md`

## Allowed scope

- `src/task/events.ts`
- `src/task/status.ts`
- `src/cli/main.ts`
- `tests/events.test.ts`
- `docs/workflows.md`
- `.bass/tasks/BASS-058.md`
- `.bass/records/BASS-058.json`
- `.bass/evidence/BASS-058/`
- `.bass/tasks/BASS-056.md`
- `.bass/events.jsonl`

## Forbidden scope

- Existing event schema versions or prior event contents
- `.bass/tasks/BASS-057.md` and all unrelated task, record, or evidence files
- Dependencies, global settings, plugin installation, API calls, release, or publication

## Acceptance criteria

- Resume rejects active/open attempts, non-NEEDS_DECISION states, and every block reason except `loop time budget exhausted`.
- A valid resume requires an approver and reason, appends a timestamped, readable resume marker, and moves the task back to ACTIVE.
- The latest valid resume marker resets only the loop time anchor for both attempt start and finish checks.
- Attempt, turn, consecutive no-progress, repeated-failure, evidence, review, and human-approval gates retain their existing cumulative behavior.
- A repeated identical resume is a no-op; a conflicting repeat cannot rewrite the approval.
- Status output no longer shows an old blocked reason after a later approved resume.
- Existing schema v1-v3 event logs remain readable and no prior event is rewritten.

## Human judgment

Implementation and local verification are authorized. The human reviewer retains final acceptance of this BASS change and BASS-056's eventual result.

## Verification

Focused resume and event-history tests, typecheck, full `npm run verify`, CLI help/validation, and BASS pre-review/pre-complete gates.

## Rollback

Revert the resume command and time-anchor logic without editing the append-only event history. If a task has already resumed, keep operating under the recorded resume event or escalate it for an explicit decision.
