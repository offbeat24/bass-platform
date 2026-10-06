# TypeSafe live evaluation and deterministic baseline

## Scope and baseline

The suite contains 120 synthetic cases: 30 development and 90 holdout, with specification, context, and evidence cases in English and Korean. The holdout was reviewed and rerun while correcting ambiguous positive specification examples, so this is an iterated fixed synthetic suite, not an independent blind evaluation or production telemetry.

The existing-flow baseline is a deterministic proxy: specifications pass when required fields are populated, evidence passes when a quote is nonempty, and context uses keyword top-five ranking. It does not represent historical operator outcomes.

## Results

| Measure | Existing-flow proxy | Choice run | Noul v1 | Final Noul |
| --- | ---: | ---: | ---: | ---: |
| Specification problem recall | 0/16 (0%) | 16/16 (100%) | 16/16 (100%) | 16/16 (100%) |
| Normal specifications not auto-passed | 0/14 (0%) | 14/14 (100%; uncertain) | 13/14 (92.9%) | 0/14 (0%) |
| Relevant context in top five | 16/30 (53.3%) | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) |
| Unsupported evidence claims accepted | 16/16 | 0/16 | 0/16 | 0/16 |
| Normal evidence claims accepted | 14/14 (100%) | 12/14 (85.7%) | 12/14 (85.7%) | 12/14 (85.7%) |
| Cumulative API spend | $0 | $0.003771642 | $0.004815216 | $0.005902722 |

The evaluator field specNormalFalsePositive counts normal specifications that were not auto-passed (gold=true and pass=false); it is presented above by that behavior because the field name is misleading. The final run reports 0, meeting the 0.1 maximum.

## Final-run cost and latency

The final run added $0.001087506 to the shared ledger. Sixty of 90 holdout cases reused cached answers; the 30 uncached TypeSafe calls averaged 226 ms. Mean observed latency across all 90 cases, including cached answers, was 77 ms. The reported abstention rate was 15/90 (16.7%). The cumulative spend remains below the $1 cap.

Compared with the keyword proxy, TypeSafe placed the relevant context in the top five in 14 more cases (46.7 percentage points). It rejected every unsupported evidence claim, while accepting 12/14 normal claims; two normal claims were not accepted. This is a useful synthetic signal with a measurable evidence-acceptance tradeoff, not proof of production benefit.

## Decision

The agreed evaluator thresholds passed: specification problem recall 100%, conflict recall 100%, verification-gap recall 100%, normal-specification non-acceptance 0%, context top-five 100%, unsupported evidence acceptance 0, and normal evidence acceptance 85.7% (threshold 80%).

Source report: semantic-live-evaluation.json. The API key is not part of this report.
