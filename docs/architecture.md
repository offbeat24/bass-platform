# Architecture

## 핵심 결정: BASS 는 자문·감독 런타임이다

BASS 는 LLM API 를 직접 호출하지 않는다. 실행 주체는 Codex / Cursor / Claude
세션이며, BASS 는 그 세션들이 따라야 할 규칙·게이트·권고를 제공한다.
COL 의 `harness.py pre-task / pre-complete` 패턴을 일반화한 것이다.

이 결정의 이유:

- 세 에이전트 채널 모두 자체 실행 루프를 가진다. BASS 가 실행까지 소유하면
  채널별 API 통합 비용이 커지고 하네스 자체가 목적이 되는 위험(§29)이 커진다.
- 게이트·검증·기록은 채널과 무관하게 동일해야 하는 부분이고, 그것이 BASS 의 가치다.

## 구성 요소

| 프롬프트 §5 요구 | 구현 |
|------------------|------|
| Core Runtime | `src/` 전체 + `bass` CLI |
| Model Registry | `registry/models.yaml` + `src/registry/` |
| Model Router | `src/router/` — 위험·capability 기반 권고 |
| Policy Engine | `policies/approval.yaml` + `src/policy/` |
| Workflow Engine | `src/workflow/` — 상태 머신 + 게이트 |
| Prompt/Instruction Composer | `prompt-library/` + `src/compose/` |
| Project Profiles | `profiles/*.yaml` |
| Evaluators | `src/evaluators/` — 프로젝트 선언 명령 위임 실행 |
| Subagent Orchestrator | critic 프로토콜 (`src/critics/` + `prompt-library/critics/`) — 실행은 에이전트 채널의 서브에이전트 기능에 위임 |
| Human Approval Gates | `pre-task` / `pre-complete` 의 needs-human 체크 |
| Memory and Learning | run record 의 lessons + 디자인 교정 pending 루프 |
| Observability | run record (`records/<id>.json`) — 모델·검증·finding·승인 기록 |
| CLI | `src/cli/main.ts` |

## 데이터 흐름

```mermaid
flowchart TD
    Human[인간 의도] --> Task[tasks/ID.md 작업 명세]
    Task --> PreTask[bass gate pre-task]
    PreTask -->|approvals needed| HumanGate[인간 승인]
    PreTask --> Route[bass route 모델 권고]
    Route --> RegistryY[registry/models.yaml alias 해석]
    Task --> Compose[bass compose 지침 조합]
    Compose --> Agent[Codex / Cursor / Claude 세션]
    Agent --> Evaluate[bass evaluate L1-L3]
    Agent --> Critic[독립 critic 실행]
    Critic --> Validate[bass critique validate / stop]
    Evaluate --> Record[records/ID.json run record]
    Validate --> Record
    Record --> PreComplete[bass gate pre-complete]
    PreComplete --> HumanReview[인간 최종 승인]
    HumanReview --> Done[DONE]
    Record --> Lessons[교훈 -> project memory -> BASS learning 후보]
```

## 버전 정책 분리 (§7)

- **중앙 레지스트리 (빠른 변경)**: `registry/models.yaml` — 모델 식별자, stable/candidate, fallback.
  이 파일만 갱신하면 모든 프로젝트에 반영된다.
- **버전 고정 동작 (느린 변경)**: `policies/`, `prompt-library/`, `src/` 의 상태 전이·게이트·
  finding 스키마. 변경 시 bass-platform 버전을 올리고, 프로젝트는 `bass.yaml` 의
  `bass.version` 으로 특정 버전에 의존한다.

## 프로젝트 통합 (§6, Design §8)

```text
project/
├── bass.yaml          # 유일한 실질 설정. 프로파일과 alias 만 참조
├── AGENTS.md          # Codex shim (참조만, bass-shim 마커)
├── .cursor/rules/bass.mdc  # Cursor shim
├── CLAUDE.md          # Claude shim
├── DESIGN.md          # UI 프로젝트의 디자인 명세 (선택)
├── tasks/             # 작업 명세
├── records/           # run record
├── critiques/         # critic finding
└── design/corrections.yaml  # 디자인 교정 pending 루프
```

shim 드리프트는 `bass doctor` 가 감시한다 (마커 부재, 비대화).
