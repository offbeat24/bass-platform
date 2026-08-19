# BASS 0.5 — Codex–Claude Portable Product-to-Ship Harness

BASS는 아이디어를 제품·기술·디자인 명세로 구체화하고, 작은 작업으로 나눈 뒤 구현·검증·리뷰를 bounded loop로 관리한다. BASS가 Task Graph, 게이트, Run Record, evidence의 기준을 유지하고 Codex·Claude·Prime Agent와 외부 하네스는 선택형 실행 도구로만 사용한다.

설치부터 업그레이드·개발·배포까지의 전체 절차는 [BASS 0.5.0 Release Notes](RELEASE_NOTES.md)에 정리되어 있다.

개발·터미널·GitHub를 처음 접하는 사람이 BASS로 첫 게임을 만드는 과정은 [코딩을 몰라도 시작하는 첫 게임 만들기](docs/game-development-for-complete-beginners.ko.md)를 따른다.

동일한 `0.5.x` 버전을 세 계층이 공유한다.

- 호스트 CLI: `@offbeat24/bass`
- 팀 플러그인: Codex·Claude marketplace의 `bass`
- 저장소 계약: `bass.yaml`, 2KB 미만 `AGENTS.md` 관리 블록, 제품 문서와 `.bass/` 기록

대상 프로젝트가 Python, Unity, Rust여도 BASS 때문에 `package.json`을 만들지 않는다. Node.js 20은 CLI를 실행하는 호스트에만 필요하다.

## 팀원 최초 1회 설정

GitHub Packages는 PAT classic의 `read:packages` 권한으로 인증한다.

```bash
npm login --scope=@offbeat24 --auth-type=legacy --registry=https://npm.pkg.github.com
```

플러그인 launcher가 `bass.yaml`과 같은 버전을 npm cache에서 실행하므로 전역 설치는 선택이다.

```bash
npm install -g @offbeat24/bass@0.5.0
codex plugin marketplace add offbeat24/bass-platform
```

Codex `/plugins` 또는 데스크톱 Plugins Directory에서 `bass`를 설치하고 새 세션을 시작한다. Claude Code에서는:

```text
/plugin marketplace add offbeat24/bass-platform
/plugin install bass@offbeat24-bass-platform
```

Codex와 Claude는 같은 skills, hooks, launcher를 사용하며 코어를 복제하지 않는다. Codex 매니페스트는 공용 훅 경로를 명시하고, Claude Code는 표준 `hooks/hooks.json`을 자동 발견한다.

## 어느 저장소에서든 연결

```bash
bass setup /path/to/repository --non-interactive \
  --capability specification=builtin \
  --capability simplicity=ponytail
```

선택형 외부 하네스는 명시적으로만 고른다.

```bash
bass setup /path/to/repository --non-interactive \
  --adapter runner=prime-agent \
  --adapter context_provider=graft \
  --adapter workspace_executor=omc \
  --adapter collaboration_provider=buzz
```

BASS는 외부 도구를 설치하거나 흉내 내지 않는다. 각 호스트의 설치·인증·세션 활성 상태를 따로 검사하고, 한 호스트의 캐시를 다른 호스트 설치로 인정하지 않는다.

```bash
bass doctor --capabilities --host codex
bass doctor --capabilities --host claude
bass doctor --capabilities --host all  # 공식 호환 호스트 전체 릴리스 검사
```

Codex와 Claude Code가 같은 BASS 버전, `bass.yaml`, task, 저장소 상태를 읽으면 `contractVersion`, `planFingerprint`, `capabilityCalls`, scope lock, gate 요구사항이 같아야 한다. 모델명·토큰·시간·설명 문구와 허용 범위 안의 구현 세부는 달라도 된다. Cursor shim은 유지하지만 이 동등성 릴리스 게이트에는 포함하지 않는다.

기본 저장소 계약:

```text
PRODUCT.md
TECH.md
DESIGN.md
specs/                       # 큰 기능만
bass.yaml
AGENTS.md
.bass/
  tasks/
  records/
  evidence/
  events.jsonl
  cache/                     # gitignore
```

기존 PRODUCT·TECH·DESIGN 문서는 보존하고 없는 파일만 만든다. 이름·브랜드·로고는 후보와 방향까지만 기록하며 최종 선택은 사람이 한다.

## Product-to-Ship 흐름

```text
아이디어
→ PRODUCT / TECH / DESIGN
→ 필요할 때만 feature spec
→ Task Graph + owned paths
→ bounded attempt
→ affected verification + evidence
→ REVIEW의 인간 제품 판단
→ DONE
```

핵심 명령:

```bash
bass task graph --json
bass agent guide TASK-001 --json
bass compose --role worker --task TASK-001
bass task transition TASK-001 ACTIVE
bass task attempt start TASK-001
bass capability claim TASK-001 ponytail:full --host codex --json
bass capability complete TASK-001 ponytail:full --host codex --status pass --summary "review complete"
bass evaluate --task TASK-001
bass task attempt finish TASK-001 --result pass --summary "checks passed" --turns 3
bass gate pre-review TASK-001
bass status --watch
```

