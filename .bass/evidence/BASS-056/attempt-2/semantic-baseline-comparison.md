# TypeSafe holdout comparison

The evaluator has 90 synthetic holdout cases: 30 each for specification, context, and evidence, across English and Korean. These cases are not historical product telemetry.

The existing-flow baseline is a deterministic proxy: specification checks see all required fields populated, evidence checks see a nonempty quote, and context uses the evaluator's keyword top-five ranking. This proxy does not model historical operator outcomes.

| Measure | Existing-flow baseline | First TypeSafe run (Choice) | Noul re-evaluation |
| --- | ---: | ---: | ---: |
| Specification problem recall | 0/16 (0%) | 16/16 (100%) | pending |
| Normal specifications not auto-passed | 0/14 (0%) | 14/14 (100%; all uncertain) | pending |
| Context relevant item in top five | 16/30 (53.3%) | 30/30 (100%) | pending |
| Unsupported evidence claims accepted | 16/16 (16) | 0/16 (0) | pending |
| Normal evidence claims accepted | 14/14 (100%) | 12/14 (85.7%) | pending |
| External API spend | $0 | $0.003772 | pending |
| Mean model-call latency | 0 ms | 215 ms | pending |

The first run's reported normal-specification false-positive rate counts abstentions as failures; its 14/14 normal cases were not confident problem judgments. The pipeline conservatively kept all of them from passing. Re-evaluation uses Noul for these binary checks, with 0.2/0.8 review thresholds.

Fill the final column from `.bass/evidence/BASS-056/semantic-live-evaluation.json` after the Noul run. Its cost ledger is cumulative across runs. The zero-latency baseline means no model call; it is not a measurement of total local BASS execution time.
