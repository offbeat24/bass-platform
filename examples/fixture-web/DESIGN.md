# Product design identity

## Purpose

fixture-web 은 BASS Design Profile 검증용 예시 프로젝트다.
로그인 같은 핵심 동작에서 사용자가 다음 행동을 이해할 수 있어야 한다.

## Design principles

- 오류 메시지는 사과보다 해결 방법을 먼저 제시한다.
- 버튼 라벨은 가능한 한 행동 동사로 끝낸다.
- 장식만을 위한 그라데이션은 사용하지 않는다.

## Color palette

역할 기반 색상만 사용한다. 값은 `src/tokens.ts` 가 기준이다.

- primary: 주요 행동 버튼
- danger: 오류와 파괴적 행동
- surface / text: 배경과 본문

토큰 밖 hex 색상 하드코딩 금지.

## Interaction states

모든 상호작용 컴포넌트는 다음 상태를 정의한다:
hover, focus, active, disabled, loading, error, empty, success.

## Voice and microcopy

- 기본 존댓말. 문장은 짧게.
- 오류 메시지 순서: 해결 방법 → 원인.
- 금지어: "오류가 발생했습니다" 단독 사용.

## Do

- 기존 컴포넌트와 토큰 재사용

## Do not

- 토큰 우회 하드코딩
- 사용자를 탓하는 카피

## Decisions and history

- 주요 결정은 docs/decisions/ 의 ADR 로 기록한다.
