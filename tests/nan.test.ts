import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { initProject } from "../src/project/init.js";
import { builtinAdapters } from "../src/nan/adapters/builtin.js";
import { recommendRuntimes } from "../src/nan/domain/recommendation.js";
import { validateTrace, type TraceRegistry } from "../src/nan/domain/trace.js";
import {
  buildEvidenceReport,
  initNanPreset,
  lockProtectedFiles,
  recordAttempt,
  saveCertification,
  saveVerification,
  validateProjectTrace,
  verifyProtectedFiles,
  writeEvidenceReport,
} from "../src/nan/project.js";
import { loadCustomAdapters } from "../src/nan/adapters/custom.js";
import { loadConcept } from "../src/nan/runtimeCatalog.js";
import { CapacitorMobileTargetAdapter } from "../src/nan/adapters/capacitor.js";
import { loadConfig } from "../src/config/loader.js";
import { composeInstructions } from "../src/compose/composer.js";

function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bass-nan-"));
  initProject({
    projectRoot: root,
    name: "nan-demo",
    profiles: ["common", "nan2026"],
    owner: "user",
    withDesign: false,
  });
  initNanPreset(root);
  return root;
}

function snapshot(root: string): Record<string, string> {
  const values: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else values[path.relative(root, abs)] = fs.readFileSync(abs).toString("base64");
    }
  };
  walk(root);
  return values;
}

describe("NAN preset", () => {
  it("is byte-for-byte idempotent and initializes a valid trace", () => {
    const root = tempProject();
    const first = snapshot(root);
    const result = initNanPreset(root);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(snapshot(root)).toEqual(first);
    expect(validateProjectTrace(root)).toEqual([]);
    expect(parse(fs.readFileSync(path.join(root, "nan2026.yaml"), "utf8")).displayName).toBe(
      "BASS 0.1.1 — NAN Edition",
    );
  });

  it("preserves a user-modified managed file and reports a conflict", () => {
    const root = tempProject();
    const file = path.join(root, "nan", "gates.yaml");
    fs.appendFileSync(file, "# human edit\n");
    const result = initNanPreset(root);
    expect(result.conflicts).toContain("nan/gates.yaml");
    expect(fs.readFileSync(file, "utf8")).toContain("# human edit");
  });

  it("injects the shared NAN workflow into instructions for every agent shim", () => {
    const root = tempProject();
    const composed = composeInstructions({ projectRoot: root, config: loadConfig({ projectRoot: root }), role: "worker" });
    expect(composed).toContain("section: NAN 2026 workflow");
    expect(composed).toContain("Never claim an unexecuted target build");
  });
});

describe("runtime catalog and recommendations", () => {
  it("contains all planned built-in adapters and scores to 100 points", () => {
    const adapters = builtinAdapters();
    expect(adapters.map((adapter) => adapter.descriptor().id).sort()).toEqual([
      "phaser-web",
      "pixi-web",
      "playcanvas-web",
      "unity",
      "vanilla-web",
    ]);
    const concept = loadConcept(tempProject(), "CON-001");
    const recommendations = recommendRuntimes(
      concept,
      adapters.map((adapter) => adapter.descriptor()),
    );
    expect(recommendations).toHaveLength(5);
    expect(recommendations.every((item) => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(Object.values(recommendations[0]!.breakdown).reduce((sum, score) => sum + score, 0)).toBe(
      recommendations[0]!.score,
    );
  });

  it("composes the explicit capacitor-mobile target adapter", () => {
    const composed = new CapacitorMobileTargetAdapter().compose({
      projectRoot: "/tmp/project",
      destination: "game",
      targets: ["web", "android"],
      projectName: "demo",
    });
    expect(composed.dependencies["@capacitor/android"]).toBeDefined();
    expect(composed.files["game/capacitor.config.ts"]).toContain("CapacitorConfig");
  });

  it("registers a custom runtime.yaml under the same descriptor contract", () => {
    const root = tempProject();
    const dir = path.join(root, ".bass", "nan2026", "adapters", "custom-demo");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "runtime.yaml"),
      `id: custom-demo
name: Demo
version: 1.0.0
kind: custom
description: Team runtime
suitedTags: [card]
capabilities: [render]
supportedTargets: [web]
license: MIT
licenseRisk: low
`,
    );
    expect(loadCustomAdapters(root)[0]?.descriptor().id).toBe("custom-demo");
  });

  it("scaffolds twice without a second change and preserves user edits", () => {
    const root = tempProject();
    const adapter = builtinAdapters().find((item) => item.descriptor().id === "pixi-web")!;
    const options = {
      projectRoot: root,
      destination: "game",
      targets: ["web"] as const,
      projectName: "nan-demo",
    };
    expect(adapter.scaffold(options).status).toBe("applied");
    expect(JSON.parse(fs.readFileSync(path.join(root, "game", "package.json"), "utf8")).version).toBe("0.1.1");
    const first = snapshot(root);
    expect(adapter.scaffold(options).status).toBe("unchanged");
    expect(snapshot(root)).toEqual(first);
    fs.appendFileSync(path.join(root, "game", "src", "main.ts"), "// user edit\n");
    const conflict = adapter.scaffold(options);
    expect(conflict.status).toBe("conflict");
    expect(conflict.conflicts).toContain("game/src/main.ts");
    expect(fs.readFileSync(path.join(root, "game", "src", "main.ts"), "utf8")).toContain("// user edit");
  });
});

