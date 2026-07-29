import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { BASS_VERSION } from "../version.js";
import { sha256, stableJson, writeManagedFiles, loadManagedManifest, type ManagedManifest } from "./managedFiles.js";
import { validateTrace, type TraceRegistry } from "./domain/trace.js";
import type {
  CheckStatus,
  RuntimeCheckReport,
  RuntimeTarget,
  VerificationReport,
} from "./domain/runtime.js";

const MANIFEST_PATH = ".bass/nan2026-manifest.json";
const CERTIFICATION_PATH = ".bass/nan2026/runtime-certifications.json";
const PROTECTION_PATH = ".bass/nan2026/protection-lock.json";

export interface NanInitResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  conflicts: string[];
}

const nanFiles: Record<string, string> = {
  ".github/workflows/nan2026.yml": `name: NAN 2026 Harness

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  harness:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx --no-install bass nan trace validate
      - run: npx --no-install bass nan protect verify
      - run: npm test --if-present
      - run: npm run build --if-present
`,
  "nan2026.yaml": `edition: nan2026
displayName: BASS {{BASS_VERSION}} — NAN Edition
event:
  durationHours: 48
  deliveryLockHour: 42
workflow:
  consecutiveFailuresBeforeBlocked: 2
  maxReworksBeforeHumanDecision: 3
  humanApprovalRequired:
    - concept
    - runtime
runtime:
  selected: null
  targets: []
scoring:
  conceptFit: 30
  verticalSlice: 25
  buildReadiness: 15
  teamReadiness: 15
  deploymentStability: 10
  licenseRisk: 5
`,
  "nan/gates.yaml": `gates:
  - { id: T+6, hour: 6, outcome: vertical-slice }
  - { id: T+12, hour: 12, outcome: full-loop }
  - { id: T+18, hour: 18, outcome: feature-freeze }
  - { id: T+30, hour: 30, outcome: content-freeze }
  - { id: T+36, hour: 36, outcome: submission-candidate }
  - { id: T+42, hour: 42, outcome: submission-lock }
hardGates:
  - theme-is-mechanic
  - one-sentence-playable-loop
  - representative-scene
  - vertical-slice-in-six-hours
  - maximum-two-new-core-systems
  - visible-player-feedback
  - shippable-evidence
`,
  "nan/acceptance.yaml": `protected: true
checks:
  - id: concept-approved
    description: Human approved the final concept.
  - id: runtime-approved
    description: Runtime is certified, or a named human accepted the risk.
  - id: trace-valid
    command: bass nan trace validate
  - id: evidence-deterministic
    command: bass nan evidence report
  - id: submission-build
    description: Every claimed target has a recorded successful build; otherwise it remains not-verified.
`,
  "nan/concepts/CON-001.yaml": `id: CON-001
title: Replace with a theme-derived concept
summary: Describe the playable loop in one sentence.
tags: [simple, 2d, web]
axes:
  space: bounded arena
  coreVerb: connect
  systemBehavior: cascading response
  pressure: shrinking time window
  themeCoupling: explain why removing the theme breaks the mechanic
  visualReward: readable chain reaction
representativeScene: Describe the one scene that sells the concept.
newCoreSystems: [core-loop]
hardGates:
  theme-is-mechanic: false
  one-sentence-playable-loop: false
  representative-scene: false
  vertical-slice-in-six-hours: false
  maximum-two-new-core-systems: true
  visible-player-feedback: false
  shippable-evidence: false
score:
  theme: 0
  playability: 0
  novelty: 0
  feasibility: 0
  visualClarity: 0
`,
  "nan/trace.yaml": `themes: [THEME-001]
concepts: [CON-001]
decisions: [DEC-001]
requirements: [REQ-001]
scenarios: [SCN-001]
tests: [TEST-001]
evidence: [EVD-001]
links:
  - { from: THEME-001, to: CON-001 }
  - { from: CON-001, to: DEC-001 }
  - { from: DEC-001, to: REQ-001 }
  - { from: REQ-001, to: SCN-001 }
  - { from: SCN-001, to: TEST-001 }
  - { from: TEST-001, to: EVD-001 }
`,
  "nan/team.yaml": `roles:
  product-director:
    owns: [nan2026.yaml, nan/concepts, nan/trace.yaml, docs/submission]
  gameplay-owner:
    owns: [game/src, game/Assets]
  build-evidence-owner:
    owns: [evidence, builds, licenses]
conflictRules:
  - One owner edits a Unity Scene or Prefab at a time.
  - Prefer additive scenes and feature-owned prefab folders.
  - Announce ownership before editing shared binary or serialized assets.
`,
  "nan/AGENT_WORKFLOW.md": `# NAN 2026 agent workflow

This file is the shared entry point for Codex, Cursor, Claude, and other agents.

1. Read \`nan2026.yaml\`, \`nan/gates.yaml\`, the active concept, and \`nan/team.yaml\`.
2. Do not finalize a concept or runtime without a named human approval.
3. Use \`bass nan runtime recommend\`, then doctor and certify before apply.
4. Never claim an unexecuted target build; keep it \`not-verified\`.
5. Link theme → concept → decision → requirement → scenario → test → evidence.
6. Turn accepted critic findings into regression tests.
7. Preserve user files. A managed-file conflict requires human resolution.
8. Record failed attempts; two consecutive failures are BLOCKED and the fourth failed
   rework requires human judgment.
9. Do not weaken gates, shims, or acceptance checks after \`bass nan session lock\`.
10. Before handoff run trace, protection, relevant tests/builds, and evidence report.
`,
  "docs/submission/README.md": `# NAN 2026 submission workspace

Keep the playable build, demo video link, game introduction, AI technical-use record,
team roles, agent design, directing specification, license inventory, and evidence report here.

Do not claim a platform as verified until its build evidence is present.
`,
  "docs/submission/ai-use-log.yaml": `entries: []
# Each entry: timestamp, agent, prompt_or_goal, suggestion, human_change, human_approval,
# files, tests, playtest, commit, build, and licenses.
`,
  "evidence/README.md": `# Evidence

Store reproducible test, playtest, build, screenshot, video-reference, commit, and license
artifacts here. Convert every accepted critic finding into a regression test and link it
from nan/trace.yaml.
`,
};

