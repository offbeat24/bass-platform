# Evaluation

## 평가 계층 (§18)

| Level | 내용 | BASS 에서 |
|-------|------|-----------|
| 1 정적 | lint, type check, schema, policy | `bass evaluate --levels 1` (프로젝트 선언 명령) |
| 2 동작 | unit, integration, E2E, CLI | `bass evaluate --levels 2` |
| 3 비기능 | 성능, 접근성, 시각 회귀, 토큰 일관성 | `bass evaluate --levels 3` + `bass design check` |
| 4 독립 비판 | 계획·코드·테스트·보안·단순성·디자인 critic | `bass compose --critic <name>` 으로 실행, `bass critique validate/stop` 으로 검증 |
| 5 인간 판단 | 문제 해결 여부, 제품 방향, UX, 위험 수용 | pre-review 의 판단 항목 + 명시적 최종 승인 |

## 원칙

- BASS 는 무엇이 테스트인지 스스로 판단하지 않는다. 프로젝트가 `bass.yaml`
  `evaluators` 에 선언한 명령을 위임 실행하고 결과(pass/fail/timeout/error)를
  구조화한다.
- Level 1~3 통과는 DONE 의 필요조건이지 충분조건이 아니다. Level 4 근거를
  `pre-review`에서 확인하고, Level 5의 명시적 승인 후 `task finalize`로 완료한다.
- critic finding 은 증거(file, location)·심각도·확신도·검증 방법이 필수다.
  근거 없는 표현은 `bass critique validate` 가 프로토콜 위반으로 잡는다.

## BASS 자체 품질 지표 (§21, 관측 대상)

run record 가 축적되면 다음을 계산할 수 있다.

- 첫 검증 통과율, 작업당 재시도 수
- 작업당 변경 파일 수 (files_changed)
- critic 실제 결함 발견률 (critic_findings vs 인간 리뷰 발견)
- 라우팅 권고 준수율 (followed_recommendation)
- 렌더링 검증 수행률 (design.rendered_verification)
