<!-- bass-shim: agents v0.2.0 — 이 파일은 얇은 참조 shim 이다. 규칙 원문을 여기에 복사하지 마라. -->
# AGENTS.md — fixture-web

이 프로젝트는 BASS를 AI 에이전트의 내부 실행 런타임으로 사용한다.
사용자 인터페이스는 자연어 대화이며, 사용자가 BASS 명령이나 기록 파일을 직접 관리하게 하지 마라.

## 에이전트 실행 계약

1. 작업 시작 시 `bass agent guide [task-id]`를 내부적으로 실행하고 현재 계약을 읽는다.
2. 저장소 사실은 직접 조사하고 사람에게는 제품·가치·위험 결정만 묻는다.
3. task·상태·검증·critic·record는 에이전트가 관리한다.
4. 위험 결정은 사용자의 명시적 답만 `bass approval risk`로 기록한다.
5. `bass gate pre-review` 후 결과를 보여주고, 승인 뒤 `bass task finalize`를 실행한다.
6. UI 작업은 `DESIGN.md`와 실제 렌더링을 조사한다.

## 설정

- 프로젝트 설정: `bass.yaml` / 유효 설정 확인: `bass config explain`
