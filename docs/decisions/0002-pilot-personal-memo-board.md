# ADR-0002: personal-memo-board BASS 병행 파일럿 결과

## Status

파일럿 승인 완료, 신규 작업 게이트의 제한적 BASS 전환 결정.

## Context

`/Users/okestro/croquis/deck/personal-memo-board`에는 기존 COL 하네스와 문서가
남아 있고, BASS를 `bass.yaml`과 얇은 shim으로 병행 연결했다. 이번 파일럿은
최초 범위는 COL을 BASS로 마이그레이션하거나 대체하는 작업이 아니었다. 이후 인간
결정으로 임시 작업 `TEMP-001`~`TEMP-003`을 BASS의 `tasks/`, `critiques/`,
`records/` 형식으로 실행·승인했고, 신규 작업 게이트만 BASS로 전환하기로 했다.

작업 범위는 `DESIGN.md`에 Interaction States 섹션을 추가하는 것으로 제한했다.
제품 코드와 COL의 `scripts/harness.py`, `.codex/`, `.githooks/`,
`docs-manifest.json`, `task-pack.json` 및 기존 COL 문서는 수정하지 않았다.

## Pilot result

- `bass gate pre-task TEMP-001`: PASS. READY 상태, 필수 작업 섹션, 동시 작업 수를 확인했다.
- `bass route TEMP-001 --role worker`: 저위험·기계 검증 가능 작업으로
  `fast-reliable` alias(`gpt-5.4`)를 권고했다.
- `bass evaluate --levels 1`: `typecheck` PASS.
- `bass design check`: `state-completeness-spec` PASS. 기존 하드코딩 hex 색상
  WARN은 그대로 남았다.
- Design Critic 결과 `critiques/TEMP-001/design-1.yaml`: finding 0건,
  `bass critique validate` PASS.
- `bass gate pre-complete TEMP-001`: 초회 실행은 run record, 평가, critic, 문서,
  rollback이 PASS했지만 `human_approval`이 없어 FAIL했다. 인간 승인 기록 후 재실행은
  PASS했다.
- 작업 상태는 의도대로 `HUMAN_REVIEW`이며 `DONE`으로 올리지 않았다.

## Second pilot result: material UI evidence

`TEMP-002`는 태블릿 저장 토스트의 표시 규칙을 작은 CSS 변경으로 검증했다.

- 정적 소스 조사에서는 `max-width: 1024px`의 `.saveBadge { display: none; }` 때문에
  태블릿 토스트가 사라질 것으로 예상했다.
- 구현 전 768px 브라우저 evidence는 실제 computed display가 `flex`이고 토스트가
  보인다는 사실로 최초 가설을 반박했다. 작업은 시각 복원에서 상충 CSS 예외 제거로
  즉시 축소됐다.
- 제품 변경은 `components/personal-memo-board.module.css`의 숨김 예외 4줄 제거뿐이다.
  토스트 DOM, 저장 phase, 카피, 아이콘, 위치와 크기는 바꾸지 않았다.
- 신규 evidence는 COL artifact 형식을 사용하지 않고
  `records/TEMP-002-evidence/` 아래에 desktop 1440×1000, tablet 768×1024,
  mobile 390×844 전후 화면과 browser review를 기록했다.
- typecheck와 production build는 PASS했다. Design check는 상태 완결성 PASS와 기존
  hardcoded hex WARN을 보고했다.
- 세 viewport에서 저장 완료 토스트가 보였고 tablet add action과 겹치지 않았으며,
  console warning/error는 0건, 시각 판정은 `layout-stable`이었다.
- Design Critic finding은 0건이었다.
- 초회 `pre-complete`는 인간 승인 기록만 없어 FAIL했다. 작업은
  `HUMAN_REVIEW`에 있으며 `DONE`으로 올리지 않았다.

이 파일럿은 material UI 작업에서 변경 전 browser baseline, 변경 후 동일 viewport,
console 상태, 기능 신호와 layout verdict가 실제로 유용함을 보였다. 반면 현재 BASS
run record는 렌더링 여부와 자유 형식 notes만 제공해 screenshot 경로·viewport·판정을
구조적으로 검증하지 못한다.

