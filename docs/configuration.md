# Configuration

## 계층 (§10, 낮은 우선순위 → 높은 우선순위)

```text
BASS built-in defaults
↓
profiles (extends 체인 순서, 예: common → web)
↓
project bass.yaml
↓
environment (bass.yaml 의 environments.<env>, --env 지정 시)
↓
task (작업 frontmatter 의 config / models)
↓
runtime override (--set key=value)
```

객체는 깊은 병합, 배열과 스칼라는 상위 계층이 통째로 대체한다.

## `bass config explain`

키별로 최종값, 결정한 계층, 물리적 출처 파일, 덮어쓰기 이력을 출력한다.
`secret`, `password`, `api_key`, `credential`, `*_token` 으로 끝나는 키는
값이 마스킹된다.

```text
models.worker = "balanced"
  decided by: project (/path/to/bass.yaml)
  overrides: bass-defaults = "auto"
```

## bass.yaml 스키마

```yaml
bass:
  version: 0.2.1          # 의존하는 BASS 버전
  profiles: [common, web] # 프로파일 체인

project:
  name: my-project

models:                   # capability alias 만. 모델명 금지
  worker: auto

workflow:
  max_active_tasks: 1
  reviewer_required: true

evaluators:               # bass evaluate 가 실행할 명령
  level1:
    - name: typecheck
      command: npm run typecheck
  level2:
    - name: test
      command: npm test
  level3: []

environments:             # 선택
  production:
    workflow:
      reviewer_required: true
```

## 런타임 버전 계약

- `package.json`의 `version`이 설치된 CLI, `bass --version`, `bass init` 출력의
  단일 원천이다.
- 프로젝트의 `bass.version`은 현재 0.x 동안 exact version으로 해석한다.
- 설치된 런타임과 값이 다르면 config, gate, route, compose, evaluate 등 프로젝트
  의존 명령을 실행하지 않는다.
- 버전 변경은 release notes와 migration 안내를 검토한 뒤 `bass.yaml`과 설치
  패키지를 함께 올린다.
- semver range 호환은 동작·정책·prompt 변경의 호환 기준이 정해질 때까지 지원하지 않는다.
