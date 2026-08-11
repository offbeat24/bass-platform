# Workflows

```text
CAPTURED → ACTIVE → REVIEW → DONE
```

Additional recovery states remain: `BLOCKED`, `NEEDS_DECISION`, `NEEDS_EXPERT`, `FAILED`, `ROLLED_BACK`, `CANCELLED`.

These states are internal recovery markers, not approval prompts. New task files live in `.bass/tasks/`; old root `tasks/` remain readable. `bass task transition` is idempotent and old 0.2 states normalize to the four-stage path.

## CAPTURED

The task has repository facts, accepted scope and exclusions, acceptance criteria, affected surfaces, risk, and a verification intent. `pre-task` checks required evidence and explicit high-risk decisions before entering ACTIVE.

## ACTIVE

The agent implements within `ExecutionPlan.scopeLock`, runs `bass evaluate --task <id>` once, and uses no more critics or rework loops than planned. Failures rerun only the failed and directly affected checks.

## REVIEW

`pre-review` checks the run record, planned evaluation evidence, unresolved findings, rollback, docs, and one final UI render record where applicable. The human reviews product meaning and remaining risk once.

## DONE

`bass approval final` records the human judgment when required. `bass task finalize` verifies the `.bass/records/<id>.json` evidence and transitions REVIEW to DONE. Repeating finalize is a successful no-op.
