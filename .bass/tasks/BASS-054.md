---
id: BASS-054
title: Release BASS 0.5.1
status: DONE
type: release
profile: cli

risk:
  level: medium
  reasons:
    - Publishing the GitHub Release triggers package publication.

# models 는 생략하면 프로파일/프로젝트 설정을 따른다. 필요할 때만 override.
# models:
#   worker: auto

human:
  owner: user
  reviewer_required: true

coordination:
  parent_task: null
  depends_on:
    - BASS-053
  owned_paths:
    - package.json
    - package-lock.json
    - bass.yaml
    - AGENTS.md
    - TECH.md
    - README.md
    - RELEASE_NOTES.md
    - docs/configuration.md
    - docs/game-development-for-complete-beginners.ko.md
    - plugins/bass/.codex-plugin/plugin.json
    - plugins/bass/.claude-plugin/plugin.json
    - .agents/plugins/marketplace.json
    - .claude-plugin/marketplace.json
    - tests/plugin.test.ts
    - scripts/benchmark-performance.mjs
    - scripts/smoke-package.mjs
    - .bass/tasks/BASS-054.md
    - .bass/records/BASS-054.json
    - .bass/evidence/BASS-054
    - .bass/events.jsonl

loop:
  max_attempts: 4
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence:
    - verification
    - release-readiness
---

## Problem

BASS-053의 instruction context 개선은 검증과 사용자 승인을 마쳤지만 아직
배포 가능한 버전과 GitHub Release로 묶이지 않았다. 현재 0.5.0 표시는 새 패치의
소스, plugin manifest, marketplace, 설치 문서와 일치하지 않는다.

## What we are shipping

- BASS 0.5.1 package, Codex/Claude plugin, marketplace 버전 정렬
- 실제 compose benchmark와 역할별 자동 context 축소가 포함된 패치 릴리스
- 검증된 release notes, GitHub PR, tag/release, GitHub Packages publish workflow

## What we are not shipping

- 0.6 호환성 변경이나 새 dependency
- BASS-053에서 보류한 task projection, live-model A/B, orchestrator 변경
- 동일 릴리스에 대한 수동 workflow 중복 실행

## Facts

- BASS-053은 DONE이며 full verify와 최종 사용자 승인을 통과했다.
- v0.5.0이 현재 최신 tag이고 package와 plugin version은 0.5.0이다.
- GitHub Release publish가 release.yml을 통해 npm publish를 실행한다.
- 현재 gh CLI 인증 토큰은 유효하지 않아 외부 발행 전 재인증이 필요하다.

## Decisions

- 호환되는 성능 및 context 선택 개선이므로 patch version 0.5.1을 사용한다.
- 구현과 release metadata를 같은 PR에서 리뷰 가능한 두 commit으로 유지한다.
- PR merge 후 v0.5.1 GitHub Release를 한 번만 발행하고 workflow 결과를 확인한다.
- 사용자가 commit, push, PR merge, GitHub Release 발행과 그에 따른 package 배포를 승인했다.
- Windows CI에서 확인된 CRLF fixture 결함을 같은 PR에서 수정하고 재검증한다.

## Assumptions

none

## Relevant context

- RELEASE_NOTES.md
- README.md
- .github/workflows/release.yml
- package.json
- plugins/bass/.codex-plugin/plugin.json
- plugins/bass/.claude-plugin/plugin.json

## Allowed scope

- package.json
- package-lock.json
- bass.yaml
- AGENTS.md
- TECH.md
- README.md
- RELEASE_NOTES.md
- docs/configuration.md
- docs/game-development-for-complete-beginners.ko.md
- plugins/bass/.codex-plugin/plugin.json
- plugins/bass/.claude-plugin/plugin.json
- .agents/plugins/marketplace.json
- .claude-plugin/marketplace.json
- tests/plugin.test.ts
- scripts/benchmark-performance.mjs
- scripts/smoke-package.mjs
- .bass/tasks/BASS-054.md
- .bass/records/BASS-054.json
- .bass/evidence/BASS-054/
- .bass/events.jsonl

## Forbidden scope

- source behavior changes beyond BASS-053
- package dependencies
- release workflow changes
- historical evidence and completed task records

## Acceptance criteria

- Package, Codex plugin, Claude plugin, and both marketplaces report 0.5.1.
- Current configuration and installation docs consistently point to 0.5.1.
- Release notes state the measured context reductions and their limits.
- npm run verify passes at 0.5.1.
- Codex plugin validation and Claude plugin validation pass.
- A PR is merged to main and GitHub Release v0.5.1 is published exactly once.
- The release-triggered publish workflow completes successfully.

## Human judgment

The user explicitly approved the completed improvement and requested that Codex perform the release.

## Verification

- npm run verify
- claude plugin validate --strict .
- claude plugin validate --strict plugins/bass
- gh pr checks
- gh run watch for the release-triggered workflow

## Rollback

Before publication, revert the release metadata commit. After publication, do not move the tag;
publish a follow-up patch that reverts BASS-053 if a regression is found.
