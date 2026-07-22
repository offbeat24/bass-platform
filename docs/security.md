# Security

## 승인 게이트

인증·권한·결제·개인정보·데이터 삭제·비밀정보 접근·배포는
`policies/approval.yaml` 규칙으로 pre-task 에서 needs-human 처리된다.
작업 파일의 `risk.reasons` 에 해당 태그를 누락하면 게이트가 잡지 못하므로,
Discovery/Planner 역할 프롬프트가 위험 태그 부여를 지시한다.
Security Critic (`prompt-library/critics/security.md`)은 관련 작업에서만 실행한다.

## 비밀정보

- `bass config explain` 은 secret / password / api_key / credential /
  `*_token` 접미 키를 마스킹한다.
- BASS 는 API 키를 저장하지 않는다 (LLM 을 직접 호출하지 않으므로).
- run record 와 critique 파일에 비밀정보를 기록하지 마라 — critic 프로토콜과
  base behavior 프롬프트에 명시되어 있다.

## 알려진 한계 (FACT)

- 마스킹은 키 이름 기반 휴리스틱이다. 값 스캔은 하지 않는다.
- 게이트는 로컬 파일 기반이므로 악의적 우회(파일 직접 수정)를 막지 못한다.
  BASS 의 위협 모델은 "실수 방지"이지 "악의적 에이전트 차단"이 아니다.
