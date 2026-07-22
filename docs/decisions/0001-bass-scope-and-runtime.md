# ADR-0001: BASS 범위와 런타임 형태

## Context

BASS 는 Codex, Cursor, Claude 세 채널에서 동일하게 사용되어야 한다 (DECISION, 사용자).
COL 은 OpenAI 전용이었고 실행 설정(.codex)과 하네스 규칙이 결합되어 있었다.

## Decision

1. BASS 는 LLM API 를 직접 호출하지 않는 **자문·감독 런타임**이다.
   실행 주체는 각 에이전트 세션이고, BASS 는 게이트·라우팅 권고·지침 조합·기록 검증을 제공한다.
2. 구현 언어는 TypeScript / Node 20 (DECISION, 사용자 — Codex·Cursor 생태계 근접성).
3. 위치는 `/Users/okestro/croquis/BASS/bass-platform` (DECISION, 사용자 승인 경로).
4. 프로젝트 통합은 코드 복사가 아니라 `bass.yaml` 버전 의존 + 얇은 shim.

## Reason

- 게이트·검증·기록은 채널 독립적이며 그것이 BASS 의 실질 가치다.
- 채널별 API 오케스트레이션은 유지비가 크고 "하네스가 목적이 되는" §29 실패 모드로 이어진다.
- CLI 는 세 채널 모두에서 셸 도구로 동일하게 호출 가능하다.

## Consequences

- BASS 는 에이전트가 게이트를 실제로 실행하는지 강제할 수 없다. shim 과
  프로젝트 CI(githooks 등)가 이를 보조해야 한다 (deck 파일럿에서 검증).
- 모델 사용 기록은 에이전트의 자진 신고(run record)에 의존한다.
