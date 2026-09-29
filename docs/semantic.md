# Optional TypeSafe judgments

BASS 0.7.0 keeps `semantic.mode: off` by default. To use Jev, add this to a project's `bass.yaml` after upgrading it to BASS 0.6.0 or newer:

```yaml
semantic:
  mode: enforce
  provider: typesafe
  model: jev-1.13.0
  input_usd_per_million: 0.042
  document_paths: [docs/decisions]
  max_usd: 0.05
```

Set `TYPESAFE_API_KEY` in the execution environment. BASS does not store the key. `bass doctor` checks skill availability and key presence separately; `bass doctor --semantic-api` confirms authentication with a live model-list response. The project budget applies to all requests recorded under `.bass/semantic/usage.json`. Each request reserves the maximum per-request input charge; failed calls without metered usage retain that reservation as spent. A `429` may be retried once within the same budget. Remove a budget ledger only after reconciling the real provider bill.

The default Jev 1.13.0 rate is built in. If you set another model, also set its current `input_usd_per_million` from TypeSafe's official price page. Reevaluate quality and thresholds before using a new model in an enforced workflow.

## Work sequence

1. Run `bass semantic prepare TASK-001 --dry-run` to inspect the file paths and maximum calls. Then run `bass semantic prepare TASK-001` before ACTIVE. Resolve flagged criteria by editing the task or with a specific human resolution. The task gate reads the saved result; it never makes an API request itself.
2. Compose and implement the task as usual. The prepared context recommendations are added within the existing character budget. Explicit context stays first. If context ranking is unavailable, the existing rules provide context and the report records the fallback.
3. After verification, create `.bass/semantic/TASK-001/claims.json` with one exact acceptance criterion per entry. Each entry needs a claim and a literal quote from a text file under that task's `.bass/evidence/TASK-001/` directory:

```json
{
  "claims": [{
    "criterion": "Older responses do not replace the latest result",
    "claim": "The older response was ignored",
    "evidence": {
      "path": ".bass/evidence/TASK-001/test.log",
      "quote": "older response did not replace the latest result"
    }
  }]
}
```

4. Run `bass semantic verify TASK-001 --dry-run`, then `bass semantic verify TASK-001`. Use `bass semantic report TASK-001 --json` to inspect the full result and cost. Missing, changed, contradictory or uncertain evidence blocks pre-review. A human can record a justified false-positive resolution using `bass semantic resolve TASK-001 FINDING-ID --reason "..." --approver "..."`. Resolutions only apply to the exact input hash.

5. Copy `prepare_hash`, `verify_hash` and current resolved finding IDs from `bass semantic report TASK-001 --json` into `semantic` in Run Record v3. These hashes cover the saved judgments; the stage `input_hash` separately binds human resolutions to exact inputs. The existing final approval remains separate.

## Boundaries

Only task text, allowed Markdown sections and quoted task-owned text evidence are sent to TypeSafe. BASS excludes secret paths and path escapes, including symlinks. Do not put secrets or private customer material in task text or evidence quotes. Jev evaluates text and cannot validate UI screenshots. API errors and missing assessments block the relevant gate; only context ranking falls back to existing rules. TypeSafe's confidence is a decision signal, not proof of correctness. Check official [model documentation](https://docs.typesafe.ai/models) for current model and price before changing the pinned model.