## Third pilot result: pointer interaction quality

`TEMP-003`은 위젯 이동·리사이즈의 낮은 프레임 같은 체감을 대상으로 했다.

- 매 `pointermove`의 React state 갱신을 animation frame당 최대 한 번으로 제한했다.
- 조작 중에는 연속 좌표를 사용하고, `pointerup` 최종 commit에서만 그리드에 스냅했다.
- 조작 중 persistence effect를 건너뛰고 최종 상태에서 저장하도록 했다.
- typecheck, production build, desktop move/resize, mobile stacked regression과 critic 검증이 통과했다.
- 인간이 결과를 직접 확인하고 TEMP-001~TEMP-003 전체를 승인했으며, 세 작업의
  `pre-complete` 게이트가 통과했다.

## COL pre-task vs BASS pre-task

아래 분류는 COL 파일의 존폐 결정이 아니라, 파일럿 이후 게이트 개념을 어떻게
다룰지에 대한 후보 판단이다.

| 검사 항목 | COL `harness.py pre-task` | BASS `gate pre-task` | 분류 | 파일럿 판단 |
|---|---|---|---|---|
| 작업 명세와 작업 ID | `task-pack.json`의 `task_id`, active exec plan 파일명·섹션을 검사 | `tasks/<ID>.md` frontmatter 스키마와 필수 섹션을 검사 | KEEP | BASS 작업 파일 하나가 범위·검증·rollback·인간 판단을 함께 담아 이번 소규모 작업에는 더 직접적이었다. |
| 시작 가능 상태와 동시 작업 제한 | active exec plan 위치와 개수로 간접 표현 | `READY` 이상 상태와 `max_active_tasks`를 명시적으로 검사 | KEEP | 명시적 상태가 병행 파일럿의 현재 위치를 설명하기 쉬웠다. |
| 미해결 가정과 사전 승인 | 별도 검사 없음 | `Assumptions` WARN과 정책 기반 `needs-human`을 검사 | KEEP | 구현 전 인간 판단을 드러내는 BASS 고유 보호장치로 유지할 가치가 있다. |
| 필수 프로젝트 문서 존재·섹션·placeholder | `docs-manifest.json`의 모든 필수 문서를 강제 | 프로파일에 `required_docs`가 있으나 현재 pre-task 게이트는 이를 검사하지 않음 | BASS로 이식 후보 | 프로파일별 최소 문서 존재 검사는 유용하다. COL 전체 문서 세트를 그대로 강제하지 말고 해당 작업의 Relevant context와 프로파일 필수 문서만 대상으로 좁혀야 한다. |
| `service.yaml` 제품·브랜딩 전체 계약과 `provider=openai` | 필수 필드, 비어 있지 않은 목록, 브랜딩 후보, provider를 강제 | 채널 중립 `bass.yaml`만 사용하며 이 계약을 검사하지 않음 | BASS에서 의도적 제외 | COL 생성 레포 전용 제품 계약과 OpenAI 고정은 범용 감독 런타임의 코어 게이트에 맞지 않는다. 프로젝트 evaluator로는 남길 수 있다. |
| `task-pack.json`의 `must_read`·`docs_required` | 고정 디자인·프롬프트 문서 목록을 모두 요구 | 작업의 `Relevant context`를 요구하지만 실제로 읽었는지는 검사하지 않음 | BASS로 이식 후보 | 고정 COL 파일 목록은 제외하되, 명시된 Relevant context의 경로 존재 여부 정도는 검사 후보이다. |
| UI 작업 유형별 디자인 선행 단계 | `ui_work_type`과 boolean 플래그, serious UI의 구조 2안·비주얼 2안 문서 섹션을 강제 | web Design Profile은 DESIGN.md와 상태 체크를 제공하지만 디자인 단계는 강제하지 않음 | BASS로 이식 후보 | `ui-foundation`·`ui-new-screen`처럼 큰 UI 작업에만 선택적으로 이식할 가치가 있다. 이번 문서 전용 작업에 적용하면 과잉이다. |
| active exec plan 파일 위치 | `docs/exec-plans/active/<ID>.kr.md` 존재를 요구 | 작업 상태와 `tasks/<ID>.md`로 대체 | BASS에서 의도적 제외 | 동일 목적의 두 번째 SoT를 만들지 않는다. 기존 exec plan은 이력·참고로 유지한다. |
| prompt-context 동기화 | 게이트 시작 시 파생 문서를 자동 재작성 | 게이트는 프로젝트 문서를 재작성하지 않고 `bass compose`가 지침을 조합 | BASS에서 의도적 제외 | 읽기 게이트가 파일을 바꾸는 부작용을 피하고 출처가 있는 런타임 조합을 유지한다. |

