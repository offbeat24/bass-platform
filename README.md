# BASS 0.1.0 설치·운영 매뉴얼

BASS를 설치하고 Codex, Cursor, Claude가 같은 task·gate·검증 기준으로 일하게 하는
운영 절차를 설명한다. 목적과 설계는 [Vision](docs/vision.md),
[Architecture](docs/architecture.md), [Principles](docs/principles.md)에 별도로
정리되어 있다.

## 지원 환경

- Node.js 20 이상
- npm과 Git
- macOS 또는 일반 Node.js 개발 환경
- BASS package와 프로젝트 설정 버전 `0.1.0`

BASS는 LLM을 직접 호출하거나 시스템 package를 자동 설치하지 않는다.

## 1. 가장 빠른 시작

### BASS package 담당자: 최초 1회

```bash
cd /path/to/bass-platform
npm ci
npm run typecheck
npm test
npm run build
npm run smoke:package

mkdir -p /path/to/project/tools
npm pack --pack-destination /path/to/project/tools
```

### 프로젝트 담당자: 최초 1회

```bash
cd /path/to/project
test -f package.json || npm init -y
npm install --save-dev ./tools/bass-platform-0.1.0.tgz

npx --no-install bass --version
npx --no-install bass init \
  --name my-project \
  --profiles common,web \
  --design
npx --no-install bass doctor
```

출력 버전은 반드시 `0.1.0`이어야 한다. 다음 파일을 commit해 팀에 공유한다.

- `tools/bass-platform-0.1.0.tgz`
- `package.json`, `package-lock.json`
- `bass.yaml`
- `AGENTS.md`, `.cursor/rules/bass.mdc`, `CLAUDE.md`
- `tasks/`, `records/`, `critiques/`, `docs/decisions/`
- UI 프로젝트라면 `DESIGN.md`

`node_modules/`는 commit하지 않는다.

### 팀원: 저장소를 받은 뒤

```bash
cd /path/to/project
npm ci
npx --no-install bass --version
npx --no-install bass doctor
npx --no-install bass config explain
```

일반 팀원은 `bass init`을 다시 실행하지 않는다. 초기화와 shim 충돌 해결은 프로젝트
담당자가 수행한다.

## 2. Package 배포와 설치

BASS 0.1.0은 공개 npm registry package가 아니며 `private` package다. 반드시 이
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
npm install --save-dev ./tools/bass-platform-0.1.0.tgz
npx --no-install bass --version
```

`npx --no-install`은 로컬 프로젝트에 설치된 BASS만 실행하고 registry에서 동명의
package를 가져오지 않는다.

필요하면 배포 artifact checksum을 기록한다.

```bash
shasum -a 256 tools/bass-platform-0.1.0.tgz
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
diff와 백업 없이 사용하지 않는다.

## 4. 매 세션 시작

```bash
npx --no-install bass --version
npx --no-install bass doctor
npx --no-install bass config explain
npx --no-install bass task validate
```

다음을 확인한다.

- 설치된 CLI와 `bass.yaml`의 version이 같은가?
- Codex/Cursor/Claude shim이 존재하고 과도하게 비대해지지 않았는가?
- 활성 profile과 override 출처가 예상과 같은가?
- 진행할 task의 필수 섹션이 채워졌는가?

## 5. Task 생성과 준비

```bash
npx --no-install bass task new PROJ-001 \
  --title "로그인 오류 상태 개선"
```

생성된 `tasks/PROJ-001.md`에서 다음을 작성한다.

- Problem
- What we are shipping
- What we are not shipping
- Acceptance criteria
- 위험도와 승인 사유
- 검증 계획

작업 상태를 `READY`로 바꾸기 전에 필수 섹션을 채우고 검증한다.

```bash
npx --no-install bass task validate PROJ-001
npx --no-install bass route PROJ-001 --role worker
npx --no-install bass gate pre-task PROJ-001
```

`pre-task`가 실패하거나 인간 승인이 필요하면 구현을 시작하지 않는다.

## 6. 에이전트 지침 조합

Codex, Cursor, Claude shim은 규칙 전문을 복사하지 않고 같은 BASS 원천을 참조한다.

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

## 9. 완료와 handoff

검증 결과와 변경 내역을 `records/PROJ-001.json`에 기록한 뒤 완료 gate를 실행한다.

```bash
npx --no-install bass evaluate
npx --no-install bass gate pre-complete PROJ-001
```

완료 전에 확인한다.

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
| `pre-task` 실패 | task 미완성 또는 승인 누락 | 필수 섹션과 human approval 보완 |
| `pre-complete` 실패 | run record 또는 완료 조건 누락 | `records/<TASK>.json`과 evaluator 결과 확인 |
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
```

## 설계 문서

- [Vision](docs/vision.md) — BASS의 목적과 범위
- [Architecture](docs/architecture.md) — 구성 요소와 데이터 흐름
- [Principles](docs/principles.md) — 운영·설계 원칙
- [Workflows](docs/workflows.md) — 상태 머신과 gate
- [Configuration](docs/configuration.md) — 설정 계층과 override
- [Project profiles](docs/project-profiles.md) — profile 선택
- [Model routing](docs/model-routing.md) — alias와 모델 선택
- [Evaluation](docs/evaluation.md) — evaluator level
- [Security](docs/security.md) — 권한과 위험 제어
- [Migration from COL](docs/migration-from-COL.md) — 기존 harness 이행
