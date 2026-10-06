---
id: BASS-060
title: Release BASS 0.8.0
status: ACTIVE
type: release
profile: cli

risk:
  level: medium
  reasons:
    - Publishing the GitHub Release triggers the GitHub Packages publication workflow.

# models 는 생략하면 프로파일/프로젝트 설정을 따른다. 필요할 때만 override.
# models:
#   worker: auto

human:
  owner: user
  reviewer_required: true

coordination:
  parent_task: null
  depends_on:
    - BASS-056
    - BASS-057
    - BASS-058
  owned_paths:
    - package.json
    - package-lock.json
    - bass.yaml
    - AGENTS.md
    - README.md
    - RELEASE_NOTES.md
    - docs/semantic.md
    - plugins/bass/.codex-plugin/plugin.json
    - plugins/bass/.claude-plugin/plugin.json
    - .agents/plugins/marketplace.json
    - .claude-plugin/marketplace.json
    - plugins/bass/scripts/bass-launcher.cjs
    - tests/plugin.test.ts
    - .bass/tasks/BASS-060.md
    - .bass/records/BASS-060.json
    - .bass/records/BASS-060.approvals.json
    - .bass/evidence/BASS-060/
    - .bass/events.jsonl

loop:
  max_turns: 12
  max_attempts: 3
  max_minutes: 60
  no_progress_limit: 1
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence:
    - verification
    - release-readiness
---

<!-- Eligible Fast, low-risk work can keep only Problem, shipping, acceptance, and verification populated. Fill exclusions, context, task-level rollback, and custom loop fields when they affect the task. Implementation tasks need literal Allowed scope paths; read-only exploration can omit them. -->

## Problem

BASS 0.7.0 was released before the local observer and audited loop-budget resume merged in PR #10. The current package metadata and installation docs still identify 0.7.0, so the merged behavior is not yet available through a versioned release. The required 0.8.0 verification also found that the plugin launcher rejects the new minor version.

## What we are shipping

- BASS 0.8.0 CLI and Codex/Claude plugins with aligned package, project, plugin, and marketplace versions.
- A local, read-only `bass observe` page for BASS state and bounded, redacted local tool-event previews.
- Human-approved continuation after loop-time exhaustion, with append-only approval history and existing cumulative attempt/turn limits preserved.
- Refined optional semantic specification checks using Noul, with uncertain results routed to human review.
- Release notes that describe compatibility, security boundaries, and verified behavior accurately.
- A Codex/Claude plugin launcher range that accepts the 0.8.0 project version.

## What we are not shipping

- Breaking changes, new runtime dependencies, hosted observation, or changes to the release workflow or package registry.
- A manual `workflow_dispatch` run in addition to the GitHub Release-triggered package publication.

## Facts

- PR #10 is merged to `main` as `028caf1`; Ubuntu, macOS, Windows, and GitGuardian checks passed.
- The latest published GitHub Release and package metadata are 0.7.0 (`v0.7.0`).
- Publishing a GitHub Release triggers `.github/workflows/release.yml`, which runs `npm run verify` and then publishes to GitHub Packages.
- The user explicitly requested completion of the release and release notes through the browser skill.

## Decisions

- Use 0.8.0: PR #10 adds backward-compatible user-facing capabilities, including a new CLI command.
- Keep `semantic.mode: off` as the default and state that live TypeSafe calls require explicit approval and incur provider cost.
- Update the existing `RELEASE_NOTES.md`; do not create a duplicate release-notes document.
- Merge version metadata and release notes to `main` through a checked PR, then publish one GitHub Release `v0.8.0` in the logged-in browser. Let that release event run package publication once.

## Assumptions

none

## Relevant context

- `RELEASE_NOTES.md`
- `README.md`
- `AGENTS.md`
- `bass.yaml`
- `docs/semantic.md`
- `plugins/bass/scripts/bass-launcher.cjs`
- `tests/plugin.test.ts`
- `.github/workflows/release.yml`
- BASS-056, BASS-057, and BASS-058 task records and evidence

## Allowed scope

- `package.json`
- `package-lock.json`
- `bass.yaml`
- `AGENTS.md`
- `README.md`
- `RELEASE_NOTES.md`
- `docs/semantic.md`
- `plugins/bass/.codex-plugin/plugin.json`
- `plugins/bass/.claude-plugin/plugin.json`
- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`
- `plugins/bass/scripts/bass-launcher.cjs`
- `tests/plugin.test.ts`
- `.bass/tasks/BASS-060.md`
- `.bass/records/BASS-060.json`
- `.bass/records/BASS-060.approvals.json`
- `.bass/evidence/BASS-060/`
- `.bass/events.jsonl`

## Forbidden scope

- New runtime features after PR #10; the launcher compatibility fix is in scope.
- Dependency changes, package-registry changes, or release-workflow changes
- Rewriting previous tags, releases, events, or task records

## Acceptance criteria

- Package, lockfile, project config, plugin manifests, marketplaces, and current install docs consistently report 0.8.0.
- The plugin launcher accepts BASS 0.8.0 project configuration; its existing regression test passes.
- `RELEASE_NOTES.md` covers the merged features and preserves default-off, local-only, redaction, approval, and cumulative-budget boundaries.
- `npm run verify` and strict Claude plugin validation pass at 0.8.0.
- BASS pre-review and pre-complete gates pass with release evidence recorded.
- The version/notes PR merges to `main`, and GitHub Release `v0.8.0` points at the exact merged commit.
- The release-triggered GitHub Packages workflow completes successfully and publishes package version 0.8.0.

## Human judgment

The user explicitly authorized completing and publishing this release in this conversation. Record that authorization and the final release outcome; do not substitute automated checks for the release workflow result.

## Verification

- `npm run verify`
- `claude plugin validate --strict .`
- `claude plugin validate --strict plugins/bass`
- BASS task validation and pre-review/pre-complete gates
- PR checks on Ubuntu, macOS, Windows, and GitGuardian
- Browser verification of release tag, release page, and release-triggered package workflow

## Rollback

Before publication, revert the metadata/notes PR. After `v0.8.0` is published, do not move the tag; publish a later patch release if a regression requires correction.
