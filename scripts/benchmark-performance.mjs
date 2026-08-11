import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "benchmarks", "bass-0.2-baseline.json"), "utf8"));
const config = parse(fs.readFileSync(path.join(root, "bass.yaml"), "utf8"));

const bytes = (relativePath) => Buffer.byteLength(fs.readFileSync(path.join(root, relativePath), "utf8"));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const reduction = (before, after) => Number((((before - after) / before) * 100).toFixed(1));

const baselineContextChars = sum(Object.values(baseline.context));
const currentContextChars = sum([
  bytes("AGENTS.md"),
  bytes("prompt-library/base/behavior.md"),
  bytes("prompt-library/roles/worker.md"),
  bytes("plugins/bass/hooks/session-start.cjs"),
]);

const countEvaluators = (...levels) => levels.reduce(
  (total, level) => total + (config.evaluators?.[`level${level}`]?.length ?? 0),
  0,
);
const baselineCalls = baseline.calls.evaluators + baseline.calls.critics;
const fastCalls = countEvaluators(1);
const standardWorstCaseCalls = countEvaluators(1, 2) + 1;

const result = {
  source_commit: baseline.sourceCommit,
  context_chars: {
    baseline: baselineContextChars,
    current: currentContextChars,
    reduction_percent: reduction(baselineContextChars, currentContextChars),
  },
  evaluator_critic_calls: {
    baseline: baselineCalls,
    fast: fastCalls,
    fast_reduction_percent: reduction(baselineCalls, fastCalls),
    standard_worst_case: standardWorstCaseCalls,
    standard_reduction_percent: reduction(baselineCalls, standardWorstCaseCalls),
  },
};

assert.ok(result.context_chars.reduction_percent >= 60, "BASS prompt context reduction must be at least 60%");
assert.ok(result.evaluator_critic_calls.fast_reduction_percent >= 50, "Fast call reduction must be at least 50%");
assert.ok(result.evaluator_critic_calls.standard_reduction_percent >= 50, "Standard call reduction must be at least 50%");

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