## COL pre-complete vs BASS pre-complete

| 검사 항목 | COL `harness.py pre-complete` | BASS `gate pre-complete` | 분류 | 파일럿 판단 |
|---|---|---|---|---|
| 시작 게이트 재검사 | pre-task 전체를 다시 실행 | task 스키마는 다시 읽지만 READY 필수 섹션·가정·승인 정책을 다시 평가하지 않음 | BASS로 이식 후보 | 작업 중 명세가 변질되지 않았는지 완료 시 다시 확인할 가치가 있다. |
| 완료 기록 | 필수 필드가 있는 `artifacts/run-reports/<ID>.json`과 task ID를 검사 | 스키마가 있는 `records/<ID>.json`을 검사 | KEEP | BASS record가 변경 이유, 평가, critic, 제한, rollback, 교훈까지 더 구조적으로 담았다. |
| 평가 결과 | run report에 `verification_results` 필드가 있는지만 검사 | 최소 1개 평가 실행과 fail/error 부재를 검사 | KEEP | 이번 파일럿에서 실제 `typecheck` PASS가 완료 근거로 연결됐다. |
| 브라우저 fidelity evidence | task-pack 플래그가 켜지면 리뷰 문서·데스크톱·모바일 evidence 경로를 강제 | 렌더링 수행 여부와 환경 기록만 강제하며 실제 evidence 경로는 검사하지 않음 | BASS로 이식 후보 | material UI 작업에 한해 Design Profile이 evidence 경로와 필수 뷰를 검사하도록 확장할 후보이다. 문서 전용 작업에는 렌더링 미수행 기록이면 충분했다. |
| build journal task marker | 모든 완료 작업에 marker 요구 | 별도 journal 없음 | BASS에서 의도적 제외 | 작업 파일과 run record가 같은 인계 목적을 담당한다. 기존 journal은 이력으로 유지한다. |
| 변경 경로별 architecture why marker | 지정된 하네스·설정 경로 변경 시 `docs/architecture/why.kr.md` marker 요구 | `docs_updated` 여부와 갱신 파일만 검사 | BASS로 이식 후보 | 위험 경로별 결정 문서 요구는 Policy Engine이나 프로젝트 규칙으로 일반화할 가치가 있다. |
| 하네스 변경 feedback marker | 하네스 경로 변경 시 retrospective marker 요구 | run record의 lessons 판단만 요구 | BASS에서 의도적 제외 | 프로젝트가 BASS 코어를 복사하지 않는 구조에서는 deck별 하네스 피드백 marker가 맞지 않는다. BASS 자체 변경의 회고는 플랫폼 저장소 정책으로 분리해야 한다. |
| critic finding | 구조화된 critic 결과를 완료 게이트가 직접 검사하지 않음 | 미해결 high/medium finding 0건을 요구 | KEEP | 스키마 검증된 0건 결과가 완료 근거에 포함됐다. 단, validator는 critic의 독립 실행 자체까지 증명하지 않는다. |
| 인간 승인 | 완료 게이트의 구조화된 승인 필드 없음 | `reviewer_required`이면 승인 기록을 요구 | KEEP | BASS 목적에 핵심이다. 다만 아래의 명령 의미·순서 문제를 먼저 결정해야 한다. |
| 미검증 항목, rollback, 문서, 교훈 | run report의 자유 형식 handoff·next actions 중심 | 각각 구조화해 PASS 또는 인간 판단으로 노출 | KEEP | 완료를 자동 선언하지 않고 남은 판단을 명시하는 데 효과가 있었다. |
| 실제 diff와 선언된 허용 범위 대조 | diff를 marker 필요 여부에만 사용 | run record의 `files_changed`를 신뢰하고 Allowed scope와 대조하지 않음 | BASS로 이식 후보 | 허용 범위 위반과 record 누락을 기계적으로 대조하는 검사가 있으면 감독성이 강화된다. |