export function initNanPreset(projectRoot: string): NanInitResult {
  const manifestFile = path.join(projectRoot, MANIFEST_PATH);
  const previous = loadManagedManifest(manifestFile);
  const renderedFiles = Object.fromEntries(
    Object.entries(nanFiles).map(([file, content]) => [
      file,
      content.replaceAll("{{BASS_VERSION}}", BASS_VERSION),
    ]),
  );
  const { report, managed } = writeManagedFiles(projectRoot, renderedFiles, previous);
  const manifest: ManagedManifest = {
    edition: "nan2026",
    bassVersion: BASS_VERSION,
    templateVersion: "1.0.0",
    adapterVersions: {
      "capacitor-mobile": "1.0.0",
      "phaser-web": "1.0.0",
      "pixi-web": "1.0.0",
      "playcanvas-web": "1.0.0",
      unity: "1.0.0",
      "vanilla-web": "1.0.0",
    },
    files: managed,
  };
  const serialized = stableJson(manifest);
  if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, "utf8") !== serialized) {
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(manifestFile, serialized, "utf8");
  }
  if (!fs.existsSync(path.join(projectRoot, PROTECTION_PATH))) {
    lockProtectedFiles(projectRoot);
  }
  return report;
}

interface CertificationRecord {
  runtime: string;
  status: "certified" | "not-verified" | "failed";
  targets: Record<string, CheckStatus>;
  checks: RuntimeCheckReport["checks"];
  riskApproval?: { reviewer: string; reason: string };
}

interface CertificationRegistry {
  edition: "nan2026";
  records: Record<string, CertificationRecord>;
}

