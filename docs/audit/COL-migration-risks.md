# COL → BASS 마이그레이션 위험

## 전제 (DECISION)

- COL은 초기에 읽기 전용으로 유지한다. 삭제·수정하지 않는다.
- BASS는 `/Users/okestro/croquis/BASS/bass-platform`에 독립 구현한다 (사용자 승인 완료).
- 파일럿: BASS 내 fixture 검증 → 기존 deck 레포 1개에 시험 적용 (사용자 승인 완료).
- COL 폐기 여부는 파일럿 비교 후 별도 인간 결정.

## 위험 목록

### RISK-1: 기존 deck 레포와의 이중 체제

- 내용: 파일럿 기간 동안 deck 레포는 COL 게이트(`harness.py`)와 BASS 게이트를 동시에 가질 수 있다.
- 영향: 게이트 중복 실행, 상충하는 완료 판정.
- 완화: 파일럿 레포에서는 BASS 게이트만 활성화하고 COL 훅은 비활성 상태로 보존한다.
  어느 쪽 게이트가 SoT인지 레포 AGENTS.md에 명시한다.

### RISK-2: COL 게이트가 검증하던 항목의 누락

- 내용: BASS MVP가 COL의 docs-manifest·evidence·journal 마커 검증 전체를 즉시 대체하지 못할 수 있다.
- 영향: 파일럿에서 품질 게이트 공백.
- 완화: 파일럿 전 `bass gate pre-complete` 검증 항목과 COL `pre-complete` 항목을 비교표로 만들고,
  누락 항목은 의도적 제외인지 이식 대상인지 인간이 결정한다.

### RISK-3: 모델 alias 매핑 오류

- 내용: 레지스트리 초기 stable 매핑이 실제 사용 가능 모델과 어긋날 수 있다
  (Codex·Cursor·Claude 각 채널의 모델 표기가 다름).
- 영향: 라우팅 권고가 실행 불가능한 모델을 가리킴.
- 완화: 레지스트리에 채널별(provider별) 표기를 분리 기록하고,
  실제 모델명 확정은 사용자 확인을 거친다. BASS는 API를 직접 호출하지 않으므로
  권고 불일치가 즉시 장애가 되지는 않는다.

### RISK-4: shim 드리프트 재발

- 내용: COL의 CLAUDE.md 생성 방식(내용 복사)을 답습하면 BASS에서도 드리프트가 재발한다.
- 영향: 에이전트별로 다른 규칙을 보게 됨.
- 완화: shim은 참조 링크와 최소 규칙만 담는다. `bass doctor`가 shim의 참조 유효성과
  본문 비대화(복사 징후)를 검사한다.

### RISK-5: BASS 자체가 목적이 되는 과잉 구축

- 내용: Core 프롬프트 §29가 명시한 실패 모드. 플랫폼 완성이 제품 개발보다 커지는 것.
- 영향: 유지보수 부담, 사용되지 않는 기능.
- 완화: MVP 범위(§22)를 넘는 기능은 후순위 목록에 고정. Simplicity Critic을 BASS 자체에도 적용.

### RISK-6: 학습·교훈 데이터의 이관 공백

- 내용: deck 레포들의 retrospectives·build-journal에 축적된 교훈이 BASS memory 구조로
  자동 이관되지 않는다.
- 영향: 과거 교훈 유실.
- 완화: 파일럿 시 해당 레포의 교훈 문서를 수동 검토해 project memory로 옮기고,
  둘 이상 프로젝트에서 반복된 것만 BASS learning 승격 후보로 기록한다.

## 롤백 방법

- BASS는 COL과 완전히 분리된 디렉터리이므로, 실패 시 `bass-platform` 삭제와
  파일럿 레포의 BASS 파일(`bass.yaml`, shim) 제거만으로 원상 복구된다.
- COL은 변경하지 않으므로 롤백 대상이 아니다.
