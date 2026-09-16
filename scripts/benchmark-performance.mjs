import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { composeInstructions } from "../dist/compose/composer.js";
import { loadConfig } from "../dist/config/loader.js";
import { parseTaskFile } from "../dist/task/taskFile.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const historical = json("benchmarks/bass-0.2-baseline.json");
const instructionBaseline = json("benchmarks/bass-0.5-instruction-baseline.json");
const config = parse(fs.readFileSync(path.join(root, "bass.yaml"), "utf8"));

const bytes = (relativePath) => Buffer.byteLength(fs.readFileSync(path.join(root, relativePath), "utf8"));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const reduction = (before, after) => Number((((before - after) / before) * 100).toFixed(1));

const historicalEntrypointBytes = sum(Object.values(historical.context));
const currentEntrypointBytes = sum([
  bytes("AGENTS.md"),
  bytes("prompt-library/base/behavior.md"),
  bytes("prompt-library/roles/worker.md"),
  bytes("plugins/bass/hooks/session-start.cjs"),
]);
const currentWorkSkillBytes = bytes("plugins/bass/skills/bass-work/SKILL.md");
const scenarios = {
  docsEvaluator: composeFixture({ profile: "cli", id: "FIX-101", type: "fix", surface: "docs", role: "evaluator" }),
  codeWorker: composeFixture({ profile: "cli", id: "FIX-102", type: "fix", surface: "src/compose/context.ts", role: "worker" }),
  uiWorker: composeFixture({ profile: "web", id: "FIX-103", type: "feature", surface: "ui", role: "worker" }),
  serverWorker: composeFixture({ profile: "server", id: "FIX-104", type: "feature", risk: "high", surface: "api", role: "worker" }),
};

const countEvaluators = (...levels) => levels.reduce(
  (total, level) => total + (config.evaluators?.[`level${level}`]?.length ?? 0),
  0,
);
const baselineCalls = historical.calls.evaluators + historical.calls.critics;
const fastCalls = countEvaluators(1);
const standardWorstCaseCalls = countEvaluators(1, 2) + 1;

const result = {
  baselines: {
    historical: historical.sourceCommit,
    instruction_routing: instructionBaseline.sourceCommit,
  },
  static_instruction_bytes: {
    core_entrypoints: {
      baseline: historicalEntrypointBytes,
      current: currentEntrypointBytes,
      reduction_percent: reduction(historicalEntrypointBytes, currentEntrypointBytes),
    },
    work_skill: {
      baseline: instructionBaseline.staticInstructionBytes.workSkill,
      current: currentWorkSkillBytes,
      reduction_percent: reduction(instructionBaseline.staticInstructionBytes.workSkill, currentWorkSkillBytes),
    },
  },
  composed_prompt_chars: Object.fromEntries(Object.entries(scenarios).map(([name, scenario]) => [name, {
    baseline: instructionBaseline.composedPromptChars[name],
    current: scenario.chars,
    reduction_percent: reduction(instructionBaseline.composedPromptChars[name], scenario.chars),
    automatic_context: scenario.context,
  }])),
  evaluator_critic_calls: {
    baseline: baselineCalls,
    fast: fastCalls,
    fast_reduction_percent: reduction(baselineCalls, fastCalls),
    standard_worst_case: standardWorstCaseCalls,
    standard_reduction_percent: reduction(baselineCalls, standardWorstCaseCalls),
  },
};

assert.ok(result.static_instruction_bytes.core_entrypoints.reduction_percent >= 60, "BASS static entrypoint reduction must be at least 60%");
assert.ok(result.static_instruction_bytes.work_skill.reduction_percent >= 20, "BASS work skill reduction must be at least 20%");
assert.ok(result.composed_prompt_chars.docsEvaluator.reduction_percent >= 10, "Docs evaluator prompt reduction must be at least 10%");
assert.ok(result.composed_prompt_chars.codeWorker.reduction_percent >= 2, "Code worker prompt reduction must be at least 2%");
assert.ok(result.composed_prompt_chars.uiWorker.current <= result.composed_prompt_chars.uiWorker.baseline, "UI worker prompt must not grow");
assert.ok(result.composed_prompt_chars.serverWorker.current <= result.composed_prompt_chars.serverWorker.baseline, "Server worker prompt must not grow");
assert.deepEqual(scenarios.docsEvaluator.context, []);
assert.deepEqual(scenarios.codeWorker.context, ["TECH.md#Stack", "TECH.md#Architecture"]);
assert.ok(result.evaluator_critic_calls.fast_reduction_percent >= 50, "Fast call reduction must be at least 50%");
assert.ok(result.evaluator_critic_calls.standard_reduction_percent >= 50, "Standard call reduction must be at least 50%");

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function composeFixture({ profile, id, type, risk = "low", surface, role }) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bass-053-baseline-"));
  try {
    fs.writeFileSync(path.join(projectRoot, "bass.yaml"), `bass:\n  version: 0.5.1\n  profiles:\n    - common\n    - ${profile}\nproject:\n  name: fixture\n`, "utf8");
    fs.writeFileSync(path.join(projectRoot, "PRODUCT.md"), "# Product\n\n## Product intent\n\nBuild the requested behavior.\n", "utf8");
    fs.writeFileSync(path.join(projectRoot, "TECH.md"), "# Tech\n\n## Stack\n\nTypeScript\n\n## Architecture\n\nSmall CLI modules.\n", "utf8");
    fs.writeFileSync(path.join(projectRoot, "DESIGN.md"), "# Design\n\n## Purpose\n\nClear UI.\n\n## Design principles\n\nAccessible and simple.\n", "utf8");
    const taskPath = path.join(projectRoot, `${id}.md`);
    fs.writeFileSync(taskPath, taskFixture({ id, type, risk, surface }), "utf8");
    const output = composeInstructions({
      projectRoot,
      config: loadConfig({ projectRoot }),
      task: parseTaskFile(taskPath),
      role,
    });
    return {
      chars: output.length,
      context: [...output.matchAll(/<!-- section: context: (.+?) \| source:/g)].map((match) => match[1]),
    };
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function taskFixture({ id, type, risk, surface }) {
  return `---\nid: ${id}\ntitle: Fixture\nstatus: ACTIVE\ntype: ${type}\nrisk:\n  level: ${risk}\n  reasons: []\nhuman:\n  owner: user\n  reviewer_required: true\nconfig:\n  changed_surfaces: [${surface}]\ncoordination:\n  depends_on: []\n  owned_paths: []\nloop:\n  stop_when: []\n  required_evidence: []\n---\n\n## Problem\n\nFixture problem\n\n## What we are shipping\n\nFixture result\n\n## What we are not shipping\n\nUnrelated work\n\n## Facts\n\nKnown fact\n\n## Decisions\n\nUse existing code\n\n## Assumptions\n\nnone\n\n## Relevant context\n\nnone\n\n## Allowed scope\n\n${surface}\n\n## Forbidden scope\n\nrelease\n\n## Acceptance criteria\n\nExpected behavior passes\n\n## Human judgment\n\nReview result\n\n## Verification\n\nnpm test\n\n## Rollback\n\nRevert the change\n`;
}

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}
