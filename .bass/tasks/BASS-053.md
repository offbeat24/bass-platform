---
id: BASS-053
title: Reduce task instruction context without weakening contracts
status: DONE
type: refactor
profile: cli

risk:
  level: medium
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
  owned_paths:
    - scripts/benchmark-performance.mjs
    - scripts/smoke-package.mjs
    - benchmarks/bass-0.5-instruction-baseline.json
    - src/compose/context.ts
    - src/compose/composer.ts
    - plugins/bass/skills/bass-work/SKILL.md
    - tests/context.test.ts
    - tests/plugin.test.ts
    - docs/evaluation.md
    - docs/audit/instruction-audit.md
    - .bass/tasks/BASS-053.md
    - .bass/records/BASS-053.json
    - .bass/evidence/BASS-053
    - .bass/events.jsonl

loop:
  max_minutes: 1440
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: []
---

## Problem

BASS의 이전 instruction audit은 broad skill descriptions, profile-wide discovery
context, unconditional DESIGN loading을 줄였지만, 성능 스크립트는 실제 compose
결과가 아닌 네 파일의 바이트 합을 context로 보고한다. 구현 작업은 task 종류와
role에 관계없이 PRODUCT/TECH 일부를 자동 로드하고, bass-work는 agent guide와
중복되는 세부 절차를 모두 입구에 싣는다.

## What we are shipping

- 실제 compose 시나리오와 정적 지침 크기를 분리한 재현 가능한 기준선
- task type, changed surfaces, role에 따른 보수적인 자동 context 선택
- 필수 계약을 유지하면서 guide를 신뢰하도록 줄인 bass-work 지침
- common/CLI/server/web/game/nan2026 회귀 검증과 변경 전후 증거

## What we are not shipping

- 새 멀티에이전트 실행기나 모델 레지스트리 변경
- task 명세의 역할별 축약 또는 자유 요약
- 승인, scope, provider, evidence, final human judgment 계약 변경
- 전역 플러그인 변경, 배포, publish, commit, push, 자동 최종 승인

## Facts

- OpenAI의 2026-09-11 공식 글은 skill trigger를 구체화하고, 필요한 guidance만
  점진적으로 로드하며, 과도한 recipe를 제거하고 완료 조건을 분명히 하라고 권고한다.
- BASS-052는 discovery/critic/DESIGN routing과 approval-state 표현을 이미 정리했다.
- 현재 context.max_chars는 선택 참고 문서에만 적용되며 task 본문 전체 크기 제한이 아니다.
- BASS는 모델을 직접 실행하지 않으므로 Fusion식 lead/sidekick 실행은 별도 실험이다.
- Full verify에서 package smoke가 빈 task template을 바로 ACTIVE로 전환해 현재
  pre-task gate 계약에 실패하는 기존 fixture 문제가 확인됐다.

## Decisions

- 기존 구조와 parser를 재사용하고 새 dependency나 runtime을 추가하지 않는다.
- 먼저 실제 compose 기준선을 만든 뒤 동일 fixture로 변경 후를 비교한다.
- 명시적 Relevant context는 항상 우선하고 보안·경로·예산 검사를 유지한다.
- 신호가 불충분하면 기존 PRODUCT/TECH 자동 선택을 유지한다.
- task 명세 역할별 projection은 이번 범위에서 보류한다. 실제 기준선에서 필요성이
  확인되면 별도 task로 다룬다.
- Package smoke는 task new 결과의 필수 섹션을 채운 뒤 transition한다. 실제 gate를
  우회하거나 완화하지 않는다.

## Assumptions

none

## Relevant context

- docs/audit/instruction-audit.md
- docs/evaluation.md
- src/compose/context.ts
- src/compose/composer.ts
- scripts/benchmark-performance.mjs
- scripts/smoke-package.mjs

## Allowed scope

- scripts/benchmark-performance.mjs
- scripts/smoke-package.mjs
- benchmarks/bass-0.5-instruction-baseline.json
- src/compose/context.ts
- src/compose/composer.ts
- plugins/bass/skills/bass-work/SKILL.md
- tests/context.test.ts
- tests/plugin.test.ts
- docs/evaluation.md
- docs/audit/instruction-audit.md
- .bass/tasks/BASS-053.md
- .bass/records/BASS-053.json
- .bass/evidence/BASS-053/
- .bass/events.jsonl

## Forbidden scope

- policies/
- registry/
- profiles/
- package dependencies
- global plugins
- existing BASS-040/BASS-051/BASS-052 task, record, and evidence history

## Acceptance criteria

- Benchmark reports static instruction bytes separately from actual composed prompt characters.
- Benchmark covers read-only/docs, code fix, UI, and hardened server-style scenarios with stable fixtures.
- Explicit context remains first and automatic context selection is explainable and deterministic.
- Evaluator and docs-only work omit unrelated automatic PRODUCT/TECH context.
- Code work retains TECH context; UI work retains relevant DESIGN context; ambiguous work keeps the safe fallback.
- bass-work is shorter while retaining scope, approval, provider idempotency, verification, evidence, and final approval boundaries.
- Affected tests, full tests, typecheck, build, package smoke, plugin validation, and performance benchmark pass.
- Results describe static/context reductions only; no unsupported token, cost, cache, or live-model quality claim is made.

## Human judgment

Present the local diff, measurements, evidence, and limitations in REVIEW. Do not infer final approval.

## Verification

- npm run typecheck
- npm test
- npm run build
- npm run smoke:package
- npm run validate:plugin
- npm run benchmark:performance

## Rollback

Revert only BASS-053 implementation files while preserving task, event, record, and evidence history.
