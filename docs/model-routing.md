# Model Routing

## 원칙

- 프로젝트와 작업 파일은 **capability alias** 만 사용한다 (`reasoning-high`,
  `balanced`, `fast-reliable`, `auto`). 모델명 하드코딩 금지.
- alias → 실제 모델 매핑은 `registry/models.yaml` 한 곳에서만 일어난다.
- 특정 모델 고정이 꼭 필요하면 `pin:provider/model` 표기를 사용한다 (예외적).

## stable / candidate 승격 절차 (§8)

```text
새 모델 등록 (candidate)
→ 표준 평가 실행 (파일럿 작업에 --channel candidate 로 사용)
→ 기존 stable 과 품질·비용·지연·도구 사용·지시 준수 비교
→ 인간 승인
→ stable 승격 (registry/models.yaml 수정)
→ 문제 시 롤백 (이전 매핑 복원)
```

## 라우팅 로직 (`bass route`)

1. 작업 파일 `models.<role>` 지정이 최우선
2. 없으면 유효 설정(프로파일 체인)의 role 매핑
3. `auto` 는 위험도로 결정:
   - high/critical 또는 미해결 Assumptions → `reasoning-high`
   - medium → `balanced`
   - low → `fast-reliable`
4. 승인 정책이 트리거된 작업에서 discovery/planner/critic 역할은
   `fast-reliable`/`balanced` 로 낮추지 않는다 (자동 escalate)
5. 작업 `capabilities` 요구를 만족하지 못하는 alias 는 fallback 체인으로 해석

권고에는 항상 **이유 목록**이 포함된다. 실행 에이전트가 권고와 다른 모델을
쓰면 run record 의 `models_used[].followed_recommendation: false` 로 기록한다.

## 비용 판단 기준 (§9)

겉보기 난이도나 토큰 단가만으로 모델을 제한하지 않는다.

```text
Expected total cost =
  model usage cost + failed attempt cost + human review cost
  + regression cost + recovery cost + trust loss
```

## 초기 매핑 상태

현재 stable 매핑(gpt-5.x)은 COL 핀에서 가져온 **제안값**이며, candidate 로
등록된 Claude 계열과의 비교 평가 전까지는 확정이 아니다.
갱신은 `registry/models.yaml` 에서만 한다.