## Document coexistence experience

### 충돌하지 않은 점

- 신규 BASS 산출물은 `tasks/`, `records/`, `critiques/`에만 생겨 기존 COL
  exec plan, run report, build journal, prompting 문서와 경로 충돌이 없었다.
- `DESIGN.md`는 이미 양쪽이 인정하는 디자인 SoT라서, 기존 코드 근거를
  `CONFIRMED` 규칙으로 추가하는 데 문서 의미 충돌이 없었다.
- `AGENTS.md`의 BASS Pilot SoT 블록이 파일럿 중 실행할 게이트를 명확히 했다.

### 불편과 누락

- COL의 현재 작업 ID는 `BOOTSTRAP-001`이고 BASS 작업 ID는 임시
  `TEMP-001`이다. COL pre-task는 `task-pack.json`과 active exec plan의 ID를
  요구하므로, 기존 COL 문서를 수정·변환하지 않고는 같은 신규 작업을 두 게이트로
  동시에 실행할 수 없다. 이번 비교는 동일 변경에 대한 게이트 구현의 정적 비교이지,
  두 게이트를 같은 ID로 모두 통과시킨 A/B 실행은 아니다.
- 프로젝트 루트에서 문서화된 `npx tsx .../main.ts` 명령을 처음 실행할 때
  `tsx`를 찾지 못해 npm이 `tsx@4.23.1`을 임시 설치한다는 경고가 나왔다.
  런타임 의존 방식과 재현 가능한 CLI 배포 방식을 별도로 확인할 필요가 있다.
- 라우터는 alias와 해석 모델을 권고하지만 BASS가 세션 모델을 선택하거나 실제 사용
  모델을 검증하지는 않는다. 이번 record도 확인할 수 없는 `actual_model`을 기록하지 않았다.
- `pre-complete`라는 이름과 문서 흐름은 인간 검토 직전 검사처럼 읽히지만, 현재
  게이트는 이미 승인된 `human_approval`을 요구한다. 요청된 순서대로 HUMAN_REVIEW
  상태에서 처음 실행했을 때 승인 누락으로 FAIL했고, 인간 승인 기록 후에는 PASS했다.
- `critique validate`는 파일 스키마와 finding 프로토콜을 검증하지만, 독립 critic이
  실제로 실행되었는지까지 증명하지 않는다.
- Design check는 문서 전용 작업에서도 저장소 전체 색상을 검사해 기존 hardcoded hex
  WARN을 함께 출력했다. 유효한 별도 작업 후보이지만 현재 작업의 완료 실패로 취급되지는 않았다.

## Out of scope finding

`bass design check`가 보고한 `app/globals.css`와 여러 component CSS의 하드코딩
hex 색상 WARN은 이번 작업 범위 밖이다. 삭제·치환하지 않았으며, 필요하면 별도 작업
후보로만 검토한다.

## Why full COL removal remains premature

1. 같은 신규 작업에 COL과 BASS 게이트를 모두 실행한 A/B 결과가 아직 없다.
   현행 COL 작업 ID와 문서를 보존한 공존 조건에서는 이를 바로 수행할 수 없었다.
2. BASS는 task/record/critic/승인 구조에서 더 명확했지만, COL의 필수 문서,
   UI 선행 단계, browser evidence, 위험 경로 marker 중 무엇을 유지할지 아직 결정되지 않았다.
