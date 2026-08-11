# BASS 0.3 — 이식 가능한 적응형 개발 런타임

BASS는 “많이 검사하는 하네스”가 아니다. 사람은 목적·제품 방향·위험을 결정하고, 에이전트는 저장소 사실을 조사해 가장 작은 구현을 만든다. 검증은 변경 범위와 위험에 비례해 한 번씩 실행하고, 팀원이 이어받는 데 필요한 근거만 남긴다.

동일한 `0.3.x` 버전을 세 계층이 공유한다.

- 호스트 CLI: 비공개 GitHub Package `@offbeat24/bass`
- 팀 플러그인: `offbeat24/bass-platform`의 Codex·Claude marketplace
- 레포 계약: `bass.yaml`, 2KB 미만 `AGENTS.md` 관리 블록, 선택한 어댑터와 `.bass/` 기록

대상 프로젝트가 Python, Unity, Rust여도 BASS 때문에 `package.json`을 만들지 않는다. Node.js 20은 CLI를 실행하는 사용자 호스트에만 필요하다.

## 팀원 최초 1회 설정

GitHub Packages는 PAT classic의 `read:packages` 권한으로 인증한다.

```bash
npm login --scope=@offbeat24 --auth-type=legacy --registry=https://npm.pkg.github.com
```

플러그인의 launcher가 `bass.yaml`과 같은 버전을 host npm cache에서 실행하므로 전역 설치는 필수가 아니다. 터미널에서 `bass`를 직접 쓰려는 팀원만 `npm install -g @offbeat24/bass@0.3.0`을 추가로 실행한다.

Codex:

```bash
codex plugin marketplace add offbeat24/bass-platform
```

Codex CLI에서 `/plugins`를 열어 `offbeat24-bass-platform`의 `bass`를 설치하거나 ChatGPT 데스크톱 Plugins Directory에서 설치한 뒤 새 세션을 시작한다. 저장소 marketplace는 [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json), 플러그인은 [`plugins/bass`](plugins/bass)에 있다.

Claude Code:

```text
/plugin marketplace add offbeat24/bass-platform
/plugin install bass@offbeat24-bass-platform
```

Claude marketplace는 [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json)이다. Codex와 Claude는 같은 `skills/`, `hooks/`, launcher를 사용하고 코어 로직을 복제하지 않는다. 비공개 GitHub 저장소 접근은 팀원의 기존 Git credential을 사용한다.

## 어느 저장소에서든 연결

플러그인 설치 후 에이전트에게 “이 레포에 BASS 연결해줘”라고 요청한다. 직접 실행할 때는:

```bash
bass setup /path/to/repository
```

CI나 자동화:

```bash
bass setup /path/to/repository --non-interactive \
  --capability specification=builtin \
  --capability simplicity=ponytail \
  --capability ui_direction=bass \
  --capability ui_canvas=off \
  --capability html_report=bass
```

`bass create`와 `bass init`은 0.2 호환 alias다. `setup`은 빈 폴더면 create, 내용이 있으면 init으로 처리한다. 기존 파일은 보존하며 `--force`를 정상 연결 수단으로 사용하지 않는다.

기본 생성 범위:

```text
bass.yaml
AGENTS.md                    # 기존 내용 + BASS marker block
CLAUDE.md                    # Claude adapter 선택 시
.cursor/rules/bass.mdc       # Cursor adapter 선택 시
DESIGN.md                    # --design 선택 시
.bass/tasks/
.bass/records/
.bass/cache/                 # gitignore
.bass/local.yaml             # gitignore
```

선택한 외부 플러그인이 없을 때 builtin으로 조용히 바꾸지 않는다.

```bash
bass doctor
bass doctor --capabilities
```

## 적응형 실행

에이전트는 작업 시작 시 다음을 읽는다.

```bash
bass agent guide TASK-001 --json
```

`execution_plan`은 작업 종류, 깊이, 변경 surface, scope lock, 검증 레벨, critic, 선택 capability, 최대 재작업 횟수를 제공한다.

- Fast: 국소 저위험·삭제. L1, critic 0, 재작업 최대 1회.
- Standard: 일반 기능·게임 prototype. L1 + 영향받은 L2, critic 최대 1회, 재작업 최대 1회.
- Hardened: 인증·권한·데이터·공개 API·배포·릴리스. 관련 L1~L3, critic 최대 2회, 재작업 최대 2회.

```bash
bass evaluate --task TASK-001
bass evaluate --task TASK-001 --levels 1,2  # CI/debug override만
```

통과한 평가는 diff 지문이 같으면 재사용한다. `surfaces`가 선언된 evaluator는 관련 surface가 바뀐 경우에만 선택된다. 삭제 작업은 stale-reference와 영향 검사 외에 인접 기능·효율화·온보딩 task를 금지한다.

상태는 `CAPTURED → ACTIVE → REVIEW → DONE`이다. 0.2 상태는 읽을 때 네 상태로 호환 해석한다.

## 선택 capability

- Ouroboros: 명세 충돌이나 고위험 semantic 판단에서만 seed 1회, 기계 검증 뒤 evaluation 1회.
- Ponytail: 실제 플러그인 훅을 사용한다. Fast는 `lite`, 나머지는 `full`; `ultra`는 사용자 명시 시에만 쓴다. 활성화 시 BASS simplicity critic을 중복 실행하지 않는다.
- UI Direction: 신규 UI·큰 redesign에서만 `DESIGN.md` 방향을 확정한다.
- Pen: 선택된 UI 탐색에서 로컬 MCP를 직접 사용한다. `.pen`은 탐색물이지 코드 SSOT가 아니다.
- HTML Report: HTML이 최종 산출물일 때만 기존 run record를 고정 asset으로 렌더한다.

## Game profile

NAN의 일반 runtime 코드는 `src/runtime`과 `profiles/game.yaml`로 분리됐다.

```bash
bass runtime list
bass runtime recommend --dimension 2d --targets web --existing pixi.js --team-ready pixi
bass runtime doctor pixi --targets web
bass runtime scaffold pixi --destination game --targets web --confirm
bass runtime install pixi --path game --confirm
bass runtime verify pixi --path game --targets web
```

지원 adapter는 vanilla web, Pixi, Phaser, PlayCanvas, Unity와 web runtime용 Capacitor target이다. scaffold와 install은 명시적 `--confirm` 없이는 실행되지 않는다. `nan2026`은 `game` 위에 대회 concept gate, 48시간 제한, evidence, trace, session lock만 추가한다.

## 0.2 마이그레이션

```bash
bass upgrade --check   # 읽기 전용
bass upgrade --apply
```

사용자 지침은 덮지 않고 BASS marker block만 갱신한다. 기존 `tasks/`와 `records/`는 읽기 호환하며 완료 이력을 일괄 재작성하지 않는다.

## 개발과 릴리스

```bash
npm ci
npm run verify
claude plugin validate .
```

CI는 macOS, Ubuntu, Windows의 Node 20에서 typecheck, test, build, package smoke, plugin 검증을 수행한다. release workflow는 승인된 릴리스에서 `GITHUB_TOKEN`으로 `@offbeat24/bass`를 GitHub Packages에 publish한다.

상세 문서: [Architecture](docs/architecture.md), [Configuration](docs/configuration.md), [Agent operations](docs/agent-operations.md), [Existing repository adoption](docs/adopting-existing-project.md), [External plugins](docs/agent-harness-plugins.md).
