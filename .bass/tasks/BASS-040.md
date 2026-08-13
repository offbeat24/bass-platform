---
id: BASS-040
title: Ship BASS 0.4 Product-to-Ship Harness
status: REVIEW
type: feature
profile: cli

risk:
  level: medium
  reasons: []

config:
  changed_surfaces: [release]

human:
  owner: user
  reviewer_required: true

coordination:
  parent_task: null
  depends_on: []
  owned_paths:
    - src
    - tests
    - templates
    - plugins
    - profiles
    - prompt-library
    - docs
    - specs
    - .bass

loop:
  stop_when:
    - all acceptance criteria pass
    - npm run verify passes
    - no open high/medium findings
  required_evidence:
    - test-output
    - package-smoke
    - plugin-validation
---

## Problem

BASS 0.3 manages adaptive implementation tasks but does not yet provide one portable contract from product shaping through bounded implementation loops, checksum-backed evidence, and live read-only observation.

## What we are shipping

BASS 0.4 Product-to-Ship Harness: PRODUCT/TECH/DESIGN and selective specs, Task Graph and owned paths, bounded attempts, richer compatible Run Records, selected context, optional external provider contracts, evaluator routing, sanitized events, status/watch, and team documentation.

## What we are not shipping

Web console, TUI, automatic external harness installation, external prompt/runtime copies, push, tag, package publication, or autonomous human approval.

## Facts

- The branch started from the latest origin/main after the old linked worktree was removed and stale worktrees were pruned.
- Two prior local commits contain product shaping/selective context and bounded loops/evidence/status.
- BASS 0.3 tasks and Run Records remain readable.
- The package has no new runtime dependency.

## Decisions

- BASS remains authoritative; Codex, Claude, Prime Agent, and other harnesses are optional executors/providers.
- Default execution is single-agent; separated Hardened owned paths may use two agents.
- Events are activity only and never contain transcript, full prompt, or secrets.
- Final human product judgment remains outside this implementation attempt.

## Assumptions

none

## Relevant context

- PRODUCT.md#Product intent
- TECH.md#Architecture
- DESIGN.md#Design principles
- specs/product-to-ship-harness.md

## Allowed scope

- src/
- tests/
- templates/
- plugins/
- profiles/
- prompt-library/
- docs/
- specs/
- scripts/
- .bass/
- .claude-plugin/
- .agents/
- .github/
- .gitignore
- PRODUCT.md
- TECH.md
- DESIGN.md
- README.md
- AGENTS.md
- CLAUDE.md
- bass.yaml
- package.json
- package-lock.json

## Forbidden scope

- .git/
- node_modules/
- dist/
- .env
- release tags
- remote branches
- package registry

## Acceptance criteria

- Product shaping and existing-project preservation work as specified.
- Task Graph blocks missing dependencies, cycles, and independent owned-path overlap.
- Attempt, turn, time, repeated-failure, and no-progress limits block additional work correctly.
- Evidence checksum, context freshness, actual scope, model deviation, and material UI gates work while 0.3 records remain readable.
- Compose is selective, secure, and within 12,000 characters; Fast compose remains <=6,000 characters.
- External providers are explicit, doctor-checked, never installed or silently emulated, and bounded by ExecutionPlan.
- Event recovery and status/watch work without a new runtime dependency.
- Package, plugin, marketplace, launcher, prompts, and repository contract report 0.4.0.
- SessionStart is <=600 characters and the AGENTS managed block is <2KB.
- `npm run verify` passes.

## Human judgment

The user reviews whether this 0.4 boundary is the right Product-to-Ship Harness direction before final approval or publication.

## Verification

- npm run verify
- node dist/cli/main.js doctor
- node dist/cli/main.js task graph --json
- SessionStart and AGENTS byte checks
- version and runtime dependency diff audit

## Rollback

Revert the three local BASS 0.4 commits. No remote branch, tag, package, external provider installation, or published state must be rolled back.
