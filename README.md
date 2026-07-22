# BASS — Behavior Architecture & System Supervisor

> A runtime for human-supervised AI software engineering.

BASS does not replace engineering judgment.

It structures the collaboration between humans, models, tools,
verification systems, project knowledge, and design specifications
so that AI-assisted changes remain understandable, reviewable,
testable, and accountable.

## 무엇인가

BASS 는 Codex, Cursor, Claude 같은 대화형 AI 에이전트가 **같은 규칙과 같은 게이트**
아래에서 일하도록 만드는 감독 런타임이다. BASS 자체는 LLM 을 호출하지 않는다.
대신 다음을 제공한다.

- **게이트**: 작업 시작(`pre-task`)과 완료(`pre-complete`)를 기계적으로 검사
- **모델 라우팅 권고**: capability alias + 위험도 기반. 모델명 하드코딩 금지
- **지침 조합**: base 행동 규칙 + 역할 + 프로파일 + 프로젝트 + 정책 + 작업 명세
- **독립 critic 프로토콜**: 증거 기반 finding 스키마와 반복 종료 판정
- **Design Profile**: DESIGN.md 를 디자인 의도의 단일 명세로 관리

## 빠른 시작

```bash
# 프로젝트에 BASS 연결 (bass.yaml + Codex/Cursor/Claude shim 생성)
cd my-project
bass init --name my-project --profiles common,web --design

# 작업 생성과 검증
bass task new PROJ-001 --title "로그인 오류 상태"
bass task validate PROJ-001

# 시작 전 게이트 (READY 조건 + 인간 승인 조건)
bass gate pre-task PROJ-001

# 모델 라우팅 권고
bass route PROJ-001 --role worker

# 에이전트에게 줄 지침 조합 (출처 주석 포함)
bass compose --role worker --task PROJ-001

# 평가기 실행 (프로젝트가 bass.yaml 에 선언한 명령)
bass evaluate

# critic 산출물 검증과 반복 종료 판정
bass critique validate critiques/PROJ-001/implementation-1.yaml
bass critique stop critiques/PROJ-001

# 완료 전 게이트 (run record 필수)
bass gate pre-complete PROJ-001

# 설정과 shim 상태 점검
bass config explain
bass doctor
```

## 구조

```text
bass-platform/
├── registry/models.yaml    # 중앙 모델 레지스트리 (운영 데이터, 빠른 변경)
├── profiles/               # common / web / server / cli
├── prompt-library/         # base 행동, 역할, critic 프롬프트 (버전 표기)
├── policies/               # 자동 정지·승인 조건 (버전 고정 동작)
├── src/                    # 코어 런타임 (TypeScript)
├── docs/                   # vision, architecture, COL 감사 등
├── examples/fixture-web/   # 전체 흐름 검증용 예시 프로젝트
└── tests/                  # vitest
```

프로젝트는 BASS 코드를 복사하지 않는다. `bass.yaml` 로 버전을 의존하고,
도구별 파일(AGENTS.md, .cursor/rules, CLAUDE.md)은 참조만 담은 얇은 shim 이다.

## 문서

- [docs/vision.md](docs/vision.md) — 목적과 비전
- [docs/architecture.md](docs/architecture.md) — 구성 요소와 데이터 흐름
- [docs/model-routing.md](docs/model-routing.md) — alias, stable/candidate, 라우팅
- [docs/workflows.md](docs/workflows.md) — 상태 머신과 게이트
- [docs/configuration.md](docs/configuration.md) — 계층형 설정
- [docs/migration-from-COL.md](docs/migration-from-COL.md) — 기존 하네스 이행
- [docs/audit/](docs/audit/) — COL 감사 결과
