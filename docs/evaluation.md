# Evaluation

| Level | Typical checks | Selection |
|---|---|---|
| L1 | schema, typecheck, lint, cheap static policy | every planned depth |
| L2 | unit, integration, E2E, CLI behavior | Standard/Hardened, affected surfaces only |
| L3 | performance, accessibility, visual regression, release smoke | Hardened and release only |

Critics and human judgment are not extra evaluator levels. `ExecutionPlan.critics` independently caps semantic review; humans retain product and risk judgment.

Each evaluator runs at most once for an unchanged relevant diff. Passing results are stored with command, Git HEAD, and changed-file fingerprints. An explicit `--levels` flag bypasses adaptive level selection for CI/debugging, but command deduplication remains.

Common performance metrics are `context_chars`, capability calls, evaluator runs and reruns, critic count, and wall time. Record model token totals only when the host exposes them reliably.
