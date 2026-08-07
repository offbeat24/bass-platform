# BASS 0.2.1 — 자연어 기반 AI 에이전트 런타임

BASS를 설치하면 Codex, Cursor, Claude가 같은 task·정책·검증 기준을 내부적으로
사용한다. 사람의 기본 인터페이스는 자연어 대화다. CLI는 사람이 단계별로 운전하는
체크리스트가 아니라 AI 에이전트가 재현 가능하고 멱등하게 작업하기 위한 실행 인터페이스다.

```text
사람의 자연어 목적과 피드백
→ AI 에이전트
→ BASS CLI로 내부 상태·정책·검증·기록 관리
→ 필요한 구현과 검증
→ 결과와 의미 있는 인간 결정만 대화로 전달
```

사람에게 task 상태, gate 명령, approval JSON 또는 run record 작성을 요구하지 않는다.
AI 도구가 이 저장소를 clone한 뒤 읽어야 할 계약은 [AGENTS.md](AGENTS.md), 상세
운영 방법은 [AI agent operations](docs/agent-operations.md), 기존 프로젝트 연결은
[기존 프로젝트 연결 방법론](docs/adopting-existing-project.md)에 있다. 목적과 설계는
[Vision](docs/vision.md), [Architecture](docs/architecture.md),
[Principles](docs/principles.md)에 정리되어 있다.

## 지원 환경

- Node.js 20 이상
- npm과 Git
- macOS 또는 일반 Node.js 개발 환경
- BASS package와 프로젝트 설정 버전 `0.2.1`

BASS Core는 LLM을 직접 호출하지 않는다. 설치된 AI 도구가 BASS CLI를 내부 도구로
사용하며, 사람은 자연어로만 협업한다.

## 1. Clone 후 시작

AI 도구에서 이 폴더를 열고 원하는 목적을 자연어로 말한다.

```text
"BASS 자체를 개선하고 싶어. 현재 상태를 확인하고 필요한 작업을 진행해줘."

"이 BASS를 /path/to/my-project에 연결하고 앞으로 그 프로젝트 작업을 관리해줘."
```

AI는 `AGENTS.md`를 읽고 BASS 자체 개발인지 다른 프로젝트 연결인지 판단한다. 저장소로
확인할 수 없는 대상 경로나 제품 결정만 사람에게 묻고, 아래 명령은 AI가 내부적으로
실행한다.

### 새 프로젝트를 BASS와 함께 생성

BASS 저장소에서 다음 명령을 실행하면 대상 폴더 생성, 현재 BASS package 고정,
의존성 설치와 프로젝트 초기화를 한 번에 수행한다.

```bash
cd /path/to/bass-platform
npm ci
npm run build
npm run bass -- create /path/to/my-project --design
```

생성된 프로젝트에는 `tools/bass-platform-0.2.1.tgz`, `package.json`,
`package-lock.json`, `bass.yaml`과 agent shim이 함께 생긴다. 대상 폴더가 이미
내용을 가지고 있으면 기존 파일 보호를 위해 중단하며, 그 경우 아래의 기존 프로젝트
연결 절차를 사용한다.

### 기존 프로젝트 연결

사람은 AI 도구에 다음처럼 자연어로 요청한다.

```text
"/path/to/project의 기존 방식은 보존하면서 BASS 감독 계약을 연결하고,
실제 작업 하나로 적합성까지 확인해줘."
```

AI는 [기존 프로젝트 연결 방법론](docs/adopting-existing-project.md)에 따라 기존
기술 스택, 검증 명령, AI 지침, 디자인과 운영 규칙을 먼저 조사한다. 조사 결과로
profile과 evaluator를 선택하고 설치·초기화 명령을 내부적으로 실행한다.

기존 파일이 있으면 `bass init`은 이를 건너뛴다. AI는 `--force`로 덮어쓰지 않고
기존 원문에 BASS 계약만 작은 diff로 통합한다. 이미 같은 목적의 하네스·문서·기록이
있다면 두 번째 원천을 만들지 않는다. 파일 생성만으로 완료하지 않고 사용자가 원래
필요로 하던 실제 작업 하나를 수행해 구현·검증·피드백 루프를 확인한다.

