# Workflows

## 상태 머신 (§13)

```text
CAPTURED → DISCOVERY → SHAPED → READY → PLANNED → IMPLEMENTING
→ VERIFYING → CRITIQUING → HUMAN_REVIEW → DONE
```

추가 상태: `BLOCKED`, `NEEDS_DECISION`, `NEEDS_EXPERT`, `FAILED`,
`ROLLED_BACK`, `CANCELLED`

규칙 (`src/workflow/stateMachine.ts`):

- 단계 건너뛰기 금지 (CAPTURED → IMPLEMENTING 불가)
- VERIFYING / CRITIQUING / HUMAN_REVIEW 에서 문제 발견 시
  IMPLEMENTING / PLANNED / DISCOVERY 로 회귀 가능
- hold 상태(BLOCKED 등)는 인간 결정 후 활성 단계로 복귀
- DONE 이후는 ROLLED_BACK 만 가능

작업 상태는 `tasks/<ID>.md` frontmatter 의 `status` 가 단일 원천이다.
`bass task validate` 가 현재 상태에서 가능한 전이를 보여준다.

## READY 조건 → `bass gate pre-task`

- status 가 READY 이후
- Problem / What we are shipping / What we are not shipping /
  Acceptance criteria / Relevant context / Verification / Rollback 섹션 비어 있지 않음
- 동시 활성 작업 수 제한 (`workflow.max_active_tasks`)
- 승인 정책 트리거 시 needs-human 표시 (인간 승인 전 구현 금지)
- 미해결 Assumptions 경고

## DONE 조건 → `bass gate pre-complete`

- status 가 HUMAN_REVIEW
- `records/<ID>.json` run record 존재 + 스키마 유효 (없으면 즉시 실패)
- 평가기 결과에 fail/error 없음, 최소 1개 실행
- 검증 못한 항목(`not_verified`)은 인간 판단 대상으로 표시
- 미해결 high/medium critic finding 0건
- 인간 승인 기록 (reviewer_required 시)
- 문서 갱신 필요 여부 확인, 롤백 방법 기록, 교훈 판단 흔적
- Design Profile 활성 시: 렌더링 검증 **여부 기록** 강제
  (렌더링하지 않은 UI 를 "시각적으로 검증 완료"로 표현하지 못하게 함)

## 종료 보고 (§28)

run record 가 종료 보고를 겸한다: 무엇을/왜 변경했는가, 변경 파일,
실행한 검증과 통과 여부, 검증되지 않은 것, critic finding, 남은 위험
(known_limitations), 다음 할 일 (out_of_scope_findings).
