# BASS 0.8.0 — 승인된 시간 예산 재개와 로컬 관찰

BASS 0.8.0은 0.7.0과 호환되는 기능 릴리스다. 현재 프로젝트의 진행 상황을 로컬에서 관찰하고, 시간 예산이 끝난 작업은 사람의 승인과 append-only 이력을 거쳐 제한적으로 재개할 수 있다.

## 주요 변경

- **로컬 실행 관찰.** `bass observe`가 `127.0.0.1`에 읽기 전용 페이지를 열어 작업 상태, 예산, 근거와 BASS 이벤트를 보여준다. 로컬 Codex·Claude 도구 이벤트도 함께 표시하며, 작업 카드를 선택하면 해당 작업의 순서 있는 과정을 확인할 수 있다.
- **도구 미리보기의 제한.** 관찰 hook은 길이를 제한하고 비밀값을 가린 짧은 입력·출력 미리보기만 메모리에 보관한다. 대화와 모델 추론은 파일에 저장하지 않으며 Codex hosted 도구는 로컬 hook에서 관찰되지 않는다.
- **승인된 시간 재개.** `bass task resume TASK-001 --approved-by user --reason "Continue after timeout"`은 마지막 차단 사유가 정확히 `loop time budget exhausted`일 때만 허용된다. 열린 시도를 먼저 닫아야 한다. 재개 표시는 이벤트 로그에 추가되고 시간 기준만 갱신한다. 시도·턴·무진전·반복 실패 한도와 완료 게이트는 누적 유지된다.
- **불확실한 명세 판단의 사람 검토.** 선택형 TypeSafe 명세 판단은 Noul 점수가 0.8 이상이면 통과, 0.2 이하이면 문제, 그 사이면 불확실로 분류해 자동 통과시키지 않는다.

## 호환성과 설치

TypeSafe 판단은 계속 기본값이 꺼져 있다. 활성화한 live 요청에는 별도의 사람 승인이 필요하고 제공자 사용 비용이 발생한다. 기존의 결정적 검사와 최종 사람 승인은 그대로 적용된다.

```bash
npm install -g @offbeat24/bass@0.8.0
```

---

# BASS 0.7.0 — 작업 계약과 검증 기준 개선

BASS 0.7.0은 `v0.6.0` 이후의 작업 계약·모델 라우팅·material UI 검증 변경을 묶는다.

## 주요 변경

- **작업 계약을 위험도와 실행 깊이에 맞춘다.** 정책 승인이 필요하지 않고, 삭제·릴리스가 아니며, 변경 표면이 2개 이하인 저위험 Fast 작업은 Problem, 제공 범위, 수락 기준, 검증을 우선 작성한다. 필요한 경우에만 제외 범위·문맥·작업별 롤백 설명을 추가한다. Standard/Hardened 및 정책 승인이 필요한 작업은 전체 계약을 유지한다. 구현 작업은 literal `Allowed scope` 경로를 계속 요구한다.
- **병렬 실행과 모델 라우팅 권고를 갱신한다.** 독립 작업과 소유 경로가 있는 Standard/Hardened 계획은 사용 가능한 병렬 실행을 고려한다. 기본 alias는 GPT-6 Astra/Sol/Luna 계열을 사용하며, fast-reliable은 Luna와 `max` reasoning effort를 권고한다. 설정된 reasoning effort도 라우팅 결과에 함께 기록한다.
- **material UI의 콘솔 오류를 변경 전후 비교한다.** 렌더링·viewport·스크린샷 근거는 계속 필요하다. 오류가 남으면 동일 조건의 변경 전후 캡처, 비밀값을 제거해 정규화한 SHA-256 서명(발생 건마다 하나), evidence manifest 경로를 기록한다. 기준선에 있던 오류만 같은 횟수 이하로 남으면 경고로 리뷰를 진행할 수 있고, 새 오류·증가·불완전한 비교 근거는 게이트 실패다.

## 호환성과 적용

- 콘솔 오류가 0인 기존 Run Record는 `console_errors: 0`으로 계속 통과한다. Run Record 스키마에 새 비교 필드는 선택 사항이지만, material UI 완료 시 오류가 남아 있으면 변경 전후 비교 근거가 필요하다.
- 새 설정이나 외부 서비스는 필요하지 않다. 모델 실행은 계속 호스트가 담당하며, BASS는 alias와 reasoning effort를 권고한다.

## 검증 상태