export function loadCertifications(projectRoot: string): CertificationRegistry {
  const file = path.join(projectRoot, CERTIFICATION_PATH);
  if (!fs.existsSync(file)) return { edition: "nan2026", records: {} };
  return JSON.parse(fs.readFileSync(file, "utf8")) as CertificationRegistry;
}

export function saveCertification(
  projectRoot: string,
  runtime: string,
  targets: RuntimeTarget[],
  report: RuntimeCheckReport,
  riskApproval?: { reviewer: string; reason: string },
): CertificationRecord {
  const registry = loadCertifications(projectRoot);
  const commonFailed = report.checks.some(
    (check) => !targets.some((target) => check.id.includes(target)) && check.status === "fail",
  );
  const targetStatus = Object.fromEntries(
    targets.map((target) => {
      const targetChecks = report.checks.filter((check) => check.id.includes(target));
      const value: CheckStatus = commonFailed
        ? "fail"
        : targetChecks.some((check) => check.status === "fail")
          ? "fail"
          : "not-verified";
      return [target, value];
    }),
  ) as Record<string, CheckStatus>;
  const status =
    report.status === "pass"
      ? "certified"
      : report.status === "fail"
        ? "failed"
        : "not-verified";
  const record: CertificationRecord = {
    runtime,
    status,
    targets: targetStatus,
    checks: report.checks,
    ...(riskApproval ? { riskApproval } : {}),
  };
  registry.records[runtime] = record;
  const file = path.join(projectRoot, CERTIFICATION_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableJson(registry), "utf8");
  return record;
}

export function saveVerification(
  projectRoot: string,
  report: VerificationReport,
): CertificationRecord {
  const registry = loadCertifications(projectRoot);
  const record = registry.records[report.runtime];
  if (!record) {
    throw new Error(`No certification record for ${report.runtime}; certify and apply it before verification.`);
  }
  for (const result of report.targets) record.targets[result.target] = result.status;
  registry.records[report.runtime] = record;
  const file = path.join(projectRoot, CERTIFICATION_PATH);
  fs.writeFileSync(file, stableJson(registry), "utf8");
  return record;
}

export function selectRuntime(
  projectRoot: string,
  runtime: string,
  targets: RuntimeTarget[],
  approval?: { reviewer: string; reason: string },
): void {
  const certifications = loadCertifications(projectRoot);
  const record = certifications.records[runtime];
  if (record?.status !== "certified" && !approval) {
    throw new Error(
      `${runtime} is not certified. Run \`bass nan runtime certify ${runtime}\`, or provide named human risk approval.`,
    );
  }
  const file = path.join(projectRoot, "nan2026.yaml");
  const config = parse(fs.readFileSync(file, "utf8")) as Record<string, unknown> & {
    runtime?: Record<string, unknown>;
  };
  config.runtime = {
    selected: runtime,
    targets,
    status: record?.status ?? "not-verified",
    ...(approval ? { riskApproval: approval } : {}),
  };
  fs.writeFileSync(file, stringify(config, { lineWidth: 100 }), "utf8");
}

const traceSchema = z.object({
  themes: z.array(z.string()),
  concepts: z.array(z.string()),
  decisions: z.array(z.string()),
  requirements: z.array(z.string()),
  scenarios: z.array(z.string()),
  tests: z.array(z.string()),
  evidence: z.array(z.string()),
  links: z.array(z.object({ from: z.string(), to: z.string() })),
});

export function validateProjectTrace(projectRoot: string): ReturnType<typeof validateTrace> {
  const file = path.join(projectRoot, "nan", "trace.yaml");
  const parsed = traceSchema.parse(parse(fs.readFileSync(file, "utf8"))) as TraceRegistry;
  return validateTrace(parsed);
}

interface ProtectionLock {
  edition: "nan2026";
  files: Array<{ path: string; sha256: string }>;
}