Ouroboros와 Ponytail 같은 AI 하네스 플러그인이 있으면 긴 규칙을 BASS에 복사하지
않고 필요한 단계에서만 조정해 사용한다. Ouroboros는 요구 명세·의미 평가, Ponytail은
승인된 범위의 최소 구현에 집중하며 BASS task와 run record가 원천으로 남는다. 설치와
활성화 경계는 [AI 하네스 플러그인 통합](docs/agent-harness-plugins.md)을 따른다.

### NAN 2026은 명시적으로 선택

일반 프로젝트에는 NAN 절차를 적용하지 않는다. 기존 프로젝트 조사에서 NAN 2026 대회
맥락이 확인된 경우에만 AI 에이전트가 `--preset nan2026`을 명시적으로 사용한다.

```bash
npm run bass -- create /path/to/game-project \
  --preset nan2026 \
  --design

npx --no-install bass init \
  --name game-project \
  --preset nan2026 \
  --design
```

NAN preset은 concept 비교, runtime 선택, trace, evidence, session protection을
추가한다. concept과 runtime 선택은 사람이 책임지는 실제 결정이므로 명시적 승인을
요구하지만, checkpoint나 workflow 상태 전환을 형식적 승인 질문으로 노출하지 않는다.
기존 게임 프로젝트의 코드·검증·디자인·하네스도 일반
[연결 방법론](docs/adopting-existing-project.md)에 따라 보존·통합한다. 에이전트는
`nan/AGENT_WORKFLOW.md`와 [NAN 설계 설명서](docs/nan2026.md)를 읽고 관련 명령과
기록을 내부 관리한다.

## 2. Package 배포와 설치

BASS 0.2.1은 공개 npm registry package가 아니며 `private` package다. 반드시 이
저장소에서 검증한 tarball을 설치한다. 설치 전의 `npx bass`는 사용하지 않는다.

```bash
# BASS 저장소
npm ci
npm run build
npm run smoke:package
mkdir -p /path/to/project/tools
npm pack --pack-destination /path/to/project/tools

# 소비 프로젝트
cd /path/to/project
npm install --save-dev ./tools/bass-platform-0.2.1.tgz
npx --no-install bass --version
```

`npx --no-install`은 로컬 프로젝트에 설치된 BASS만 실행하고 registry에서 동명의
package를 가져오지 않는다.

필요하면 배포 artifact checksum을 기록한다.

```bash
shasum -a 256 tools/bass-platform-0.2.1.tgz
```

## 3. 프로젝트 초기화

```bash
npx --no-install bass init \
  --name my-project \
  --profiles common,web \
  --design
```

Profile 예시:

- 일반 공통 규칙: `common`
- Web UI: `common,web`
- Server: `common,server`
- CLI: `common,cli`

생성 파일:

```text
bass.yaml
AGENTS.md
.cursor/rules/bass.mdc
CLAUDE.md
DESIGN.md                 # --design 사용 시
tasks/
records/
critiques/
docs/decisions/
```

기존 파일은 기본적으로 보존된다. `--force`는 기존 shim과 설정을 덮어쓸 수 있으므로
일반적인 연결 수단으로 사용하지 않는다. AI는 건너뛴 원문을 보존하고 BASS 계약만
통합한다.

## 4. 매 세션 시작

AI 에이전트가 내부적으로 확인한다.

```bash
npx --no-install bass --version
npx --no-install bass doctor
npx --no-install bass config explain
npx --no-install bass agent guide
npx --no-install bass task validate
```

다음을 확인한다.

- 설치된 CLI와 `bass.yaml`의 version이 같은가?
- Codex/Cursor/Claude shim이 존재하고 과도하게 비대해지지 않았는가?
- 활성 profile과 override 출처가 예상과 같은가?
- 진행할 task의 필수 섹션이 채워졌는가?

## 5. 자연어 요청과 내부 Task

사람은 다음처럼 요청한다.

```text
"로그인 오류 상태가 다음 행동을 더 명확히 안내하도록 개선해줘."
```

