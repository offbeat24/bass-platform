# BASS 0.5.0 — Codex–Claude Single-Compatible Harness

BASS 0.5.0은 Codex Desktop/CLI와 Claude Code가 하나의 BASS Core, plugin package, skills, hooks, launcher를 사용하도록 실행 계약을 통합한다. 두 호스트의 문장과 패치가 같을 필요는 없지만, 같은 BASS 입력에서는 계획 fingerprint, capability 호출, scope lock, gate, evidence 요구사항이 같아야 한다.

## 주요 변경

- `ExecutionPlan`에 `contractVersion`과 결정적 SHA-256 `planFingerprint`를 추가했다.
- 하나의 provider catalog가 builtin/external 구분, 호스트별 plugin ID·command·MCP tool, 인증과 재시작 요구를 관리한다.
- `bass doctor --capabilities --host codex|claude|all`이 호스트별 설치·활성·인증·지원 상태를 분리해 검사한다.
- `.bass/events.jsonl` schema v2와 `bass capability claim|complete`로 외부 호출을 멱등하게 기록한다.
- Run Record v2가 `execution_contract`와 `capability_invocations`를 보존하고 완료 gate가 현재 계획·이벤트·evidence와 대조한다.
- 여섯 BASS skill이 host 전용 경로나 bare `bass` 대신 하나의 `bass-launcher.cjs`를 사용한다.
- launcher는 `process.execPath + npm_execpath`로 npm을 실행해 Windows, macOS, Linux에서 같은 경로를 사용한다.
- `setup`, `upgrade --apply`, managed block, shim, scope warning, HTML report의 반복 실행을 멱등하게 유지한다.

## 지원 범위

- 공식 plugin 호스트: Codex Desktop/CLI, Claude Code
- 저장소 지침만 지원: Codex IDE extension, Cursor shim
- CLI 요구사항: Node.js 20 이상
- 패키지: `@offbeat24/bass@0.5.0`
- plugin: `bass@0.5.0`

BASS는 외부 provider를 자동 설치하거나 다른 도구로 대체하지 않는다. Codex와 Claude에 필요한 plugin을 각각 설치하고 새 세션에서 활성 상태를 확인해야 한다.

## 신규 설치

### 1. GitHub Packages 인증

PAT classic에 `read:packages` 권한을 부여한 뒤 로그인한다.

```bash
npm login --scope=@offbeat24 --auth-type=legacy --registry=https://npm.pkg.github.com
```

CLI 전역 설치는 선택 사항이다. BASS plugin launcher는 연결된 저장소의 `bass.yaml` 버전을 사용한다.

```bash
npm install -g @offbeat24/bass@0.5.0
bass --version
```

### 2. Codex plugin

```bash
codex plugin marketplace add offbeat24/bass-platform
codex plugin add bass@offbeat24-bass-platform
codex plugin list
```

Codex Desktop의 Plugins Directory에서도 `bass`를 설치할 수 있다. 설치나 업데이트 후 새 세션을 시작하고 BASS hook 신뢰를 승인한다.

### 3. Claude Code plugin

Claude Code 안에서 실행한다.

```text
/plugin marketplace add offbeat24/bass-platform
/plugin install bass@offbeat24-bass-platform
```

설치 후 새 세션을 시작한다. Codex는 manifest에서 공용 hook을 명시하고 Claude Code는 같은 `hooks/hooks.json`을 표준 경로에서 자동 발견한다.

## 저장소 연결

신규 또는 아직 BASS가 없는 저장소:

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

`--check`는 읽기 전용이다. `--apply`는 BASS managed block과 설정만 갱신하고 기존 PRODUCT·TECH·DESIGN 문서, task, Run Record를 덮어쓰지 않는다. 같은 명령을 다시 실행하면 변경 없는 no-op이어야 한다.

현재 호스트를 검사한다.

```bash
bass doctor --capabilities --host codex
# 또는
bass doctor --capabilities --host claude
```

Codex와 Claude 양쪽을 릴리스 대상으로 확인할 때만 다음을 사용한다.

```bash
bass doctor --capabilities --host all
```

`missing`, `inactive`, `unauthenticated`, `unsupported` 중 하나라도 있으면 외부 provider 호출을 진행하지 않는다.

## 개발 시작

사용자는 자연어로 목표, 완료 조건, 범위를 전달하면 된다.

```text
이 저장소에 BASS를 연결하고, 로그인 오류를 재현한 뒤 허용 범위 안에서 수정하고 검증해줘.
```

에이전트의 표준 내부 흐름은 다음과 같다.

