# Project Profiles

## MVP 프로파일 (4개)

| 프로파일 | 용도 | design_profile |
|----------|------|----------------|
| `common` | 모든 프로젝트 기본. 모델 role 매핑, workflow 기본값, critic 5종 | off |
| `web` | 시각적 UI 웹. DESIGN.md 필수, design critic 추가, 상태 체크리스트 | on |
| `server` | 백엔드/API. 마이그레이션·인증 경로 위험 태그 제안 | off |
| `cli` | 커맨드라인 도구. 경량 Experience Spec 선택 가능 | off |

프로파일은 `extends` 로 체인을 이룬다 (web → common).
프로젝트는 `bass.yaml` 의 `bass.profiles` 목록으로 조합한다.

## 프로파일이 정의하는 것

- `defaults`: models / workflow 등 설정 기본값 (계층 병합에 참여)
- `discovery_checklist`: Discovery 역할의 기본 조사 항목
- `required_docs`: 필수 문서
- `critics`: 기본 critic 목록
- `design_profile` / `design`: Design Profile 활성화와 검사 설정
- `risk_rules`: 파일 패턴 → 위험 태그 제안

## 후순위 프로파일 (§11 후보)

mobile, desktop-ui, game, game-ui, design-system, component-library,
marketing-site, database, library, data-pipeline — 실제 프로젝트에서
필요해질 때 추가한다. 미리 만들지 않는다 (Simplicity 원칙).