AI 에이전트는 가장 작은 결과로 범위를 정하고 아래 명령을 내부적으로 사용한다.

```bash
npx --no-install bass task new PROJ-001 \
  --title "로그인 오류 상태 개선" \
  --if-missing
npx --no-install bass agent guide PROJ-001
```

에이전트가 `tasks/PROJ-001.md`에 다음을 기록한다.

- Problem
- What we are shipping
- What we are not shipping
- Acceptance criteria
- 위험도와 승인 사유
- 검증 계획

상태는 사용자 승인 절차가 아니라 재시도·복구를 위한 내부 기록이다. 에이전트가 안전한
전이를 자동 수행하고 사람에게 상태 파일 편집을 요구하지 않는다.

```bash
npx --no-install bass task validate PROJ-001
npx --no-install bass route PROJ-001 --role worker
npx --no-install bass gate pre-task PROJ-001
```

위험 정책이 트리거되면 `pre-task`는 실제로 중지한다. 에이전트는 사실·선택지·권장안과
영향을 대화로 제시하고, 사람의 명시적 결정만 `bass approval risk`로 기록한다.
상태 전환 자체에는 승인을 요청하지 않는다.

## 6. 에이전트 내부 지침 조합

Codex, Cursor, Claude shim은 규칙 전문을 복사하지 않고 같은 BASS 원천을 참조한다.
아래 명령은 사람이 복사해 프롬프트로 전달하는 절차가 아니라 에이전트가 역할 전환과
critic 실행에 사용하는 내부 인터페이스다.

```bash
npx --no-install bass compose --role discovery --task PROJ-001
npx --no-install bass compose --role planner --task PROJ-001
npx --no-install bass compose --role worker --task PROJ-001
```

Critic 지침:

```bash
npx --no-install bass compose --critic implementation --task PROJ-001
npx --no-install bass compose --critic security --task PROJ-001
```

지원 role과 critic의 실제 파일은 `prompt-library/`가 단일 원천이다.

## 7. 구현 중 검증

프로젝트의 `bass.yaml`에 evaluator를 등록한 경우:

```bash
npx --no-install bass evaluate
npx --no-install bass evaluate --levels 1,2
```

UI 프로젝트:

```bash
npx --no-install bass design check
```

교정 제안은 즉시 규칙으로 확정하지 않고 pending 상태로 기록한다.

```bash
npx --no-install bass design correction add \
  "모바일 카드 간격은 spacing token을 사용한다" \
  --evidence "playtest-01,screenshot-02"

npx --no-install bass design correction list
npx --no-install bass design correction review 1 \
  --decision approved \
  --reviewer team-lead
```

## 8. Critic 결과와 반복 종료

Critic finding은 구조화된 YAML로 저장하고 검증한다.

```bash
npx --no-install bass critique validate \
  critiques/PROJ-001/implementation-1.yaml

npx --no-install bass critique stop critiques/PROJ-001
```

수용한 finding은 가능한 경우 재현 테스트로 고정한다. 단순히 critic이 더 이상
문제를 찾지 못했다는 이유만으로 완료하지 않는다.

## 9. 검토와 완료

에이전트가 검증 결과와 변경 내역을 `records/PROJ-001.json`에 기록하고, 사람에게
보여주기 전에 준비 상태를 검사한다.

```bash
npx --no-install bass evaluate
npx --no-install bass gate pre-review PROJ-001
```

에이전트는 결과, 검증 근거, 알려진 제한, 사람이 판단할 항목을 한 번에 보여준다.
사람이 결과를 명시적으로 승인한 경우에만 내부적으로 완료한다.

```bash
npx --no-install bass approval final PROJ-001 \
  --approver team-lead \
  --notes "의도와 렌더링 결과 확인"
npx --no-install bass task finalize PROJ-001
```

검토 전에 확인한다.

- Acceptance criteria를 모두 검증했는가?
- 필요한 human approval이 기록됐는가?
- evaluator 실패나 미해결 critic finding이 없는가?
- run record에 test, 변경 파일과 결과가 기록됐는가?
- UI 변경이면 `DESIGN.md`와 실제 결과가 일치하는가?

