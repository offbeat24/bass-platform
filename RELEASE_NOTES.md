# BASS 0.5.0 — Codex와 Claude를 위한 단일 실행 계약

BASS 0.5.0은 Codex Desktop/CLI와 Claude Code가 하나의 BASS Core, plugin package, skills, hooks, launcher를 공유하는 첫 릴리스다.

두 호스트가 같은 문장이나 같은 패치를 만들 필요는 없다. 대신 같은 BASS 버전, `bass.yaml`, task, 저장소 상태를 입력으로 받으면 실행계획, 외부 capability 호출, scope lock, gate, evidence 요구사항과 완료 판정이 같아야 한다.

## 주요 변경

### 하나의 Codex–Claude plugin

- Codex와 Claude가 동일한 `plugins/bass/` package를 사용한다.
- `.codex-plugin/plugin.json`과 `.claude-plugin/plugin.json`은 발견과 표시만 담당한다.
- 여섯 BASS skill과 공용 hooks, launcher는 호스트별 복사본 없이 한 곳에서 관리한다.
- 모든 skill은 bare `bass`나 호스트 전용 경로 대신 `SKILL.md` 기준의 공용 `bass-launcher.cjs`를 사용한다.
- launcher는 `process.execPath`와 `npm_execpath`로 npm을 실행해 Windows, macOS, Linux에서 같은 실행 방식을 사용한다.

### 결정적인 실행 계약

- `ExecutionPlan`에 `contractVersion`과 SHA-256 `planFingerprint`를 추가했다.
- fingerprint에는 호스트의 로컬 plugin 설치 상태, 모델명, 토큰, 시간과 설명 문구를 포함하지 않는다.
- 같은 입력에서는 Codex와 Claude의 `planFingerprint`, `capabilityCalls`, scope와 gate 요구사항이 같아야 한다.
- 허용 범위 안의 구현 방식과 코드 표현은 호스트별로 달라도 된다.

### 호스트별 외부 capability 검사

- 하나의 provider catalog가 capability의 builtin/external 여부와 Codex·Claude binding을 관리한다.
- `bass doctor --capabilities --host codex|claude|all`로 각 호스트의 설치, 활성화, 인증과 지원 상태를 분리해 검사한다.
- 외부 provider가 한 호스트를 지원하지 않으면 BASS가 대체 동작을 흉내 내지 않고 `unsupported`로 차단한다.
- BASS는 외부 plugin을 자동 설치하거나 자동 교체하지 않는다.

### 멱등한 외부 호출

- `.bass/events.jsonl` schema v2에 `capability.started`와 `capability.completed`를 추가했다.
- `bass capability claim`과 `bass capability complete`로 외부 호출을 실행 전후에 기록한다.
- 완료된 동일 호출은 `reuse`, 시작 기록만 남은 호출은 `uncertain`을 반환해 중복 부작용을 막는다.
- `call_id`에서 host를 제외하므로 같은 attempt를 Codex에서 Claude로 넘겨도 완료된 호출을 다시 실행하지 않는다.
- 의도적인 재호출은 새 attempt를 시작한 경우에만 허용한다.

### Run Record와 반복 실행 안정성

- Run Record v2가 `execution_contract`와 `capability_invocations`를 기록한다.
- 완료 gate가 현재 계획, capability 이벤트, scope, evaluator와 evidence를 Run Record와 대조한다.
- event reader는 기존 schema v1과 신규 v2를 모두 읽는다.
- `setup`, `upgrade --apply`, managed block, shim과 scope warning은 반복 실행해도 중복 생성되지 않는다.
- 같은 Run Record로 만든 HTML report는 byte-identical해야 한다.
- `PostToolUse` scope hook은 파일 편집 도구뿐 아니라 `Bash` 변경도 검사한다.

## 지원 대상

| 호스트 | 지원 수준 |
|---|---|
| Codex Desktop/CLI | 공식 plugin, skills와 hooks 지원 |
| Claude Code | 공식 plugin, skills와 hooks 지원 |
| Codex IDE extension | 저장소 `AGENTS.md`와 로컬 skill만 적용 |
| Cursor | 기존 shim 유지, Codex–Claude 동등성 gate에서는 제외 |

Node.js 20 이상이 BASS CLI 실행 호스트에 필요하다. 대상 프로젝트가 Python, Unity, Rust여도 BASS가 `package.json`을 만들지는 않는다.

## 설치

GitHub Packages를 사용한다면 PAT classic에 `read:packages` 권한을 부여한 뒤 로그인한다.

```bash
npm login --scope=@offbeat24 --auth-type=legacy --registry=https://npm.pkg.github.com
```

전역 CLI 설치는 선택 사항이다. plugin launcher는 저장소의 `bass.yaml`에 지정된 BASS 버전을 실행한다.

```bash
npm install -g @offbeat24/bass@0.5.0
bass --version
```

### Codex

```bash
codex plugin marketplace add offbeat24/bass-platform
codex plugin add bass@offbeat24-bass-platform
codex plugin list
```

Codex Desktop의 Plugins Directory에서도 `bass`를 설치할 수 있다. 설치 또는 업데이트 후 새 세션을 시작하고 hook 신뢰를 승인한다.

### Claude Code

Claude Code 안에서 실행한다.

