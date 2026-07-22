# ADR-0003: Portable CLI and exact runtime version contract

## Status

Accepted — 2026-07-22 human approval.

## Context

파일럿 프로젝트는 BASS 소스 절대 경로와 `tsx`를 직접 호출했다. package.json에는
이미 `bass` bin이 있었지만 배포 파일 경계, 설치 smoke test, 프로젝트 요구 버전과
실행 런타임의 대조가 없었다. CLI, init template과 shim marker에도 `0.1.0`이 중복됐다.

## Decision

- package.json을 CLI identity와 version의 단일 원천으로 사용한다.
- 0.x 프로젝트의 `bass.version`은 exact version 계약이다.
- registry publish 전 전달물은 runtime files만 포함한 npm tarball이다.
- package는 registry 이름과 권한이 결정될 때까지 `private: true`를 유지한다.
- `npm pack --dry-run`과 격리 설치 smoke test를 release 전 검증으로 사용한다.

## Consequences

- 프로젝트는 BASS 코드를 복사하지 않고 설치된 runtime과 얇은 설정만 가진다.
- 잘못된 runtime으로 gate를 실행하는 silent drift가 차단된다.
- package version을 올릴 때 init template과 shim version이 자동으로 함께 바뀐다.
- exact match는 안전하지만 patch 호환 버전도 자동 허용하지 않는다.
- package name, registry, publish credentials와 semver compatibility는 후속 인간 결정이다.

## Verification

- unit tests: package metadata, init version, mismatch error
- `npm pack --dry-run --json`: source/tests/examples 제외
- `npm run smoke:package`: tarball 설치, `bass --version`, `bass init`, config와 mismatch failure