상태 전이와 run record 규칙은 [Workflows](docs/workflows.md)를 따른다.

## 10. 설정과 Profile 운영

최종 설정과 override 출처:

```bash
npx --no-install bass config explain
npx --no-install bass config explain --env staging
npx --no-install bass config explain \
  --set workflow.max_active_tasks=2
```

설정 우선순위와 secret masking 규칙은
[Configuration](docs/configuration.md)을 참고한다. 모델명을 task나 prompt에
직접 고정하지 말고 registry alias를 사용한다.

```bash
npx --no-install bass resolve reasoning-high
npx --no-install bass route PROJ-001 --role critic
```

모델 registry 운영은 [Model routing](docs/model-routing.md)을 따른다.

## 11. 오류 복구

| 증상 | 원인 | 조치 |
|---|---|---|
| `node: command not found` | Node.js 미설치 | Node.js 20 이상 설치 후 터미널 재시작 |
| `could not determine executable` | BASS package 미설치 | tarball 설치 후 `npx --no-install bass` 사용 |
| BASS version mismatch | CLI와 `bass.yaml` 버전 불일치 | package와 project 설정을 같은 버전으로 맞추고 release 변경 검토 |
| `bass.yaml not found` | 프로젝트 루트 밖에서 실행 | `bass.yaml`이 있는 프로젝트 또는 하위 디렉터리로 이동 |
| `Unknown profile` | profile 이름 오류 | `profiles/` 목록과 `bass.yaml` 확인 |
| `pre-task` 실패 | task 미완성 또는 위험 결정 누락 | 에이전트가 명세를 보완하거나 사람의 명시적 위험 결정을 기록 |
| `pre-review` 실패 | run record, 검증 또는 critic 근거 누락 | 에이전트가 첫 미완료 검증부터 재개 |
| `task finalize` 실패 | 최종 승인 또는 완료 조건 누락 | 결과를 사람에게 보여주고 명시적 승인 뒤 재실행 |
| shim 경고 | shim 누락, marker 손상 또는 비대화 | 사용자 변경을 검토한 뒤 프로젝트 담당자가 재생성 |
| npm cache 권한 오류 | 사용자 cache 소유권 이상 | 별도 cache 사용 또는 관리자와 권한 복구 |

별도 npm cache로 일시 실행:

```bash
npm ci --cache /tmp/bass-npm-cache
npm_config_cache=/tmp/bass-npm-cache npm run smoke:package
```

## 12. 재실행과 Upgrade

- `doctor`, `config explain`, `task validate`, `route`, `compose`는 읽기 중심 명령이다.
- `init --force`는 덮어쓰기가 있으므로 일반 재실행 명령으로 사용하지 않는다.
- BASS upgrade 시 tarball, `package-lock.json`, `bass.yaml` version을 함께 바꾼다.
- version mismatch를 임의로 무시하지 말고 해당 release의 변경을 먼저 검토한다.
- shim에 prompt 원문을 복사하지 않는다.

## BASS 개발자 검증

BASS runtime 자체를 수정하는 사람만 실행한다.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run smoke:package
npm run check:nan
npm run smoke:nan
```

## 설계 문서

- [Vision](docs/vision.md) — BASS의 목적과 범위
- [Architecture](docs/architecture.md) — 구성 요소와 데이터 흐름
- [Principles](docs/principles.md) — 운영·설계 원칙
- [Adopting an existing project](docs/adopting-existing-project.md) — 기존 프로젝트 연결
- [Workflows](docs/workflows.md) — 상태 머신과 gate
- [Configuration](docs/configuration.md) — 설정 계층과 override
- [Project profiles](docs/project-profiles.md) — profile 선택
- [Model routing](docs/model-routing.md) — alias와 모델 선택
- [Evaluation](docs/evaluation.md) — evaluator level
- [Security](docs/security.md) — 권한과 위험 제어
- [Migration from COL](docs/migration-from-COL.md) — 기존 harness 이행
- [AI harness plugins](docs/agent-harness-plugins.md) — Ouroboros·Ponytail 온디맨드 조정
- [NAN 2026](docs/nan2026.md) — 선택적 대회 프로필과 evidence 계약
