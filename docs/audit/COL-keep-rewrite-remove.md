# COL 기능 분류: KEEP / REWRITE / EXTRACT / PROFILE / LOCAL / REMOVE / UNKNOWN

각 판단의 근거는 `COL-inventory.md`의 FACT를 따른다.

## KEEP — 개념과 구현 모두 재사용 가치

| 항목 | 근거 |
|------|------|
| `pre-task` / `pre-complete` 게이트 패턴 | 작업 시작·완료를 기계적으로 통제하는 핵심 메커니즘. BASS `bass gate`로 계승 |
| 계약(JSON Schema) + 검증 스크립트 이중화 | 스키마 선언과 러너 검증이 서로를 지탱. BASS는 zod 스키마로 동일 패턴 구현 |
| run-report / evidence 기반 완료 판정 | "좋아 보인다" 금지. BASS `bass record`와 DONE 조건으로 계승 |
| 생성자·평가자 역할 분리 정책 | 독립 critic의 전신. BASS critic 프로토콜로 계승 |
| 장기 기억 = 버전 관리 파일 원칙 | 채팅 밖 영속 기억. BASS memory 계층의 기반 |

## REWRITE — 목적은 유효, 구조 재작성 필요

| 항목 | 문제 | BASS 방향 |
|------|------|-----------|
| 템플릿 복사 기반 전파 (`generate_service_repo.py`) | 복사 후 드리프트, 증분 전파 불가, `--force`는 전량 삭제 | 버전 있는 런타임 의존 + 얇은 `bass.yaml` + `bass init` shim |
| 모델 핀 하드코딩 (`.codex/config.toml`, agents/*.toml, validator 상수, 템플릿, 문서) | 모델 교체 시 10곳+ 동시 수정 | 중앙 `registry/models.yaml`의 capability alias + stable/candidate |
| 파일 위치 기반 작업 상태 (`exec-plans/active|completed`) | 상태 전이 검증 불가, 확장 상태(BLOCKED 등) 없음 | 명시적 상태 머신 + 작업 파일 frontmatter `status` |
| `prompt-context` 파생 요약 sync | 특정 레포 구조에 결합 | 지침 조합기(`bass compose`)로 일반화, 출처 추적 포함 |
| Claude shim 생성 (`generate_claude_shim.py`) | 원문 복사에 가까워 드리프트 위험 | 참조만 담는 얇은 shim + `bass doctor` 드리프트 검사 |

## EXTRACT — 프로젝트에 묶였지만 일반화 가능

| 항목 | 일반화 방향 |
|------|-------------|
| `harness.py`의 게이트·CI 로직 (생성 레포 내부 복사본) | BASS CLI 하나로 통합, 프로젝트는 의존만 |
| docs-manifest 기반 필수 문서·섹션 검증 | 프로파일별 문서 요구사항으로 이동 |
| browser-review / evidence 정책 | Design Profile의 렌더링 검증 규칙으로 이동 |
| 승인 매트릭스 (`docs/security/approval-matrix.kr.md`) | BASS Policy Engine의 정지·승인 조건으로 이동 |

## PROFILE — 프로젝트 유형 프로파일로 이동

| 항목 | 대상 프로파일 |
|------|---------------|
| DESIGN.md frontmatter 토큰 + 디자인 문서 세트 | web / design 프로파일 |
| serious UI 절차 (brief → 구조 2안 → 비주얼 2안 → thesis) | web 프로파일의 권장 작업 분해 |
| `ui_work_type` 단계 강제 | Design Profile 게이트 |
| Next.js/Supabase/Vercel 기본 스택 | web 프로파일 기본값 (강제 아님) |
| 폰트 정책 (Pretendard/Inter) | web 프로파일 또는 프로젝트 LOCAL |

## LOCAL — 특정 프로젝트에만 남길 것

| 항목 | 이유 |
|------|------|
| 각 deck 레포의 build-journal, exec-plans, evidence 산출물 | 프로젝트 이력. 공통화 대상 아님 |
| `service.yaml`의 서비스별 값 | 프로젝트 설정 |
| deck별 DESIGN.md 구체 토큰 값 | 프로젝트 디자인 결정 |

## REMOVE — 불필요 또는 현재 모델에 부적합

| 항목 | 이유 |
|------|------|
| `.harness/checklists/` 빈 디렉터리 | 사용 흔적 없음 |
| HQ `docs/harness-upgrades|product|retrospectives` 빈 자리 | 사용 흔적 없음. 필요 시 재도입 |
| 빈 `app/`, `src/` 템플릿 디렉터리 | 스캐폴드 역할을 하지 못함 |
| OpenAI 전용 가정 | Codex·Cursor·Claude 3채널 요구와 충돌 |

## UNKNOWN — 실행·비교 전 판단 불가

| 항목 | 확인 방법 |
|------|-----------|
| Codex hooks 연동의 실효성 (세션 훅이 실제로 품질을 올렸는가) | deck 파일럿에서 hook 유무 비교 |
| `max_depth=1` 제약 하에서 6종 에이전트 역할의 실사용률 | Codex 세션 로그 확인 필요 |
| harness-prompt-upgrade 스킬의 재사용 가치 | BASS 운영 후 업그레이드 시나리오에서 재평가 |
| deck 레포들의 실제 드리프트 정도 | 파일럿 시 deck 레포와 템플릿 diff |
