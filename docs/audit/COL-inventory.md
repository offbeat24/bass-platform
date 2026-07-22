# COL 인벤토리 감사

- 대상: `/Users/okestro/croquis/COL` (Harness HQ v4)
- 감사일: 2026-07-21
- 방식: 읽기 전용 조사. COL 파일은 수정하지 않았다.

## 정체

COL은 제품 저장소가 아니라 **Codex-first 서비스 팩토리 본부(HQ)** 다.
템플릿(`.tpl`)과 계약(JSON Schema)으로 형제 디렉터리 `../deck/<service-id>`에
독립 서비스 레포를 생성하고, 생성된 레포 안에서 게이트 스크립트로 작업을 통제한다.

## 디렉터리 구조 (FACT)

```text
COL/
├── README.md                 # 운영자용 가이드. HQ 운영 모델·기본값
├── AGENTS.md                 # 에이전트 짧은 진입점. HQ에 제품 코드 금지
├── .codex/
│   ├── config.toml           # model=gpt-5.5, review_model=gpt-5.6, max_depth=1
│   ├── hooks.json            # SessionStart / PreToolUse(Bash) / Stop 훅
│   └── agents/*.toml         # 커스텀 에이전트 6종
├── .harness/
│   ├── checklists/           # 비어 있음
│   ├── contracts/            # service / task-pack / run-report 스키마 + docs-manifest
│   └── templates/service-repo/   # 서비스 레포 생성용 .tpl 41개
├── scripts/
│   ├── setup_hq.py           # deck/ 생성, 의존성 확인
│   ├── generate_service_repo.py  # service.yaml → deck 레포 생성 (복사 + 치환)
│   └── validate_harness.py   # HQ 계약·템플릿·모델 핀 검증 + Codex 훅 모드
├── docs/                     # HQ 운영 문서 (retrospectives 등 일부 비어 있음)
├── examples/                 # service.yaml, task-pack.json, run-report.json 샘플
├── skills/harness-prompt-upgrade/  # Codex 업데이트 → HQ 업그레이드 후보 정리 스킬
└── tests/test_harness_hq.py  # HQ 회귀 테스트
```

## 실행 진입점 (FACT)

1. `python scripts/setup_hq.py` — deck 루트 준비
2. `python scripts/generate_service_repo.py --spec service.yaml` — 서비스 레포 생성
3. 생성 레포 내부: `scripts/harness.py pre-task | pre-complete | ci | sync-prompt-context`
4. Codex hooks(`.codex/hooks.json`)가 세션 시작·Bash 실행 전·종료 시 `validate_harness.py` 호출

## 지침 계층 (FACT)

1. 루트 `AGENTS.md` (HQ / 생성 레포 각각)
2. 생성 레포 `DESIGN.md` — UI 압축 규격 (YAML frontmatter 토큰 + 원칙)
3. `docs/**` — 상세 정책
4. `docs/prompting/prompt-context.kr.md` — 파생 요약 (SoT 아님, sync로 재생성)
5. `CLAUDE.md` — `generate_claude_shim.py`가 AGENTS.md + 주요 docs에서 생성하는 shim

## 워크플로/작업 상태 (FACT)

- 상태 머신 대신 **파일 위치 + 게이트**: `docs/exec-plans/active/<TASK>.kr.md` (기본 1개),
  완료 시 `completed/`로 이동
- 게이트: `pre-task`(문서·스펙·task-pack·디자인 단계 검증),
  `pre-complete`(run-report·evidence·journal 마커 없으면 실패)
- 산출물: `artifacts/run-reports/<task_id>.json`, `artifacts/evidence/<task_id>/`
- 저널: `docs/build-journal.kr.md`의 `## Task {id}` 마커

## 검증/critic/서브에이전트 (FACT)

- HQ: `validate_harness.py --mode all` + unittest
- 생성 레포: `harness.py` + `.githooks` + GitHub Actions(`harness.py ci`)
- `reviewer` 에이전트: read-only 최종 비판 리뷰어. 생성자·평가자 역할 분리 정책 존재
- `ui_checker`: 스크린샷/DOM/console fidelity 검사
- 에이전트 역할 TOML 6종이 있으나 `agents.max_depth = 1` + "nested workers 금지"로
  실행 깊이와 역할 설계가 긴장 관계

## 메모리/학습 (FACT)

- 장기 기억 = 버전 관리 파일 (플러그인 아님)
- `docs/retrospectives/harness-feedback.kr.md` + task 마커 (하네스 파일 변경 시 강제)
- run-report의 `handoff_notes` / `next_actions`
- 자동 학습 루프·벡터 메모리 없음. HQ 자체 retrospectives는 비어 있어 학습 축적은 deck 쪽

## 디자인 (FACT)

- 생성 레포 루트 `DESIGN.md`: frontmatter(색/타이포/라운드/간격/모션) + Overview~Agent Guidance
- `docs/design/`: art-direction, design-reference-selection, ui-intent-brief,
  layout-exploration, visual-concepts, ui-principles, browser-review, ui-edit-brief
- 폰트 정책: 국문 Pretendard, 영문 Inter
- serious UI 절차: brief → 구조 2안 → 비주얼 2안 → thesis → 구현 → 브라우저 fidelity
- `task-pack.schema.json`의 `ui_work_type` enum으로 디자인 단계 강제

## 확인된 강점

1. HQ ↔ 제품 경계가 문서·스크립트·테스트로 고정됨
2. 계약(스키마) + 검증(validator/test) 이중화
3. 디자인 품질을 코드 이전 게이트로 승격
4. 완료 정의를 evidence/run-report로 객관화 ("좋아 보인다" 금지)
5. 모델 라우팅 정책과 실행 설정(.codex)의 일치를 validator가 강제

## 확인된 문제

1. 기존 deck으로의 증분 재전파 부재 — 생성/`--force` 전량 교체만 존재
2. 모델 핀(gpt-5.4/5.5/5.6)이 10곳 이상에 하드코딩 → 모델 교체 시 다중 파일 동시 수정
3. OpenAI 전용. Claude는 shim 수준, Cursor는 공식 채널 없음
4. 서브에이전트 역할 정의 6종 vs `max_depth=1` 실행 제약의 충돌
5. 템플릿의 `app/`, `src/` 등은 빈 디렉터리 — 실제 앱 스캐폴드 없음
6. 빈 자리 다수: `.harness/checklists/`, `docs/harness-upgrades|product|retrospectives`
7. 교훈 기록은 수동 문서. 자동 추출·재주입 파이프라인 없음
