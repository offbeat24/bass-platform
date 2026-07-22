# Principles

Core 프롬프트 §2, §3 의 원칙을 BASS 동작으로 강제·유도하는 방식.

| 원칙 | 강제 수단 |
|------|-----------|
| 구현부터 시작하지 않는다 | 상태 머신이 CAPTURED → IMPLEMENTING 직행을 거부 |
| 사실과 결정을 분리한다 | 작업 파일의 Facts / Decisions / Assumptions 섹션, base behavior 프롬프트 |
| 작업은 작고 검토 가능해야 한다 | `max_active_tasks`, pre-task 섹션 검사, out_of_scope_findings |
| 인간이 책임질 수 있어야 한다 | run record 의 human_approval, why, rollback 필수 |
| 이해 못 하면 추측 구현 금지 | NEEDS_DECISION 상태, 미해결 Assumptions 경고 + 라우팅 escalate |
| 사고를 외주화하지 않는다 | needs-human 게이트 체크는 기계가 대신 통과시킬 수 없다 |
| 신뢰와 책임 보존 | run record 가 결정자·검토자·승인 시각을 기록 |
| 전문 영역은 생성보다 학습 | `expert-domain` 승인 규칙 → NEEDS_EXPERT |
| 독립 비판 | critic 프롬프트는 신선한 컨텍스트 실행을 지시, finding 은 증거 필수 |
| 에이전트 수 ≠ 품질 | critic 반복 종료 판정이 추측 비율 증가 시 중단 |
| 교훈의 점진적 승격 | lessons.candidates → project memory → (반복 확인 후) BASS learning |
| 문서 양 ≠ 진척 | 프로파일 required_docs 는 최소한으로 유지 |
