# AI 하네스 플러그인 통합

BASS는 Ouroboros와 Ponytail을 vendoring하거나 규칙 전문을 프롬프트에 복사하지 않는다.
설치된 플러그인의 skill·hook을 필요한 단계에서만 호출하고, BASS의 task, acceptance
criteria, gate, run record를 단일 실행 원천으로 유지한다.

| 플러그인 | BASS에서 맡길 일 | 기본 호출 경계 |
| --- | --- | --- |
| [Ouroboros](https://github.com/Q00/ouroboros) | 숨은 제품 가정 노출, 명세 결정, 고위험 의미 평가 | 불확실성이 실제 재작업 위험을 만들 때만 interview/seed, 기계 검증 뒤 의미 평가가 필요할 때만 evaluate |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | 기존 코드·표준·플랫폼 기능 재사용, 과잉 구현 억제 | 승인된 범위를 구현할 때 적용하고 diff가 계획보다 커졌을 때 review |

## 토큰과 품질을 함께 지키는 순서

1. 저장소와 현재 task를 먼저 읽는다. 플러그인에게 같은 discovery를 다시 시키지 않는다.
2. 제품 목적·acceptance criteria가 불명확하고 잘못 구현할 비용이 클 때만 Ouroboros를
   호출한다. 확정된 Seed의 결정과 기준은 현재 BASS task에 한 번 옮기고 병렬 ledger를
   운영하지 않는다.
3. 구현에는 Ponytail의 가장 작은 유효 diff 원칙을 적용한다. 이미 있는 코드, 표준
   라이브러리, 플랫폼 기능, 설치된 의존성을 순서대로 재사용한다.
4. build·typecheck·test 같은 저렴한 기계 검증을 먼저 실행한다. 통과한 뒤 위험이
   남을 때만 Ouroboros 의미 평가나 Ponytail review를 한 번 실행한다.
5. 플러그인 피드백으로 수정했으면 영향받은 검사만 다시 실행한다. 새 근거 없는
   interview/evaluate/review 반복은 중지한다.

단순화에서 제외할 항목은 요구된 동작, trust-boundary 검증, 데이터 손실 방지 오류 처리,
보안, 접근성, 공개 호환성이다. Ponytail의 최소화가 acceptance criteria와 충돌하면
acceptance criteria가 우선한다. Ouroboros의 평가도 실제 실행된 테스트나 렌더링 증거를
대체하지 않는다.

## 설치와 독립성

플러그인 설치는 호스트별 사용자 환경 변경이므로 BASS가 자동 수행하지 않는다. 공식
저장소의 현재 설치 방법을 사용한다. Codex의 예시는 다음과 같다.

```bash
codex plugin marketplace add Q00/ouroboros
codex plugin add ouroboros@ouroboros

codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail
```

설치되지 않은 환경에서는 BASS의 discovery·task shaping·evaluator·simplicity critic으로
같은 경계를 유지한다. 따라서 두 플러그인은 품질 보조 계층이며 BASS 실행의 필수
의존성이 아니다.

플러그인의 절감 수치는 참고값이지 BASS의 보증이 아니다. 동일 작업군에서 전체 입력·출력
토큰, 재시도 수, 변경 LOC, 결함과 사람 검토 시간을 함께 비교한 뒤 활성화 강도를 조정한다.
