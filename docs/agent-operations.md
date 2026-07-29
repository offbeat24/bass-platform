# AI agent operations

## 제품 계약

BASS의 사용자 인터페이스는 Codex, Cursor, Claude 등과의 자연어 대화다.
CLI는 에이전트가 작업을 재현 가능하고 멱등하게 수행하기 위한 내부 실행 인터페이스다.

사람에게 CLI 명령, task frontmatter, 상태 전이, approval JSON, run record 작성을
요구하지 않는다. 에이전트는 내부 기록을 자동 관리하고 결과·근거·사람이 결정할 사항만
대화로 전달한다.

## Clone 후 AI가 제안할 경로

AI 도구는 이 저장소를 연 사람에게 먼저 다음 맥락을 설명한다.

- 이 폴더는 BASS 런타임 자체의 소스 저장소다.
- BASS 자체를 수정하려면 이 폴더에서 개발 검증을 수행한다.
- 다른 프로젝트를 BASS로 관리하려면 이 저장소를 package 원천으로 사용해 대상
  프로젝트에 연결한다.
- 기존 프로젝트는 보존을 위해 `init`, 빈 신규 폴더는 `create`를 사용한다.

AI는 저장소와 사용자 요청으로 경로를 판단할 수 있으면 질문하지 않는다. 대상 프로젝트
경로처럼 반드시 필요한 정보가 없을 때만 짧게 확인한다.

### BASS 자체 개발

AI가 내부적으로 실행한다.

```bash
npm ci
npm run build
npm run bass -- agent guide
npm run typecheck
npm test
npm run smoke:package
```

모든 검사를 매번 기계적으로 실행하지 않는다. 변경 위험에 맞는 검사를 우선 실행하고,
배포 경계나 package 동작을 바꾼 경우 smoke test까지 실행한다.

### 기존 프로젝트 연결

AI는 변경 파일을 설명한 뒤 대상 프로젝트에서 package를 설치하고 초기화한다.

```bash
# BASS 저장소에서
npm ci
npm run build
npm pack --pack-destination /path/to/project/tools

# 대상 프로젝트에서
npm install --save-dev ./tools/bass-platform-<version>.tgz
npx --no-install bass init --name <project> --profiles common,web --design
npx --no-install bass agent guide
```

서버나 CLI 프로젝트에는 UI 프로필과 `--design`을 강제하지 않는다. 기존 `AGENTS.md`,
`CLAUDE.md`, Cursor rule, `DESIGN.md`가 있으면 덮어쓰기 전에 내용을 보존하고 통합
방식을 제안한다.

### 빈 신규 프로젝트

`bass create`는 빈 디렉터리에만 사용한다. 이 명령은 제품 코드를 생성하는 도구가 아니라
BASS package와 에이전트 실행 계약을 연결하는 bootstrap이다.

NAN 2026 대회 프로젝트에는 사용자의 대회 맥락을 확인한 뒤 명시적으로
`--preset nan2026`을 추가한다. 이 preset은 concept 비교, runtime 선택, trace,
evidence, session protection을 활성화한다. 일반 프로젝트의 기본 preset은 `none`이다.

## 자연어 요청 처리

1. 사용자의 목적과 완료 상태를 해석한다.
2. 저장소에서 확인할 수 있는 사실을 직접 조사한다.
3. 가장 작은 유용한 변경을 task로 내부 기록한다.
4. `bass agent guide <task-id>`와 `bass route`로 실행 깊이와 정책을 확인한다.
5. 위험 승인이 없으면 상태를 내부적으로 진행하며 구현한다.
6. 평가기, 관련 critic, UI라면 실제 렌더링을 검증한다.
7. `bass gate pre-review`를 통과한 결과와 근거를 사람에게 한 번에 보여준다.
8. 사람이 명시적으로 승인한 경우에만 최종 승인을 기록하고 `bass task finalize`를 실행한다.
9. 피드백이 있으면 같은 task의 첫 미완료 단계부터 재개한다.

## 사람과 AI의 결정 경계

AI가 판단한다:

- 저장소 사실, 영향 파일, 기존 패턴
- 되돌리기 쉬운 구현 세부
- 테스트·검증·critic 선택
- 실패 원인 조사와 안전한 재시도
- 내부 상태와 기록 관리

사람이 판단한다:

- 제품 목적과 우선순위
- 충돌하는 요구사항
- 브랜드 Voice와 핵심 디자인 방향
- 인증·권한·데이터·비용·배포 위험 수용
- 테스트로 판정할 수 없는 UX
- 최종 결과가 의도에 맞는지

승인은 단계가 아니라 이러한 의미 있는 결정에만 연결한다.

## 멱등성 계약

- 같은 상태로 전이하면 성공한 no-op이다.
- 같은 위험 결정과 최종 승인을 다시 기록하면 중복 생성하지 않는다.
- 이미 완료된 task를 다시 finalize하면 성공한 no-op이다.
- 승인 기록은 덮어쓰지 않는다. 결정이 바뀌면 새 근거와 명시적 변경 이력을 남긴다.
- 설치, 외부 서비스 생성, 배포 같은 부작용은 실행 전 현재 상태를 확인한다.
- 재시도는 전체 흐름이 아니라 첫 실패 또는 미완료 단계부터 수행한다.

## UI 작업

`DESIGN.md`가 빈 템플릿이면 유효한 디자인 명세로 간주하지 않는다. 기존 코드와 제품을
조사해 `CONFIRMED`, `INCONSISTENT`, `MISSING`, `PROPOSED`를 구분한다.

일상적인 UI 일관성 수정은 기존 방향 안에서 자율적으로 수행한다. 핵심 디자인 방향,
브랜드 Voice, 주요 탐색 구조를 바꿔야 할 때만 사람에게 선택지와 권장안을 제시한다.

완료 전 가능한 범위에서 데스크톱·모바일, 주요 상호작용 상태, 접근성, 콘솔 오류와 실제
렌더링을 확인한다. 렌더링하지 못한 결과를 시각적으로 검증했다고 표현하지 않는다.
