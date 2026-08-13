# Evaluation

| Level | Typical checks | Selection |
|---|---|---|
| L1 | schema, typecheck, lint, cheap static policy | every planned depth |
| L2 | unit, integration, E2E, CLI behavior | Standard/Hardened, affected surfaces only |
| L3 | performance, accessibility, visual regression, release smoke | Hardened and release only |

Critics and human judgment are not extra evaluator levels. `ExecutionPlan.critics` independently caps semantic review; humans retain product and risk judgment.

Each evaluator runs at most once for an unchanged relevant diff. Passing results are stored with command, Git HEAD, and changed-file fingerprints. An explicit `--levels` flag bypasses adaptive level selection for CI/debugging, but command deduplication remains.

Full command output belongs under `.bass/evidence/<task-id>/` after common secret values are masked. The Run Record stores kind, relative path, SHA-256, producer, and timestamp. Prompts and events receive a summary and only the excerpt needed to diagnose a failure. Required evidence kinds, checksum changes, stale context, and material UI evidence are completion gates.

After a failure, rerun only the failed check and checks directly affected by the fix. A Hardened or release task may require one final full pass when its declared plan says so.

Common performance metrics are context characters, turns, attempts, tokens, cached tokens, tool calls, subagents, estimated cost, evaluator reruns, critic count, and wall time. Record unavailable host metrics as `unknown`; do not estimate them from transcript length.