`bass compose`는 base·역할·현재 task 다음에 `Relevant context`의 명시 경로와 직접 관련된 PRODUCT·TECH·DESIGN 섹션만 조합한다. 기본 한도는 12,000자이며, 생략된 항목과 이유·checksum을 표시한다. 프로젝트 밖 경로, 비밀 파일, 전체 과거 기록은 자동 로드하지 않는다.

## 실행 깊이와 루프 예산

| 깊이 | 최대 턴 | 최대 시도 | 최대 시간 | Critic |
|---|---:|---:|---:|---:|
| Fast | 4 | 1 | 15분 | 0 |
| Standard | 8 | 2 | 30분 | 1 |
| Hardened | 12 | 3 | 60분 | 2 |

기본은 단일 에이전트다. Hardened이고 독립 작업의 `owned_paths`가 분리된 경우에만 기본 최대 2개를 허용한다. 같은 실패가 새 evidence 없이 반복되거나 무진전·시간·턴·시도 예산을 넘으면 BASS가 추가 실행을 막고 `NEEDS_DECISION` 또는 `NEEDS_EXPERT`로 전환한다.

검증은 기계 검사를 먼저 실행한다. 통과한 검사는 diff fingerprint가 같으면 재사용하고, 실패한 검사와 직접 영향받은 검사만 다시 실행한다. Material UI는 실제 screenshot·viewport·console evidence가 없으면 REVIEW 준비를 통과하지 못한다.

## 외부 하네스 경계

- Ponytail: 실제 설치 플러그인. Fast는 `lite`, Standard/Hardened는 `full`; BASS simplicity critic은 중복하지 않는다.
- Ouroboros: 고비용 명세 모호성에 seed/interview 1회, Hardened 의미 평가 1회만 허용한다.
- Prime Agent: 선택형 runner. BASS task·scope·loop·evidence 계약 안에서만 실행한다.
- Graft: 반복적인 대형 저장소 탐색이 확인된 task에서만 context provider로 호출한다.
- OMC·Orca: Task Graph와 `owned_paths`를 따르는 선택형 workspace executor다.
- Buzz: 비밀·전문이 제거된 `events.jsonl`을 소비하는 협업 provider다.

외부 호출은 `claim → 실제 호스트 플러그인 호출 → complete`로 기록한다. `call_id`는 host를 제외한 plan fingerprint·task·attempt·semantic call로 계산한다. 완료된 호출은 재사용하고, 시작만 남은 호출은 부작용을 알 수 없어 `uncertain`으로 차단한다. 새 attempt에서만 같은 semantic call을 다시 실행할 수 있다.

ECC·gstack·Spec Kit의 구체화 순서, Claude Loop의 종료 조건, Prime Agent의 evidence-backed refinement, Herdr·cmux의 관찰 개념은 BASS Core와 skills에 이식했다. 외부 프롬프트나 런타임은 복제하지 않는다. 자세한 경계는 [External harness providers](docs/agent-harness-plugins.md)를 참고한다.

## 모델 라우팅

프로젝트는 실제 모델명이 아니라 alias만 쓴다.

- discovery·planner·critic: `reasoning-high`
- worker: `auto`
- evaluator·summarizer: `fast-reliable`
- documentation: `balanced`

다른 모델을 사용하면 Run Record에 권고 준수 여부와 이유를 남긴다. 실제 모델 매핑은 `registry/models.yaml` 한 곳에서만 관리한다.

## 마이그레이션과 개발

```bash
bass upgrade --check
bass upgrade --apply
npm ci
npm run verify
claude plugin validate .
```

릴리스는 PR 병합 후 `v0.5.0` GitHub Release를 발행하는 순서로 진행한다. `release.yml`이 검증과 GitHub Packages publish를 수행하므로 같은 릴리스에 `workflow_dispatch`를 중복 실행하지 않는다.

이벤트 reader는 schema v1·v2를 함께 읽는다. 0.2–0.4 task와 기존 Run Record도 기본값으로 읽으며 완료 이력을 일괄 재작성하지 않는다. 새 Run Record v2는 `execution_contract`와 `capability_invocations`를 기록한다. push와 package publish는 별도 승인 작업이다.

웹 콘솔과 TUI는 0.5 범위가 아니다. 충분한 실제 프로젝트·task·반복 loop와 팀 피드백이 쌓이고 이벤트 형식이 안정된 뒤에만 별도 버전의 읽기 전용 콘솔을 검토한다. 현재 Codex IDE 확장은 플러그인 설치 릴리스 매트릭스에서 제외하고 저장소의 `AGENTS.md`와 로컬 스킬만 적용한다.

상세 문서: [Architecture](docs/architecture.md), [Configuration](docs/configuration.md), [Workflows](docs/workflows.md), [Agent operations](docs/agent-operations.md), [Existing repository adoption](docs/adopting-existing-project.md).
