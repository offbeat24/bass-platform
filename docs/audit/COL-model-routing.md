# COL 모델 라우팅 감사

## 현재 방식 (FACT)

COL은 **역할별 고정 핀** 방식이다.

| 역할 | 모델 | 정의 위치 |
|------|------|-----------|
| lead | gpt-5.5 | `.codex/config.toml` `model` |
| review / planner / ui / audit | gpt-5.6 | `.codex/config.toml` `review_model`, `.codex/agents/{reviewer,architecture_planner,ui_checker}.toml` |
| worker / doc / long-runner | gpt-5.4 | `.codex/agents/{implementation_worker,doc_gardener,long_runner}.toml` |

같은 핀이 다음 위치에 중복된다.

- `.codex/config.toml`, `.codex/agents/*.toml` (HQ 실행 설정)
- `.harness/templates/service-repo/.codex/*.tpl` (생성 레포로 복제)
- `scripts/validate_harness.py`의 `EXPECTED_*_MODEL` 상수 (강제 검증)
- `scripts/generate_service_repo.py`의 `LEAD_MODEL`, `WORKER_MODELS`
- `docs/operations/model-routing.kr.md`, `README.md` (정책 문서)
- 생성 템플릿 `AGENTS.md.tpl` (에이전트 지침 본문)
- `examples/run-report.json`, `tests/test_harness_hq.py`

## 평가

### 잘 작동한 것

- validator가 문서·설정·템플릿의 핀 일치를 강제해 **의도치 않은 드리프트는 막았다**.
- 역할 기반 배치(리뷰·계획은 상위 모델, 단순 작업은 하위 모델)는 비용 인식이 있다.

### 문제

1. **모델 교체 = 10곳+ 동시 수정.** validator가 일치를 강제하므로 한 곳만 바꾸면 실패한다.
   일치 강제가 드리프트는 막지만 교체 비용을 키운다.
2. **capability가 아니라 모델명으로 사고.** "gpt-5.6이 리뷰 담당"이지
   "리뷰에는 reasoning-high가 필요"가 아니다. 공급자 교체·신모델 평가가 어렵다.
3. **candidate 개념 없음.** 신모델을 stable과 병행 평가하고 승격하는 절차가 없다.
4. **작업 위험도 미반영.** 역할만으로 모델이 정해지고, 같은 worker 작업이라도
   인증·데이터 손실 위험이 큰 작업을 상위 모델로 올리는 경로가 없다.
5. **OpenAI 단일 공급자.** Claude·Cursor 채널에는 라우팅 정책 자체가 없다.

## BASS 설계 반영

```text
COL: 역할 → 모델명 (하드코딩, 다중 복제, validator로 일치 강제)
BASS: 역할 → capability alias → 중앙 레지스트리 (stable/candidate) → 실제 모델
```

- alias 해석은 `registry/models.yaml` 한 곳에서만 일어난다.
- 프로젝트·작업 파일은 alias만 사용한다 (`discovery: reasoning-high`).
- 라우터는 역할 + 작업 위험도 + 필요 capability로 alias를 권고하고 이유를 남긴다.
- stable/candidate와 승격 절차(등록 → candidate → 평가 → 비교 → 승인 → 승격 → 롤백)를 도입한다.