const protectedPaths = [
  "AGENTS.md",
  ".cursor/rules/bass.mdc",
  "CLAUDE.md",
  "nan/gates.yaml",
  "nan/acceptance.yaml",
];

export function lockProtectedFiles(projectRoot: string): ProtectionLock {
  const files = protectedPaths
    .filter((rel) => fs.existsSync(path.join(projectRoot, rel)))
    .map((rel) => ({ path: rel, sha256: sha256(fs.readFileSync(path.join(projectRoot, rel))) }));
  const lock: ProtectionLock = { edition: "nan2026", files };
  const target = path.join(projectRoot, PROTECTION_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const serialized = stableJson(lock);
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== serialized) {
    fs.writeFileSync(target, serialized, "utf8");
  }
  return lock;
}

export function verifyProtectedFiles(projectRoot: string): Array<{ path: string; status: "pass" | "fail"; detail: string }> {
  const file = path.join(projectRoot, PROTECTION_PATH);
  if (!fs.existsSync(file)) {
    return [{ path: PROTECTION_PATH, status: "fail", detail: "protection lock missing; run `bass nan session lock`" }];
  }
  const lock = JSON.parse(fs.readFileSync(file, "utf8")) as ProtectionLock;
  return lock.files.map((entry) => {
    const abs = path.join(projectRoot, entry.path);
    if (!fs.existsSync(abs)) return { path: entry.path, status: "fail", detail: "protected file is missing" };
    const actual = sha256(fs.readFileSync(abs));
    return actual === entry.sha256
      ? { path: entry.path, status: "pass", detail: "checksum matches session baseline" }
      : { path: entry.path, status: "fail", detail: "protected file changed after session lock; obtain approval and re-lock" };
  });
}

export function buildEvidenceReport(projectRoot: string): {
  edition: "nan2026";
  files: Array<{ path: string; sha256: string }>;
  checksum: string;
} {
  const evidenceRoot = path.join(projectRoot, "evidence");
  const files: Array<{ path: string; sha256: string }> = [];
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) {
        const rel = path.relative(projectRoot, abs);
        if (rel !== "evidence/report.json") files.push({ path: rel, sha256: sha256(fs.readFileSync(abs)) });
      }
    }
  };
  walk(evidenceRoot);
  const payload = { edition: "nan2026" as const, files };
  return { ...payload, checksum: sha256(stableJson(payload)) };
}

export function writeEvidenceReport(projectRoot: string): ReturnType<typeof buildEvidenceReport> {
  const report = buildEvidenceReport(projectRoot);
  const file = path.join(projectRoot, "evidence", "report.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const serialized = stableJson(report);
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== serialized) {
    fs.writeFileSync(file, serialized, "utf8");
  }
  return report;
}

interface AttemptRecord {
  task: string;
  attempts: number;
  consecutiveFailures: number;
  status: "ACTIVE" | "BLOCKED" | "NEEDS_HUMAN";
}

interface AttemptRegistry {
  edition: "nan2026";
  tasks: Record<string, AttemptRecord>;
}

export function recordAttempt(
  projectRoot: string,
  task: string,
  outcome: "pass" | "fail",
): AttemptRecord {
  const file = path.join(projectRoot, ".bass", "nan2026", "attempts.json");
  const registry: AttemptRegistry = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as AttemptRegistry)
    : { edition: "nan2026", tasks: {} };
  const current = registry.tasks[task] ?? {
    task,
    attempts: 0,
    consecutiveFailures: 0,
    status: "ACTIVE" as const,
  };
  current.attempts += 1;
  current.consecutiveFailures = outcome === "fail" ? current.consecutiveFailures + 1 : 0;
  current.status =
    current.attempts > 3 && outcome === "fail"
      ? "NEEDS_HUMAN"
      : current.consecutiveFailures >= 2
        ? "BLOCKED"
        : "ACTIVE";
  registry.tasks[task] = current;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stableJson(registry), "utf8");
  return current;
}
