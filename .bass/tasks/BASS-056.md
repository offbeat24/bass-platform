---
id: BASS-056
title: Add optional TypeSafe semantic judgments and prepare 0.6.0
status: ACTIVE
type: feature
profile: cli
risk:
  level: high
  reasons: [external API, release]
human:
  owner: user
  reviewer_required: true
config:
  changed_surfaces: [src, plugins, docs, release]
loop:
  required_evidence: [verification, review]
---

## Problem

BASS checks evidence existence and required sections, but cannot evaluate whether task text is coherent or whether completion claims are supported by text evidence.

## What we are shipping

Optional TypeSafe integration for specification checks, semantic context recommendations, evidence checks, reporting and bounded costs; BASS 0.6.0 package and shared plugin.

## What we are not shipping

Mandatory external calls, automatic final approval, image analysis, a web console or a generic orchestration framework.

## Decisions

Default off, opt-in enforce. Preserve human final acceptance and the deterministic gates. Pin Jev 1.13.0 for evaluated judgments. Release only after the agreed live evaluation succeeds.

## Assumptions

none

## Relevant context

- src/workflow/gates.ts
- src/compose/context.ts
- src/task/runRecord.ts
- RELEASE_NOTES.md

## Allowed scope

- src/
- tests/
- scripts/
- plugins/bass/
- templates/
- .agents/plugins/
- .claude-plugin/
- .gitignore
- package.json
- package-lock.json
- bass.yaml
- AGENTS.md
- CLAUDE.md
- README.md
- RELEASE_NOTES.md
- docs/
- .bass/tasks/BASS-056.md
- .bass/records/BASS-056.json
- .bass/evidence/BASS-056/
- .bass/events.jsonl

## Forbidden scope

- policies/
- older task and record files

## Acceptance criteria

- Disabled projects make no TypeSafe call and retain the current BASS execution behavior.
- Enabled projects prepare task judgments, choose additional safe context, and verify claims against task evidence with stale results rejected.
- API calls are bounded, cached and accounted for; failures never become passing judgments.
- CLI, both plugins, upgrade path and previous records remain compatible.
- Live Korean and English evaluation meets the approved thresholds within one US dollar before stable publication.
- Required CI, package, plugin and installed-artifact checks pass before the release is marked complete.

## Verification

Typecheck, affected and full tests, package smoke, plugin checks, benchmarks, cross-platform CI, and the labeled 120-case live evaluation.

## Human judgment

Implementation and release work authorized by the user; BASS final acceptance remains a recorded human decision.

## Rollback

Disable semantic mode for immediate fallback; publish a follow-up patch for package regressions.
