---
id: BASS-057
title: Add local live observer for BASS and agent tool events
status: DONE
type: feature
profile: cli

risk:
  level: medium
  reasons: [local HTTP event receiver, tool preview redaction]

config:
  changed_surfaces: [ui, src, plugins, docs, tests]

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
  max_attempts: 7
  max_minutes: 60
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: [verification, simplicity-review]
---

<!-- Eligible Fast, low-risk work can keep only Problem, shipping, acceptance, and verification populated. Fill exclusions, context, task-level rollback, and custom loop fields when they affect the task. Implementation tasks need literal Allowed scope paths; read-only exploration can omit them. -->

## Problem

BASS exposes workflow state in terminal output, while local Codex and Claude Code tool activity is not visible in one live view. Users need an optional page they can leave open during a run.

## What we are shipping

`bass observe` serves a read-only page for one initialized BASS project, opens it in the default browser when possible, and prints the URL. It combines existing BASS status/events with short-lived Codex and Claude Code tool events received through non-blocking shared plugin hooks. Select any task card to open its newest-first process history and return to the overview; sequence numbers retain chronological meaning, so the oldest step is 01 at the bottom and the newest has the highest number at the top. For an active task, pin the best available current step above that history. The listener binds only to IPv4 loopback. Tool previews are bounded, redacted, and held in memory only.

## What we are not shipping

Remote access, a hosted dashboard, transcript or model-reasoning capture, persistent tool previews, arbitrary project controls, or a replacement for BASS CLI and event records.

## Facts

- Keep `.bass/events.jsonl` schema versions 1–3 and their existing persistent workflow history compatible.
- Codex local command hooks do not cover hosted tools. The observer must state this limitation.
- A missing, stale, or unreachable observer must be a successful no-op for agent hooks.
- Revising a task plan must not invalidate capability calls completed under an earlier attempt's recorded plan fingerprint.

## Decisions

- Use only Node built-ins and browser platform APIs; add no runtime dependencies.
- Run one observer process per project with a random request token and a transient ignored runtime descriptor.
- Keep the page focused on current BASS workflow state and a unified chronological event list; present status in text as well as color.
- A task card opens a task-specific newest-first step list; the original chronological sequence numbers remain attached to each step, and the overview remains one click away.
- Distinguish start/resume, attempt, tool, validation, evidence, review, and result steps with readable labels, symbols, and phase colors; meaning must not depend on color alone.
- Use brief motion only for overview/detail navigation and the live-connection cue; respect `prefers-reduced-motion` and do not animate each polling refresh.
- The overview groups status filters as in progress, waiting, needs attention, completed, and cancelled; every group shows its current count and task cards retain their exact status label.
- Cards can be sorted by recent activity, status, task ID, or title without resetting the user's choice during live refresh.
- On an active task detail, show the current running step in a distinct panel above the newest-first history; preserve chronological sequence numbers (oldest is 01; newest is highest) and never present a completed step as currently running.
- Treat file contents, transcripts, prompts, and reasoning as out of scope for previews.

## Assumptions

The hooks execute on the same machine as `bass observe`, and the browser can reach `127.0.0.1`.

## Relevant context

- `src/task/status.ts`, `src/task/events.ts`
- `src/cli/main.ts`
- `plugins/bass/hooks/hooks.json`
- `PRODUCT.md`, `DESIGN.md`, `docs/workflows.md`
- The shared checkout also contains uncommitted source and docs from completed BASS-056 and BASS-058. Their existing records remain the task attribution; those paths are listed below only because the pre-review gate checks the whole uncommitted worktree.

## Allowed scope

- `src/cli/main.ts`
- `src/observe/`
- `tests/observe.test.ts`
- `plugins/bass/hooks/hooks.json`
- `plugins/bass/hooks/observer-event.cjs`
- `scripts/validate-plugin.mjs`
- `.gitignore`
- `PRODUCT.md`
- `DESIGN.md`
- `README.md`
- `docs/workflows.md`
- `docs/agent-harness-plugins.md`
- `docs/semantic.md`
- `src/task/events.ts`
- `src/task/status.ts`
- `src/workflow/gates.ts`
- `tests/workflow.test.ts`
- `tests/events.test.ts`
- `scripts/evaluate-semantic.mjs`
- `src/semantic/workflow.ts`
- `tests/semantic.test.ts`
- `.bass/tasks/BASS-057.md`
- `.bass/records/BASS-057.json`
- `.bass/evidence/BASS-057/`
- `.bass/events.jsonl`

## Forbidden scope

- Existing event schema or persisted event format
- Dependencies, global settings, plugin installation, release/publish, or remote services
- Other task/record/evidence files

## Acceptance criteria

- `bass observe` reads the current project, serves the page on `127.0.0.1`, opens the browser when possible, prints a usable URL, and stops cleanly on Ctrl-C.
- The page shows project workflow status, current attempt and configured budget, evaluations, evidence, and blocked reasons, alongside one timestamp-ordered BASS and agent-tool timeline.
- Selecting each task card opens its own newest-first process steps, including available start/resume, attempts, tool events, evaluations, evidence, reviews, and outcomes; the back control returns to the overview.
- Detail history shows the newest event at the top and the oldest at the bottom while retaining chronological sequence numbers, so the top row has the highest number and the bottom row is 01.
- An active task detail pins its current running step above the newest-first history; completed tasks do not show a false live step.
- The overview provides visible counts and filters for in-progress, waiting, needs-attention, completed, and cancelled work, plus recent-activity, status, task-ID, and title sorting.
- Every process step retains its sequence number and status while showing a distinct phase label, symbol, and color. Overview/detail transitions are restrained and disabled for reduced-motion users.
- Codex and Claude start/success/failure events update the timeline live. Hook support and the Codex hosted-tool limitation are stated accurately.
- Tool previews have strict size limits, redact likely secrets, omit file contents and prompt/reasoning fields, and never enter a persistent file.
- The HTTP receiver rejects an invalid token and non-loopback access. Browser rendering treats all event text as data, not markup.
- Existing `.bass/events.jsonl` v1–v3 history remains readable. Missing observer runtime state or connection failure never blocks or changes an agent tool call.
- Plugin validation asserts the new event hooks and their bridge script.
- Pre-review checks historical capability invocation IDs against the plan fingerprint recorded for each invocation's attempt.

## Human judgment

Implementation and local verification are authorized. BASS final acceptance remains a human decision.

## Verification

Focused observer tests for sanitization, limits, event lifecycle, current-step selection and pinning above per-task newest-first history, descending visible order with preserved chronological sequence numbers, task-card detail navigation, phase cues, reduced-motion behavior, loopback/token checks, HTML-safe rendering, missing-server no-op, and in-memory-only tool previews; existing event compatibility tests; typecheck, full test suite, build, and plugin validation.

## Rollback

Remove the observer command, page, and hook entries; preserve the existing BASS event reader and history. The observer is opt-in, so disabling or deleting the observer runtime descriptor stops collection immediately.
