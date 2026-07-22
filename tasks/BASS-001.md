---
id: BASS-001
title: 배포 가능한 CLI와 런타임 버전 검증 추가
status: DONE

type: feature
profile: cli

risk:
  level: medium
  reasons:
    - changes-cli-distribution-contract
    - changes-project-version-validation

human:
  owner: user
  reviewer_required: true
---

## Problem

프로젝트 문서는 `bass` 명령과 `bass.yaml`의 버전 의존을 약속하지만 실제 파일럿은
로컬 소스 절대 경로의 `npx tsx .../src/cli/main.ts`를 사용했다. 패키지는 `bin`을
선언했지만 private이고, CLI 버전은 소스에 하드코딩되어 있으며, 실행 중인 BASS
버전과 프로젝트가 요구한 `bass.version`을 대조하지 않는다.

## What we are shipping

빌드·패키징된 tarball을 다른 임시 프로젝트에 설치해 `bass` 명령으로 실행할 수
있는 패키지 경계를 만든다. CLI 버전은 package metadata에서 읽고, 프로젝트 명령은
`bass.yaml`이 요구한 버전과 현재 런타임 버전이 다르면 명확히 중단한다.

## What we are not shipping

- npm registry 또는 사내 registry 실제 publish
- 자동 업데이트, 원격 버전 조회, 네트워크 설치
- major/minor 호환 범위나 semver range 지원
- 메모보드 프로젝트의 package.json 또는 CLI 명령 변경
- hooks, CI, UI evidence, AGENTS migration 구현

## Facts

- CONFIRMED: package.json은 `bass` bin을 `dist/cli/main.js`로 선언한다.
- CONFIRMED: package.json은 `private: true`라 publish 경계가 닫혀 있다.
- CONFIRMED: CLI `.version("0.1.0")`과 `bass init` 템플릿 버전이 소스에 중복되어 있다.
- CONFIRMED: `loadBassYaml`은 `bass.version`을 문자열로 파싱하지만 런타임과 비교하지 않는다.
- CONFIRMED: 초기 baseline은 69 tests PASS와 TypeScript build PASS다.

## Decisions

- DECISION: package.json을 CLI 버전의 단일 원천으로 사용한다.
- DECISION: 첫 계약은 정확한 버전 일치이며 range 호환은 후속 결정으로 남긴다.
- DECISION: 실제 publish 없이 `npm pack`과 격리 설치 smoke test로 배포 경계를 검증한다.
- DECISION: tarball에는 dist, profiles, policies, prompt-library, registry, templates와 필수 문서만 포함한다.

## Assumptions

none

## Relevant context

- `package.json`
- `src/cli/main.ts`
- `src/project/bassYaml.ts`
- `src/project/init.ts`
- `src/paths.ts`
- `tests/project.test.ts`
- `README.md`
- `docs/configuration.md`
- `docs/architecture.md`
- `docs/decisions/0002-pilot-personal-memo-board.md`

## Allowed scope

- `package.json`, `package-lock.json`
- `src/version.ts`, `src/cli/main.ts`, `src/project/bassYaml.ts`, `src/project/init.ts`
- `scripts/smoke-package.mjs`
- 관련 `tests/`
- `README.md`, `docs/configuration.md`, `docs/architecture.md`
- `docs/decisions/0003-portable-cli-version-contract.md`
- `bass.yaml`, `tasks/BASS-001.md`, `records/BASS-001.json`, `critiques/BASS-001/`

## Forbidden scope

- registry publish, GitHub release, tag, push
- 메모보드와 다른 소비 프로젝트 파일
- hooks, CI, Design Profile, model registry 동작

## Acceptance criteria

- `bass --version`은 package.json 버전과 동일하다.
- `bass init`이 생성하는 `bass.yaml` 버전도 같은 package metadata를 사용한다.
- 프로젝트 요구 버전과 런타임 버전이 다르면 프로젝트 의존 명령이 actionable error로 종료된다.
- `bass init`과 `bass --version`처럼 프로젝트를 아직 요구하지 않는 명령은 버전 대조 없이 동작한다.
- `npm pack --dry-run`에 런타임 필수 파일만 포함되고 source/tests/examples는 제외된다.
- 실제 tarball을 격리된 임시 프로젝트에 설치한 뒤 `bass --version`, `bass init`, 프로젝트 명령을 실행할 수 있다.
- typecheck, unit tests, build가 통과한다.

## Human judgment

- exact version 일치를 0.x 초기 정책으로 채택해도 되는가
- 공개 또는 사내 registry의 package name과 publish 권한은 무엇인가

## Verification

- `npm run bass -- gate pre-task BASS-001`
- `npm run typecheck`, `npm test`, `npm run build`
- `npm pack --dry-run`
- 격리 임시 디렉터리에서 tarball 설치와 CLI smoke test
- critic 결과 작성 후 `npm run bass -- critique validate critiques/BASS-001/implementation-1.yaml`
- run record 작성 후 `npm run bass -- gate pre-complete BASS-001`

## Rollback

package 배포 필드와 version helper, runtime version check를 제거하고 기존 private
소스 실행 방식으로 되돌린다. 실제 registry publish나 외부 프로젝트 변경은 없으므로
외부 rollback은 필요 없다.