```text
/plugin marketplace add offbeat24/bass-platform
/plugin install bass@offbeat24-bass-platform
```

설치 또는 업데이트 후 새 세션을 시작한다. Claude Code는 package의 표준 `hooks/hooks.json`을 자동 발견한다.

## 프로젝트 연결과 업그레이드

신규 프로젝트 또는 아직 BASS를 사용하지 않는 저장소:

```bash
bass setup /path/to/repository --non-interactive \
  --capability specification=builtin \
  --capability simplicity=ponytail
```

기존 BASS 0.2–0.4 저장소:

```bash
cd /path/to/repository
bass upgrade --check
bass upgrade --apply
```

`upgrade --check`는 변경 예정만 보여준다. `upgrade --apply`는 BASS 관리 영역만 갱신하고 기존 PRODUCT·TECH·DESIGN 문서, task와 Run Record를 덮어쓰지 않는다. 같은 명령을 다시 실행하면 변경 없는 no-op이어야 한다.

연결 후 현재 호스트를 검사한다.

```bash
bass doctor --capabilities --host codex
# 또는
bass doctor --capabilities --host claude
```

양쪽 호스트를 공식 지원 대상으로 함께 검증할 때는 다음을 사용한다.

```bash
bass doctor --capabilities --host all
```

`missing`, `inactive`, `unauthenticated`, `unsupported` 중 하나라도 발견되면 해당 외부 capability를 실행하지 않는다.

## 작업 시작

사용자는 목표, 완료 조건과 허용 범위를 자연어로 전달하면 된다. BASS의 표준 실행 흐름은 다음과 같다.

```bash
bass agent guide TASK-001 --json
bass task graph --json
bass gate pre-task TASK-001
bass task transition TASK-001 ACTIVE
bass task attempt start TASK-001 --json

# 구현 후 영향받은 evaluator 실행
bass evaluate --task TASK-001
bass task attempt finish TASK-001 \
  --result pass --summary "affected checks passed" --turns 3

bass gate pre-review TASK-001
bass task transition TASK-001 REVIEW
bass approval final TASK-001 --approver user
bass task finalize TASK-001
```

Fast, Standard, Hardened의 기본 최대 attempt는 각각 1, 2, 3이다. 같은 실패가 새 evidence 없이 반복되거나 시간·turn·no-progress 예산을 넘으면 BASS가 `NEEDS_DECISION` 또는 `NEEDS_EXPERT`로 중단한다.

외부 capability가 실행계획에 포함되었다면 실제 plugin 호출 전후를 기록한다.

```bash
bass capability claim TASK-001 ponytail:full --host codex --json

bass capability complete TASK-001 ponytail:full \
  --host codex \
  --status pass \
  --summary "simplicity review accepted" \
  --evidence .bass/evidence/TASK-001/ponytail.log
```

claim 결과의 의미:

- `run`: 현재 호스트에서 외부 provider를 한 번 호출한다.
- `reuse`: 이미 완료된 동일 호출 결과를 재사용한다.
- `uncertain`: 시작 기록만 남아 있으므로 재호출하지 않고 사람의 판단을 요청한다.

## 마이그레이션 시 주의사항

- `ExecutionPlan`을 직접 소비하는 코드는 새 필수 필드 `contractVersion`과 `planFingerprint`를 처리해야 한다.
- 신규 Run Record는 v2로 작성되지만 기존 record는 기본값을 적용해 계속 읽을 수 있다.
- `doctor --host all`은 Codex와 Claude 설치 상태를 각각 확인하므로 이전보다 엄격하게 실패할 수 있다.
- OMC는 Claude Code 전용 provider로 등록되어 Codex에서는 `unsupported`다.
- 외부 provider는 각 호스트에 별도로 설치하고 인증한 뒤 새 세션에서 활성화해야 한다.

## 검증

```bash
npm ci
npm run verify
claude plugin validate --strict .
claude plugin validate --strict plugins/bass
```

`npm run verify`는 typecheck, 168개 테스트, build, package tarball smoke, plugin 정적 검사와 performance budget을 실행한다. GitHub Actions는 Ubuntu, macOS, Windows에서 같은 package와 plugin 계약을 검사한다.

검증 범위에는 다음이 포함된다.

- 동일 fixture의 Codex·Claude `ExecutionPlan`과 fingerprint 일치
- 호스트별 provider 설치·활성 상태 분리
- capability claim 재사용, 미완료 호출 차단과 새 attempt 재시도
- `setup`과 `upgrade --apply` 반복 실행의 no-op
- Codex JSON hook과 Claude plain-text hook의 의미 일치
- 결정적인 HTML report 생성
- 설치 package의 CLI, plugin manifest, skills와 hooks 포함 여부

## 알려진 경계

- 외부 plugin 설치, 인증과 세션 활성화는 BASS가 대신하지 않는다.
- Codex IDE extension은 현재 plugin 설치 릴리스 매트릭스에 포함하지 않는다.
- Cursor shim은 유지하지만 Codex–Claude 동등성 보증에는 포함하지 않는다.
- 0.5.0은 별도 orchestrator, MCP server, 상태 데이터베이스, web console이나 TUI를 추가하지 않는다.
- BASS task, acceptance, gate, event, Run Record가 계속 최종 권위다.
