# BASS 0.1.1 — NAN Edition 설치·운영 매뉴얼

이 문서는 NAN 2026 프로젝트에 BASS를 설치하고 팀에서 운영하는 방법만 다룬다.
시스템 구조, 설계 원칙, 점수 모델과 방법론은
[NAN Edition 설계 설명서](docs/nan2026.md)에 별도로 정리되어 있다.

## 지원 범위

- macOS
- 온라인 npm 설치
- Node.js 20 이상, Node.js 24 LTS 권장
- Web, Android/iOS용 Web+Capacitor, Unity 프로젝트
- BASS package와 CLI 버전 `0.1.1`

Node.js, npm, Homebrew, Unity와 build module은 자동으로 설치하지 않는다.

## 1. 가장 빠른 시작

### 팀 리드: 최초 1회

```bash
cd /path/to/bass-platform
./scripts/check-prerequisites.sh
npm ci
npm run build
npm run bass -- --version

mkdir -p /path/to/game-project/tools
npm pack --pack-destination /path/to/game-project/tools

cd /path/to/game-project
test -f package.json || npm init -y
npm install --save-dev ./tools/bass-platform-0.1.1.tgz
npx --no-install bass --version
npx --no-install bass init --preset nan2026
npx --no-install bass doctor
```

출력 버전은 반드시 `0.1.1`이어야 한다. 다음 파일을 commit해 팀에 공유한다.

- `tools/bass-platform-0.1.1.tgz`
- `package.json`, `package-lock.json`
- `bass.yaml`, `nan2026.yaml`
- `nan/`, `.bass/`, agent shim
- `.github/workflows/nan2026.yml`
- `docs/submission/`, `evidence/`

`node_modules/`는 commit하지 않는다.

### 팀원: 저장소를 받은 뒤

```bash
cd /path/to/game-project
/path/to/bass-platform/scripts/check-prerequisites.sh
npm ci
npx --no-install bass --version
npx --no-install bass doctor
npx --no-install bass nan trace validate
npx --no-install bass nan protect verify
```

일반 팀원은 `init`을 다시 실행하지 않는다. 초기화와 template 충돌 해결은 팀 리드가
담당한다.

## 2. 사전 요구사항 검사

Node 없이 실행할 수 있다.

```bash
./scripts/check-prerequisites.sh
```

검사 항목:

- macOS와 CPU architecture
- Git
- Node.js 20 이상
- npm
- `nodejs.org`, `registry.npmjs.org` 연결

Node/npm이 없거나 버전이 낮으면:

