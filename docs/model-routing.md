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
쓰면 run record 의 `models_used[].followed_recommendation: false` 와 구체적 `reason`을 기록한다.

기본 역할 alias:

- discovery, planner, critic: `reasoning-high`
- worker: `auto`
- evaluator, summarizer: `fast-reliable`
- documentation: `balanced`

Evaluator는 기계 검증 결과를 판정하고 구현을 하지 않으므로 빠르고 신뢰 가능한 alias를 사용한다. 프로젝트에는 실제 모델명을 복제하지 않는다.

레지스트리 매핑에 `reasoning_effort`가 설정되면 라우팅 권고 결과에 함께 표시한다. BASS는 모델을 직접 호출하지 않으므로 실행 주체가 권고된 모델과 reasoning effort 를 적용한다.

## 비용 판단 기준 (§9)

겉보기 난이도나 토큰 단가만으로 모델을 제한하지 않는다.

```text
Expected total cost =
  model usage cost + failed attempt cost + human review cost
  + regression cost + recovery cost + trust loss
```

## 현재 매핑 상태

stable 매핑은 현재 기본 선택값으로 유지한다. candidate 는 표준 평가에서 stable 과
품질·비용·지연·도구 사용·지시 준수를 비교하고 인간 승인받기 전까지 stable 을
대체하지 않는다. 매핑의 source of truth 는 `registry/models.yaml` 이다.
