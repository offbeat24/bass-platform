# Migration from COL

COL(`/Users/okestro/croquis/COL`)은 읽기 전용으로 유지한다.
감사 결과와 분류는 `docs/audit/` 참조. 위험은 `docs/audit/COL-migration-risks.md` 참조.

## 진행 상태

```text
1. 기존 하네스 분석            ✅ docs/audit/COL-inventory.md
2. 기능 분류                   ✅ docs/audit/COL-keep-rewrite-remove.md
3. BASS 최소 구조 설계          ✅ docs/architecture.md
4. 독립 위치에 초기 구현        ✅ /Users/okestro/croquis/BASS/bass-platform (사용자 승인 경로)
5. 파일럿 프로젝트 선택         ✅ examples/fixture-web (1차), personal-memo-board (2차)
6. 실제 작업 수행              ✅ FIX-001, TEMP-001~TEMP-003
7. 기존 하네스와 결과 비교      ✅ ADR-0002
8. 부족한 기능만 이식          ⏳ 신규 작업 게이트 전환, evidence·scope 검사는 후속 결정
9. 안정화 후 확장              ⏳
10. 기존 하네스 폐기 검토       ⏳ 인간 결정 필요
```

## COL 대응 관계

| COL | BASS |
|-----|------|
| `harness.py pre-task` | `bass gate pre-task` |
| `harness.py pre-complete` | `bass gate pre-complete` |
| `run-report.json` | `records/<ID>.json` (run record) |
| `.codex/config.toml` 모델 핀 | `registry/models.yaml` alias |
| `generate_service_repo.py` 템플릿 복사 | `bass init` (shim 만 생성, 코드 복사 없음) |
| `generate_claude_shim.py` (내용 복사) | CLAUDE.md 참조 shim + `bass doctor` 드리프트 검사 |
| `docs-manifest.json` 문서 검증 | 프로파일 `required_docs` (MVP 는 축소판) |
| exec-plans active/completed 폴더 | 작업 frontmatter `status` + 상태 머신 |
| `sync-prompt-context` | `bass compose` (출처 추적 포함) |

## deck 파일럿 절차 (다음 단계)

1. 사용자가 파일럿 deck 레포 1개를 지정한다.
2. 해당 레포에서 `bass init` 실행 (기존 파일은 skip 되므로 AGENTS.md 충돌 시
   `--force` 전에 백업·비교).
3. COL 게이트와 BASS 게이트 중 어느 쪽이 SoT 인지 레포 AGENTS.md 에 명시.
4. 실제 작업 1건을 BASS 워크플로로 수행.
5. COL `pre-complete` 검증 항목과 비교표 작성, 누락 항목의 이식 여부를 인간이 결정.
6. 비교 결과를 docs/decisions/ 에 ADR 로 기록.