1. [Node.js 24 LTS macOS installer](https://nodejs.org/en/download) 사용을 권장한다.
2. Homebrew가 이미 설치되어 있다면 `brew install node@24`를 사용할 수 있다.
3. 터미널을 다시 열고 검사기를 재실행한다.

Unity 후보까지 검사:

```bash
./scripts/check-prerequisites.sh --unity --targets web,android,ios
```

`WARN`이 나온 Unity module이나 mobile toolchain은 설치와 실제 build가 끝날 때까지
`not-verified`로 취급한다.

## 3. BASS package 배포와 설치

BASS 0.1.1은 공개 npm registry package가 아니다. 반드시 이 저장소에서 만든
tarball을 설치한다. 설치 전의 `npx bass`는 사용하지 않는다.

```bash
# BASS 저장소
npm ci
npm run build
npm run typecheck
npm test
npm run smoke:package
mkdir -p /path/to/game-project/tools
npm pack --pack-destination /path/to/game-project/tools
```

필요하면 tarball checksum을 evidence에 보관한다.

```bash
shasum -a 256 /path/to/game-project/tools/bass-platform-0.1.1.tgz
```

대회 프로젝트에 설치:

```bash
cd /path/to/game-project
test -f package.json || npm init -y
npm install --save-dev ./tools/bass-platform-0.1.1.tgz
npx --no-install bass --version
```

`npx --no-install`은 로컬에 고정된 BASS만 실행하고 registry에서 동명의 package를
가져오지 않는다.

## 4. NAN 프로젝트 초기화

프로젝트당 팀 리드가 한 번 실행한다.

```bash
npx --no-install bass init --preset nan2026
npx --no-install bass doctor
```

주요 생성 파일:

```text
bass.yaml
nan2026.yaml
nan/AGENT_WORKFLOW.md
nan/concepts/CON-001.yaml
nan/trace.yaml
nan/gates.yaml
nan/acceptance.yaml
nan/team.yaml
.bass/nan2026-manifest.json
.bass/nan2026/protection-lock.json
.github/workflows/nan2026.yml
docs/submission/
evidence/
```

NAN preset에서는 `--force`를 사용하지 않는다. 기존 파일과 충돌하면 사용자 파일을
보존하고 `conflict (preserved)`로 중단한다.

## 5. 세션 시작 절차

```bash
npx --no-install bass doctor
npx --no-install bass nan trace validate
npx --no-install bass nan protect verify
```

새로운 승인 기준으로 세션을 시작할 때만 팀 리드가 protection baseline을 갱신한다.

```bash
npx --no-install bass nan session lock
```

변경된 gate나 acceptance 파일을 검토하지 않은 채 `session lock`을 다시 실행해서는
안 된다.

## 6. Concept 작성과 승인

`nan/concepts/CON-001.yaml`을 작성하고 최종 승인자를 `approvedBy`에 기록한다.

```bash
npx --no-install bass nan concept gate CON-001
```

실패한 hard gate가 있거나 사람 승인이 없으면 runtime 선택으로 진행하지 않는다.
평가 기준은 [설계 설명서](docs/nan2026.md#concept-decision-harness)를 참고한다.

## 7. Runtime 추천·인증·적용

```bash
npx --no-install bass nan runtime list
npx --no-install bass nan runtime recommend --concept CON-001
```

### Web 또는 Web+Android

```bash
npx --no-install bass nan runtime doctor \
  --runtime pixi-web \
  --targets web,android

npx --no-install bass nan runtime certify pixi-web --targets web

npx --no-install bass nan runtime apply pixi-web \
  --targets web,android \
  --dest game \
  --install
```

web 인증만으로 Android build가 인증되지는 않는다. Android는 Android Studio,
Android SDK와 JDK를 준비하고 native build evidence가 생길 때까지
`not-verified`로 남는다.

### Unity

```bash
/path/to/bass-platform/scripts/check-prerequisites.sh \
  --unity \
  --targets web,android

npx --no-install bass nan runtime doctor \
  --runtime unity \
  --targets web,android

npx --no-install bass nan runtime certify unity \
  --targets web,android

npx --no-install bass nan runtime apply unity \
  --targets web,android \
  --dest game
```

Unity module이 없어 인증되지 않는 경우 module을 설치하거나 팀 리드가 위험을
명시적으로 승인해야 한다.

```bash
npx --no-install bass nan runtime apply unity \
  --targets web \
  --dest game \
  --approve-risk team-lead \
  --reason "WebGL module installation scheduled before T+0"
```

위험 승인은 실제 build 성공을 대신하지 않는다.

## 8. Web·모바일 build

```bash
cd game
npm run build

# Android 최초 1회
npx cap add android
npx cap sync android
```

Android Studio에서 native build를 완료한 뒤 프로젝트 루트로 돌아온다.

```bash
cd ..
npx --no-install bass nan runtime verify pixi-web \
  --targets web,android \
  --dest game
```

BASS가 실행한 web build만 자동으로 `pass`가 된다. Android/iOS native build는
관련 evidence가 기록되기 전까지 `not-verified`다.

## 9. Unity 협업과 build

- 하나의 Scene이나 Prefab은 한 명만 편집한다.
- 작업 시작 전에 `nan/team.yaml`의 파일 소유권을 확인한다.
- 기능별 additive Scene과 feature-owned Prefab 폴더를 우선한다.
- 공용 Scene 변경은 소유권을 공지하고 짧은 commit으로 반영한다.
- merge 후 Unity Editor에서 Scene을 열고 play/build를 다시 검증한다.

Unity build log, 실행 화면과 playtest 결과를 `evidence/`에 저장한다. 현재 adapter는
프로젝트별 Unity batch build를 임의로 추측하지 않으므로 자동 실행하지 않은 target은
`not-verified`다.

## 10. 에이전트 공통 사용법

Codex, Cursor, Claude는 같은 project shim과 `nan/AGENT_WORKFLOW.md`를 사용한다.

```bash
npx --no-install bass task new NAN-001 --title "T+6 vertical slice"
npx --no-install bass task validate NAN-001
npx --no-install bass gate pre-task NAN-001

npx --no-install bass compose --role planner --task NAN-001
npx --no-install bass compose --role worker --task NAN-001
npx --no-install bass compose --critic implementation --task NAN-001
```

실패를 기록:

```bash
npx --no-install bass nan attempt record NAN-001 --outcome fail
```

연속 실패 2회는 `BLOCKED`, 네 번째 실패한 재작업은 `NEEDS_HUMAN`이다.

## 11. 제출 evidence 생성

AI 사용, 사람 수정·승인, 변경 파일, 테스트, 플레이테스트, commit, build와
라이선스를 `docs/submission/ai-use-log.yaml` 및 `evidence/`에 기록한다.

```bash
npx --no-install bass nan trace validate
npx --no-install bass nan evidence report
npx --no-install bass nan protect verify
```

같은 evidence 입력은 같은 `evidence/report.json` checksum을 생성한다.

## 12. 세션 종료 체크리스트

```bash
npx --no-install bass task validate
npx --no-install bass nan trace validate
npx --no-install bass nan evidence report
npx --no-install bass nan protect verify
```

- 완료했다고 주장한 target의 build evidence가 있는가?
- `not-verified` target을 성공으로 표기하지 않았는가?
- 수용한 critic finding을 회귀 테스트로 고정했는가?
- AI 도구와 외부 asset/library의 라이선스를 기록했는가?
- T+6, T+12, T+18, T+30, T+36, T+42 gate 상태를 갱신했는가?

## 13. 오류 복구

| 증상 | 원인 | 조치 |
|---|---|---|
| `node: command not found` | Node.js 미설치 | Node.js 24 LTS 설치, 터미널 재시작, prerequisite 재실행 |
| Node.js 20 미만 | 지원 버전 미달 | Node.js 20 이상으로 갱신 |
| `could not determine executable` | BASS package 미설치 | tarball을 설치한 뒤 `npx --no-install bass` 사용 |
| BASS version mismatch | `bass.yaml`과 설치 package 버전 불일치 | package와 `bass.yaml`을 같은 버전으로 맞추고 변경 내용 검토 |
| `conflict (preserved)` | 관리 파일을 사람이 수정함 | 덮어쓰지 말고 diff를 검토해 수동 병합 |
| runtime `not-verified` | module/SDK/build evidence 없음 | doctor 결과의 도구를 준비하고 실제 build 실행 |
| `protect verify` 실패 | 보호 파일이 lock 이후 변경됨 | 미승인 변경은 복원, 승인된 변경은 검토 후 팀 리드가 re-lock |
| `trace validate` 실패 | dead link 또는 orphan | 누락된 ID/연결을 `nan/trace.yaml`에 추가 |
| npm cache 권한 오류 | 사용자 npm cache 소유권 이상 | 별도 cache 사용 또는 관리자와 권한 복구 |

별도 cache로 일시 실행:

```bash
npm ci --cache /tmp/bass-npm-cache
```

## 14. 재실행과 업그레이드

- `runtime apply`와 `evidence report`는 같은 입력으로 안전하게 재실행할 수 있다.
- 사용자가 수정한 관리 파일은 자동으로 덮어쓰지 않는다.
- 일반 팀원은 `init`이나 `session lock`을 반복 실행하지 않는다.
- BASS upgrade는 새 tarball, `package-lock.json`, `bass.yaml`과 변경 내용을 함께
  검토한다.
- platform build를 실행하지 않았다면 상태를 `not-verified`로 유지한다.

## Harness 개발자 검증

BASS 자체를 수정하는 사람만 실행한다.

```bash
npm ci
npm run typecheck
npm run check:boundaries
npm test
npm run build
npm run smoke:nan
npm run smoke:package
```

구조와 설계 근거는 [NAN Edition 설계 설명서](docs/nan2026.md), 기존 공통 구조는
[BASS architecture](docs/architecture.md)를 참고한다.
