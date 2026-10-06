# BASS-056 security and architecture review

## Security

Reviewed src/semantic/client.ts at the environment-key lookup and authorization header, plus scripts/evaluate-semantic.mjs at its live-evaluation guard and summary output. The key is read from TYPESAFE_API_KEY, sent only in the request authorization header, and is not included in evaluator summaries or reports. A tracked-file scan and a BASS-056 evidence scan found no apikey_ pattern. No confirmed security finding.

Finding file: security-1.yaml.

## Architecture and evaluation reporting

The implementation reuses the existing TypeSafe client and semantic workflow. The evaluation's positive specification fixtures now state observable outcomes and matching assertions; the task record explicitly marks the rerun as iterative on a fixed synthetic holdout.

One low-severity report-contract issue remains: specNormalFalsePositive counts normal cases that were not accepted. The comparison report documents the actual interpretation; renaming the field is deferred to a report-schema change.

Finding file: architecture-1.yaml.
