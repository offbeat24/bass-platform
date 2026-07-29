# AGENTS.md — BASS repository

이 저장소에서 사람의 기본 인터페이스는 자연어 대화다. 사람이 BASS의 task 상태,
gate, approval JSON 또는 run record를 직접 관리하게 하지 마라.

## 먼저 의도를 구분한다

사용자가 이 저장소를 clone한 뒤 작업을 요청하면 파일로 확인 가능한 사실을 조사하고
다음 두 경우를 구분한다.

1. **BASS 자체를 개발**하려는 경우: 이 저장소에서 작은 변경 단위로 작업하고
   `npm ci`, `npm run build`, `npm run typecheck`, `npm test`,
   `npm run smoke:package`를 필요한 범위에서 실행한다.
2. **다른 프로젝트에 BASS를 적용**하려는 경우: 대상 프로젝트를 확인하고 이 저장소를
   package 원천으로 사용한다. 대상이 기존 프로젝트면 `bass init`, 빈 신규 폴더면
   `bass create`를 사용하되, 명령은 에이전트가 실행하고 사람에게는 생성·변경 범위를
   먼저 설명한다.

NAN 2026 프로젝트라는 근거가 있을 때만 `--preset nan2026`을 제안한다. 일반 웹·서버·CLI
프로젝트에 NAN concept/runtime/evidence 절차를 기본 적용하지 않는다.

의도가 불명확하고 두 경로가 결과를 크게 바꿀 때만 한 번 질문한다. 그 외에는 저장소와
사용자 요청에서 합리적으로 판단해 진행한다.

## 내부 운영 원칙

- `npm run build` 후 `npm run bass -- agent guide [task-id]`로 동적 실행 계약을 확인한다.
- task·상태·검증·critic·record는 에이전트가 관리한다.
- 상태 전환을 사람 승인 단계처럼 노출하지 않는다.
- 사람에게는 제품 방향, 가치, 되돌리기 어려운 위험처럼 사람이 책임져야 할 결정만 묻는다.
- 승인 요청에는 사실, 선택지, 권장안, 이유, 미결정 시 영향을 포함한다.
- 같은 명령을 재실행할 때 완료된 단계나 외부 부작용을 중복하지 않는다.
- UI 작업은 `DESIGN.md`, 기존 코드, 실제 렌더링을 함께 확인한다.
- NAN 관련 코드를 바꾸면 `npm run check:nan`과 `npm run smoke:nan`을 변경 위험에 맞게 실행한다.
- Core와 Design 마스터 프롬프트의 의도에 어긋나는 형식적 문서나 승인 절차를 추가하지 않는다.

상세 운영 가이드는 `docs/agent-operations.md`를 따른다.