describe("trace, evidence, protection, and bounded retries", () => {
  it("detects dead links and orphans", () => {
    const trace: TraceRegistry = {
      themes: ["THEME-1"],
      concepts: ["CON-1"],
      decisions: [],
      requirements: [],
      scenarios: [],
      tests: [],
      evidence: ["EVD-1"],
      links: [{ from: "THEME-1", to: "MISSING" }],
    };
    const issues = validateTrace(trace);
    expect(issues.some((issue) => issue.type === "dead-link")).toBe(true);
    expect(issues.some((issue) => issue.type === "orphan" && issue.id === "CON-1")).toBe(true);
    expect(issues.some((issue) => issue.type === "orphan" && issue.id === "EVD-1")).toBe(true);
  });

  it("generates the same evidence checksum for the same evidence", () => {
    const root = tempProject();
    fs.writeFileSync(path.join(root, "evidence", "build.txt"), "PASS\n");
    const first = writeEvidenceReport(root);
    const second = writeEvidenceReport(root);
    expect(second).toEqual(first);
    expect(buildEvidenceReport(root).checksum).toBe(first.checksum);
  });

  it("detects protected gate changes after session lock", () => {
    const root = tempProject();
    lockProtectedFiles(root);
    expect(verifyProtectedFiles(root).every((check) => check.status === "pass")).toBe(true);
    fs.appendFileSync(path.join(root, "nan", "acceptance.yaml"), "# weakened\n");
    expect(verifyProtectedFiles(root).find((check) => check.path === "nan/acceptance.yaml")?.status).toBe("fail");
  });

  it("keeps unexecuted targets not-verified and bounds retries", () => {
    const root = tempProject();
    const record = saveCertification(
      root,
      "pixi-web",
      ["web", "android"],
      {
        runtime: "pixi-web",
        status: "not-verified",
        checks: [
          { id: "node", status: "pass", detail: "ok" },
          { id: "npm", status: "pass", detail: "ok" },
          { id: "native-android", status: "not-verified", detail: "missing SDK" },
        ],
      },
    );
    expect(record.targets.web).toBe("not-verified");
    expect(record.targets.android).toBe("not-verified");
    const verified = saveVerification(root, {
      runtime: "pixi-web",
      status: "not-verified",
      targets: [
        { target: "web", status: "pass", detail: "build passed" },
        { target: "android", status: "not-verified", detail: "native build not run" },
      ],
    });
    expect(verified.targets.web).toBe("pass");
    expect(verified.targets.android).toBe("not-verified");
    expect(recordAttempt(root, "TASK-1", "fail").status).toBe("ACTIVE");
    expect(recordAttempt(root, "TASK-1", "fail").status).toBe("BLOCKED");
    recordAttempt(root, "TASK-1", "pass");
    expect(recordAttempt(root, "TASK-1", "fail").status).toBe("NEEDS_HUMAN");
  });
});

describe("macOS prerequisite checker", () => {
  it("prints the official install link and recovery steps when Node is missing", () => {
    const result = spawnSync("sh", ["scripts/check-prerequisites.sh"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: { ...process.env, BASS_NODE_BIN: "__missing_node__", BASS_SKIP_NETWORK_CHECK: "1" },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("https://nodejs.org/en/download");
    expect(result.stdout).toContain("Reopen Terminal");
  });

  it("fails clearly for Node below 20", () => {
    const result = spawnSync("sh", ["scripts/check-prerequisites.sh"], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: { ...process.env, BASS_NODE_VERSION_OVERRIDE: "18.20.0", BASS_SKIP_NETWORK_CHECK: "1" },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Node.js 20+ is required; detected v18.20.0");
  });
});