`npm run verify`와 plugin 검증, Ubuntu·macOS·Windows 및 GitGuardian CI가 통과했다. [GitHub Release v0.7.0](https://github.com/offbeat24/bass-platform/releases/tag/v0.7.0)과 이에 연결된 GitHub Packages 배포도 완료됐다.

---

# BASS 0.6.0 — 작업 명세와 완료 근거를 함께 점검

BASS 0.6.0은 TypeSafe Jev를 이용한 선택형 의미 판단을 추가한다. 활성화하면 작업 시작 전에 명세의 모순과 검증 누락을 찾고, 작업에 필요한 문서 섹션을 추천하며, 리뷰 전에 완료 주장과 텍스트 근거를 대조한다. 판단 결과는 BASS 게이트에 반영된다. 기존 필수 검사와 사람의 최종 승인은 그대로 적용된다.

## 주요 변경

- `bass semantic prepare <task-id>`가 수락 기준의 관찰 가능성, 제공·제외 범위의 충돌, 검증 계획의 누락을 점검한다. 관련 문서 후보에서 최대 5개 섹션을 추가 문맥으로 고르며, 명시 문맥과 기존 문자 예산을 우선한다.
- `bass semantic verify <task-id>`가 수락 기준별 완료 주장과 근거 파일의 인용 부분을 대조한다. 근거 부족·모순·불확실한 판단은 리뷰 진입을 보류한다. `report --json`으로 판단·출처·비용을 확인하고, `resolve`로 특정 오탐에 대한 사람의 판단을 기록할 수 있다.
- 동일한 입력의 판단을 재사용하고, 입력·문서·근거가 바뀌면 오래된 결과와 해제 기록을 거부한다. Codex와 Claude는 같은 프로젝트에 저장된 판단을 사용한다.
- BASS-055의 조건부 지침 라우팅을 포함한다. 프로젝트와 작업에 관련된 지침만 전달하며, 필요한 필수 문맥은 유지한다.

## 적용과 호환성

기본 설정은 `semantic.mode: off`다. 기존 프로젝트는 TypeSafe API 키나 추가 비용 없이 동작한다. 사용하려면 `bass.yaml`에서 `semantic.mode: enforce`로 바꾸고 실행 환경에 `TYPESAFE_API_KEY`를 설정한다. 활성화된 작업의 판단에는 API 비용이 발생하며, 프로젝트별 호출 예산을 설정할 수 있다. `prepare`와 `verify`의 `--dry-run`은 전송 대상과 호출 상한을 먼저 보여준다.

0.5.x 프로젝트는 `bass upgrade --check`로 변경을 확인한 뒤 `bass upgrade --apply`로 갱신할 수 있다. 이전 작업과 Run Record는 계속 읽으며, 의미 판단을 활성화한 새 작업은 Run Record v3에 판단 해시와 사람의 해제 기록을 연결한다. 자세한 설정과 근거 목록 형식은 [TypeSafe 사용 안내](docs/semantic.md)를 참고한다.

이 검증 상태는 2026-09-20 출시 후보 초안 당시의 기록이다. 이후 BASS-056에서 2026-10-06에 영어·한국어 synthetic 120개 사례 평가를 완료했다. 이 합성 결과는 실제 제품 사용 데이터나 운영 telemetry를 뜻하지 않는다.

---

# BASS 0.5.1 — 필요한 지침만 조합하는 패치

BASS 0.5.1은 task의 역할과 변경 표면에 맞춰 자동 context를 선택한다. 명시한
`Relevant context`는 계속 우선하며, 신호가 모호한 작업은 기존의 보수적인
PRODUCT/TECH fallback을 유지한다.

## 주요 변경

- 문서 전용 작업과 evaluator는 관련 없는 PRODUCT/TECH 자동 context를 생략한다.
- 코드 작업은 TECH를, UI 작업은 필요한 DESIGN context를 계속 포함한다.
- `bass-work` skill은 scope, provider idempotency, evidence, 최종 승인 경계를 유지하면서
  agent guide와 중복되던 절차를 줄였다.
- performance benchmark는 정적 지침 바이트와 실제 composed prompt 문자를 구분해
  동일 fixture에서 재현할 수 있다.
- package smoke fixture가 현재 pre-task 계약에 맞게 필수 task 내용을 채운다.

## 측정 결과

동일한 고정 fixture 기준으로 `bass-work`는 2,577바이트에서 1,517바이트로
41.1% 줄었다. 문서 evaluator의 composed prompt는 4,526자에서 3,618자로
20.1%, 코드 worker는 4,810자에서 4,480자로 6.9% 줄었다. UI와 server 시나리오는
필요한 context를 보존해 변화가 없다.

이 수치는 저장소의 결정적 benchmark 결과다. 실제 Codex/Claude token 사용량,
cache hit, 비용 또는 live-model 품질 개선을 뜻하지 않는다.

## 설치와 업그레이드

```bash
npm install -g @offbeat24/bass@0.5.1
bass upgrade --check
bass upgrade --apply
```

0.5.0의 실행 계약과 provider 동작은 그대로 호환된다.

---

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
