# BASS-055: 필요한 시점에만 지침 읽기

2026-09-18. 기준 commit: `252b9f6`. 작업 브랜치: `refactor/lean-instruction-routing`.

## 근거와 판단

사용자가 제공한 [AI_RESKILL 게시물](https://x.com/AI_RESKILL/status/2100385106980692336)과 [codexneo4 게시물 및 답글](https://x.com/codexneo4/status/2099302097909158238)을 브라우저로 확인했다. 두 게시물이 인용한 [OpenAI 공식 글](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)도 직접 읽었다. 적용한 원칙은 구체적인 스킬 발동 조건, 관련 지침의 선택적 로딩, 중복 절차 축소, 작업 완료 기준의 명확화다. 고정된 5~10줄이나 몇 배의 토큰 절약은 검증 기준으로 삼지 않았다.

0.5.1은 이미 역할별 자동 문서 선택과 짧은 스킬을 갖고 있었다. 코어 전체 교체보다 실제 남은 무조건 호출 경로를 고쳤다. 호스트 중립 코어, task/event 이력, 위험 승인, 최종 승인, bounded loop와 evidence 검증은 유지했다.

## 변경

| 경로 | 이전 | 현재 |
| --- | --- | --- |
| SessionStart | 모든 폴더에서 guide 명령을 지시 | hook cwd 및 상위 폴더의 bass.yaml 확인 후 짧은 안내만 출력 |
| AGENTS 및 호스트 shim | 작업 시작 전 무조건 guide | 구현 시 task guide, 조회는 관련 근거만 확인 |
| capability 계획 | task 없이도 Ponytail/runner 호출 가능 | task가 없으면 호출 없음 |
| 읽기 전용/문서 | Ponytail 자동 호출 | 코드 단순화가 필요하거나 명시적으로 요청된 경우만 호출 |
| 읽기 전용 adapter | 구현 runner/workspace/협업 호출 가능 | 자동 구현 호출 없음; 필요한 context provider는 유지 |
| bass-shape/work/setup | 적용 범위가 겹칠 여지 | 미정의 요구사항, 정의된 작업 실행, 설치/업그레이드로 구분 |
| evaluator compose | task 전문 포함 | 알려진 배경 섹션만 생략, 원본 경로와 생략 목록 제공 |
| context 중복 | TECH.md와 그 섹션을 동시 로딩 | 전체 파일이 지정되면 중복 섹션 제외 |
| context 보안 | 요청 경로만 비밀 파일 검사 | 심볼릭 링크의 실제 경로도 검사 |
| benchmark | hook JavaScript 크기를 지침에 합산 | 실제 hook 출력 텍스트를 측정 |

Evaluator는 원본 frontmatter, Decisions, Assumptions, 제외/허용/금지 범위, Acceptance criteria, Human judgment, Verification과 사용자 정의 섹션을 유지한다. Problem, What we are shipping, Facts, Rollback은 필요하면 원본에서 읽는다. fenced example이 있으면 전문을 유지한다. 다른 역할은 전문을 유지한다.

## 검증과 한계

회귀 검사는 common/cli/server/web/game/nan2026의 조회/문서/명시적 호출, 두 호스트의 동일 계획, BASS 외부/하위 폴더 세션, 원본 보존, 중첩 제약, fenced example, 비밀 파일 링크를 다룬다. 기존 승인·provider·scope 검사를 유지한다. 변경한 세 스킬의 구조 검증을 수행했다. 이는 실제 모델의 스킬 선택 정확도를 측정한 결과는 아니다.

동일한 짧은 fixture 기준 compose 문자는 docs evaluator 3618→3589, code worker 4480→4401, UI worker 5464→5385, server worker 4801→4722다. 스킬은 1517→1391 bytes, 실제 세션 안내는 169→141 bytes다. 이미 축소된 0.5.1 대비 추가 문자 감소는 작다. 주요 효과는 필요 없는 세션과 task에서 호출하지 않는 동작이다. 자세한 수치는 `.bass/evidence/BASS-055/comparison.json`에 있다.

실제 Codex/Claude 모델의 토큰·캐시·비용·완료 품질 A/B와 Windows 실행은 측정하지 않았다. 설치된 전역 플러그인은 변경하지 않았다. 배포 전 호스트 실사용 비교가 남는다.