3. `pre-complete`와 인간 승인 순서가 운영 문구와 실제 코드 사이에서 모호하다.
4. 모델 라우팅은 권고까지만 검증됐고 실제 세션 모델 준수 여부는 확인하지 못했다.
5. hooks의 실효성과 강제 범위, BASS CLI 배포·버전 재현성은 이번 수동 실행으로 검증되지 않았다.
6. 기존 COL 문서와 회고 이력을 BASS 형식으로 변환했을 때의 가치가 입증되지 않았고,
   일괄 변환은 이력 손상과 중복 SoT 위험이 있다.

따라서 신규 작업 게이트는 BASS로 전환하되 COL 폐기나 기존 문서 일괄 변환은
결정하지 않는다.

## Human decisions required next

1. **게이트 범위:** 신규 작업의 시작·완료 게이트만 BASS를 SoT로 유지할 것인가,
   아니면 material UI evidence와 위험 경로 문서 검사까지 선택 이식할 것인가?
2. **인간 승인 순서:** `pre-complete`를 최종 승인 전 준비 상태 검사로 만들 것인가,
   승인 후 DONE 가능 검사로 유지할 것인가? 전자라면 승인 누락은 FAIL이 아니라
   `needs-human`이어야 하고, 후자라면 명령명·워크플로 문서를 명확히 해야 한다.
3. **hooks:** 기존 COL hooks를 그대로 둘지, BASS 명령을 호출하도록 최소 변경할지,
   CI에서만 강제할지 결정해야 한다.
4. **COL 문서:** 기존 exec plans, design docs, prompting docs, run reports를 이력으로만
   보존할지, 일부를 계속 작성할지 결정해야 한다. 일괄 BASS 변환은 별도 근거가 생기기
   전에는 하지 않는다.
5. **Design Profile:** serious UI 작업의 선행 문서·desktop/mobile evidence를 BASS
   프로파일에 선택 이식할지 결정해야 한다.
6. **범위 검증:** task Allowed scope와 실제 diff, record의 `files_changed`를 대조하는
   기계 검사를 BASS 완료 게이트에 추가할지 결정해야 한다.
7. **CLI 배포:** 프로젝트별 `npx tsx` 임시 설치를 허용할지, 버전 고정된 BASS 실행
   패키지·wrapper를 제공할지 결정해야 한다.
8. **작업 ID:** `TEMP-001`은 이번 파일럿만을 위한 임의 ID다. 프로젝트 공식 네이밍
   규칙은 이번에도 결정하지 않았으며 후속 인간 결정으로 남긴다.

## Adopted scope

채택한 범위는 **전체 마이그레이션이 아니라, 신규 작업에 한해 BASS
task/record/critic 게이트를 사용하고 COL 자산은 읽기 전용 이력으로 유지하는 것**이다.
material UI 작업에는 COL 전체 문서 세트를 이식하지 말고, 최소 evidence 계약
(변경 전후 동일 viewport, 기능 신호, console 상태, layout verdict, evidence 경로)을
BASS run record에 구조화하는 후보만 검토한다. hooks 변경과 COL 문서 변환은 계속
보류한다.

이 권장안은 현재 확인된 BASS의 장점(명시적 상태, 평가 결과, critic, 승인, rollback)을
사용하면서도, 아직 검증되지 않은 COL의 디자인·evidence 보호장치를 성급하게 제거하지 않는다.

## Decision

- 2026-07-22 인간 승인으로 신규 작업 게이트의 BASS 전환을 채택한다.
- 파일럿 작업 `TEMP-001`~`TEMP-003`: 승인 및 pre-complete 통과 후 `DONE`.
- 신규 작업: `tasks/`, `records/`, `critiques/`와 BASS 게이트가 SoT다.
- 기존 COL 문서와 게이트 코드: legacy history/reference로 보존하며 신규 작업에는 실행하지 않는다.
- COL 파일 삭제, 문서 일괄 변환, hooks·CI 전환: 결정하지 않음.
- 공식 작업 ID 네이밍 규칙과 material UI evidence 구조 계약: 미결정.