```bash
bass agent guide TASK-001 --json
bass task graph --json
bass gate pre-task TASK-001
bass task transition TASK-001 ACTIVE
bass task attempt start TASK-001 --json

# 구현 후 영향받은 evaluator만 실행
bass evaluate --task TASK-001
bass task attempt finish TASK-001 \
  --result pass --summary "affected checks passed" --turns 3

bass gate pre-review TASK-001
bass task transition TASK-001 REVIEW
bass approval final TASK-001 --approver user
bass task finalize TASK-001
```

Fast, Standard, Hardened의 기본 상한은 각각 1, 2, 3 attempts다. 같은 실패가 새 evidence 없이 반복되거나 시간·turn·no-progress 예산을 넘으면 BASS가 `NEEDS_DECISION` 또는 `NEEDS_EXPERT`로 중단한다.

## 외부 capability 호출

`execution_plan.capabilityCalls`에 포함된 external call만 실행할 수 있다.

```bash
bass capability claim TASK-001 ponytail:full --host codex --json
```

- `run`: 현재 host plugin을 한 번 호출한다.
- `reuse`: 완료된 동일 호출을 재사용한다.
- `uncertain`: 시작 기록만 있어 부작용 여부를 모르므로 재호출하지 않고 중단한다.

호출 후 결과를 기록한다.

```bash
bass capability complete TASK-001 ponytail:full \
  --host codex \
  --status pass \
  --summary "simplicity review accepted" \
  --evidence .bass/evidence/TASK-001/ponytail.log
```

`call_id`는 `planFingerprint + taskId + attempt + capabilityCall`로 계산하며 host를 포함하지 않는다. 같은 attempt를 Codex에서 Claude로 넘겨도 중복 호출되지 않고, 새 attempt에서만 의도적인 재호출이 가능하다.

## 호환성과 마이그레이션

- event reader는 schema v1과 v2를 모두 읽는다. 새 이벤트는 v2로 기록한다.
- 기존 Run Record는 기본값을 적용해 읽는다. 새 작업은 Run Record v2를 작성한다.
- `ExecutionPlan`을 직접 소비하는 코드는 새 필수 필드 `contractVersion`, `planFingerprint`를 처리해야 한다.
- `doctor --host all`은 각 공식 호스트의 활성 상태를 독립적으로 확인하므로 이전보다 엄격하게 실패할 수 있다.
- OMC plugin은 Claude Code 전용으로 catalog에 등록되며 Codex에서는 `unsupported`다. Orca는 두 호스트 binding을 갖는다.
- Cursor shim은 유지하지만 Codex–Claude 동등성 gate에는 포함하지 않는다.

## 개발과 검증

```bash
git clone https://github.com/offbeat24/bass-platform.git
cd bass-platform
npm ci
npm run verify
claude plugin validate --strict .
claude plugin validate --strict plugins/bass
```

`npm run verify`는 typecheck, 168 tests, build, package tarball smoke, plugin 정적 검사, performance budget을 실행한다. GitHub Actions는 Ubuntu, macOS, Windows에서 package smoke와 plugin 검사를 실행한다.

Windows CI에서는 환경변수 이름의 대소문자를 구분하지 않는 특성을 고려해 launcher 테스트의 `npm_execpath`를 격리하고, scope-diff 테스트에서 필요하지 않은 Git baseline commit을 제거했다. 타임아웃을 늘리지 않고 테스트 준비 비용과 환경 의존성을 줄인 변경이며 BASS 실행 계약과 런타임 동작에는 영향을 주지 않는다.

검증된 설치 경로:

- 격리된 Codex home에서 marketplace 추가, plugin 설치·목록, 새 세션의 BASS skills 6개 발견
- 격리된 Claude config에서 marketplace 추가, plugin 설치·활성, skills 6개와 hooks 2개 inventory, strict validation

이 작업 환경의 Claude CLI는 로그인되지 않아 실제 Claude 모델 응답을 포함한 최종 host E2E는 릴리스 전 로그인된 세션에서 한 번 더 확인해야 한다.

## 릴리스 절차

1. 이 브랜치를 PR로 병합하고 `npm run verify`의 3개 OS CI를 확인한다.
2. tag `v0.5.0`으로 GitHub Release를 발행하고 이 문서 내용을 Release notes로 사용한다.
3. `release.yml`이 다시 `npm run verify`를 실행한 뒤 GitHub Packages에 `@offbeat24/bass@0.5.0`을 publish한다.
4. Release 발행과 `workflow_dispatch`를 중복 실행하지 않는다.
5. publish 후 새 임시 Codex·Claude 환경에서 plugin 설치와 `bass --version`을 재확인한다.

## 범위 밖

0.5.0은 별도 orchestrator, MCP server, 상태 데이터베이스, web console, TUI, 외부 prompt/skill 복사본을 추가하지 않는다. BASS task, acceptance, gate, event, Run Record가 계속 최종 권위다.
