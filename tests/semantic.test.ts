import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempProject, writeTask } from "./helpers.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { askSemantic, semanticCost } from "../src/semantic/client.js";
import { prepareSemantic, readStage, resolveFinding, semanticGate, verifySemantic } from "../src/semantic/workflow.js";
import { preTaskGate } from "../src/workflow/gates.js";
import { composeInstructions } from "../src/compose/composer.js";
import { upgradeProject } from "../src/project/upgrade.js";

beforeEach(() => { vi.stubEnv("TYPESAFE_API_KEY", "fixture-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function fixture() {
  const root = makeTempProject({ extraYaml: "semantic:\n  mode: enforce\n  max_usd: 0.05\n" });
  fs.writeFileSync(path.join(root, "TECH.md"), "## Architecture\n\nRequest IDs prevent stale updates.\n");
  const taskFile = writeTask(root, "SEM-1", { status: "CAPTURED", sections: {
    "What we are shipping": "Prevent stale request results from replacing the latest result",
    "What we are not shipping": "No unrelated UI redesign",
    "Acceptance criteria": "- Older responses do not replace the latest result",
    Verification: "npm test for stale response ordering",
    "Relevant context": "TECH.md#Architecture",
  } });
  const config = loadConfig({ projectRoot: root });
  return { root, config, taskFile, task: parseTaskFile(taskFile) };
}

function fakeFetch(opts: { problem?: boolean; relation?: string; rateLimit?: boolean } = {}) {
  let calls = 0;
  const mock = vi.fn(async (_url: string, init?: RequestInit) => {
    calls++;
    if (opts.rateLimit && calls === 1) return new Response("slow down", { status: 429 });
    const request = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string }> };
    const answers = Object.fromEntries(Object.entries(request.questions).map(([name, question]) => {
      if (question.type === "score") return [name, { type: "score", score: 2, confidence: 0.99, probabilities: { "0": 0, "1": 0, "2": 1 } }];
      const choice = name === "relation" ? opts.relation ?? "supports" : name === "task_kind" ? "fix" : name === "surface" ? "data"
        : opts.problem && name.startsWith("covered_") ? "problem" : "pass";
      return [name, { type: "choice", choice, confidence: 0.99, probabilities: { [choice]: 1 } }];
    }));
    return Response.json({ model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 5 } });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("optional semantic workflow", () => {
  it("keeps offline defaults and performs no API calls", () => {
    const root = makeTempProject({});
    const config = loadConfig({ projectRoot: root });
    const task = parseTaskFile(writeTask(root, "SEM-2", { status: "CAPTURED" }));
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    expect(semanticGate(root, task, config, "prepare").status).toBe("pass");
    expect(preTaskGate(task, { projectRoot: root, effective: config.effective, config }).checks.some((check) => check.id === "semantic-prepare")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("blocks an unprepared task, selects context, then invalidates a changed source", async () => {
    const { root, config, task, taskFile } = fixture();
    fakeFetch();
    expect(semanticGate(root, task, config, "prepare").status).toBe("fail");
    expect(preTaskGate(task, { projectRoot: root, effective: config.effective, config }).passed).toBe(false);
    const result = await prepareSemantic(root, config, task);
    expect("status" in result && result.status).toBe("pass");
    expect(readStage(root, "SEM-1", "prepare")!.context_decisions?.some((item) => item.selected && item.sha256)).toBe(true);
    expect(semanticGate(root, task, config, "prepare").status).toBe("pass");
    fs.writeFileSync(taskFile, fs.readFileSync(taskFile, "utf8").replace("status: CAPTURED", "status: ACTIVE"));
    expect(semanticGate(root, parseTaskFile(taskFile), config, "prepare").status).toBe("pass");
    expect(composeInstructions({ projectRoot: root, config, task, role: "worker" })).toContain("Request IDs prevent stale updates");
    fs.appendFileSync(path.join(root, "TECH.md"), "\nNew policy.\n");
    expect(semanticGate(root, task, config, "prepare").status).toBe("fail");
  });

  it("records a scoped resolution and requires a new one after task input changes", async () => {
    const { root, config, taskFile, task } = fixture(); fakeFetch({ problem: true });
    const result = await prepareSemantic(root, config, task);
    expect("status" in result && result.status).toBe("needs-work");
    const finding = readStage(root, "SEM-1", "prepare")!.findings.find((item) => item.status === "problem")!;
    resolveFinding(root, task, config, finding.id, "Test logs cover both response orders", "user");
    expect(semanticGate(root, task, config, "prepare").status).toBe("pass");
    fs.appendFileSync(taskFile, "\n## New constraint\n\nMore work\n");
    expect(semanticGate(root, parseTaskFile(taskFile), config, "prepare").status).toBe("fail");
    expect(() => resolveFinding(root, parseTaskFile(taskFile), config, finding.id, "Old input", "user"))
      .toThrow("input changed");
  });

  it("checks exact quoted task evidence and stops unsupported completion", async () => {
    const { root, config, task } = fixture(); fakeFetch({ relation: "insufficient" });
    const evidence = path.join(root, ".bass", "evidence", "SEM-1");
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, "test.log"), "header\nolder response did not replace the latest result\n");
    const claimsDir = path.join(root, ".bass", "semantic", "SEM-1");
    fs.mkdirSync(claimsDir, { recursive: true });
    fs.writeFileSync(path.join(claimsDir, "claims.json"), JSON.stringify({ claims: [{
      criterion: "Older responses do not replace the latest result", claim: "The older response was ignored",
      evidence: { path: ".bass/evidence/SEM-1/test.log", quote: "older response did not replace the latest result" },
    }] }));
    const result = await verifySemantic(root, config, task);
    expect("status" in result && result.status).toBe("needs-work");
    expect(readStage(root, "SEM-1", "verify")!.references[0]).toMatchObject({ line: 2, quote: "older response did not replace the latest result" });
    expect(semanticGate(root, task, config, "verify").status).toBe("fail");
    fs.writeFileSync(path.join(evidence, "test.log"), "changed");
    expect(semanticGate(root, task, config, "verify").status).toBe("fail");
  });

  it("reuses the same request and accounts for a bounded 429 retry", async () => {
    const { root, config } = fixture(); const mock = fakeFetch({ rateLimit: true });
    const request = { state: { text: "test" }, questions: { one: { type: "choice" as const, instructions: "Does it pass?", criteria: { pass: null, problem: null } } } };
    const first = await askSemantic(root, config.bassYaml.semantic, request);
    const second = await askSemantic(root, config.bassYaml.semantic, request);
    expect(first.reused).toBe(false); expect(second.reused).toBe(true);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(semanticCost(root).spentUsd).toBeGreaterThan(0);
  });

  it("rejects a cached answer whose choice no longer matches the question", async () => {
    const { root, config } = fixture(); fakeFetch();
    const request = { state: "a", questions: { one: { type: "choice" as const, instructions: "Does it pass?", criteria: { pass: null } } } };
    const result = await askSemantic(root, config.bassYaml.semantic, request);
    const cache = path.join(root, ".bass", "semantic", "cache", `${result.id}.json`);
    const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
    saved.answers.one.choice = "unknown";
    fs.writeFileSync(cache, JSON.stringify(saved));
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow("unexpected TypeSafe choice");
  });

  it("deduplicates concurrent calls for the same judgment", async () => {
    const { root, config } = fixture();
    const underlying = fakeFetch();
    const delayed = vi.fn(async (url: string, init: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return underlying(url, init);
    });
    vi.stubGlobal("fetch", delayed);
    const request = { state: "same input", questions: { one: { type: "choice" as const, instructions: "Pass?", criteria: { pass: null } } } };
    const results = await Promise.all(Array.from({ length: 4 }, () => askSemantic(root, config.bassYaml.semantic, request)));
    expect(delayed).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.reused)).toHaveLength(3);
  });

  it("keeps a failed timeout reservation and never retries it", async () => {
    const { root, config } = fixture();
    const mock = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    vi.stubGlobal("fetch", mock);
    const request = { state: "timeout", questions: { one: { type: "noul" as const, instructions: "Yes?" } } };
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow("aborted");
    expect(mock).toHaveBeenCalledTimes(1);
    expect(semanticCost(root).spentUsd).toBeCloseTo(64_000 * 0.042 / 1_000_000);
  });

  it("does not treat a malformed provider response as a judgment", async () => {
    const { root, config } = fixture();
    const mock = vi.fn(async () => Response.json({ model: "jev-1.13.0", answers: {} }));
    vi.stubGlobal("fetch", mock);
    const request = { state: "broken", questions: { one: { type: "noul" as const, instructions: "Yes?" } } };
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow();
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("keeps secret symlinks and escaped documents out of the dry-run input", async () => {
    const { root, config, task } = fixture(); const mock = fakeFetch();
    const secret = path.join(root, ".env"); fs.writeFileSync(secret, "TYPESAFE_API_KEY=never-send");
    fs.mkdirSync(path.join(root, "specs"));
    if (process.platform !== "win32") fs.symlinkSync(secret, path.join(root, "specs", "secret.md"));
    const planned = await prepareSemantic(root, config, task, true);
    expect(JSON.stringify(planned)).not.toContain("never-send");
    expect(mock).not.toHaveBeenCalled();
  });

  it("does not call the API when the budget cannot reserve one request", async () => {
    const { root, config } = fixture(); const mock = fakeFetch();
    const request = { state: "a", questions: { one: { type: "noul" as const, instructions: "Is this a?" } } };
    await expect(askSemantic(root, { ...config.bassYaml.semantic, max_usd: 0.001 }, request)).rejects.toThrow("budget exhausted");
    expect(mock).not.toHaveBeenCalled();
  });

  it("uses existing context when semantic ranking alone fails", async () => {
    const { root, config, task } = fixture();
    const successful = fakeFetch();
    let count = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      count++;
      return count === 2 ? new Response("service unavailable", { status: 503 }) : successful(url, init);
    });
    const result = await prepareSemantic(root, config, task);
    expect("status" in result && result.status).toBe("pass");
    expect("detail" in result && result.detail).toContain("using existing context");
    expect(semanticGate(root, task, config, "prepare").status).toBe("pass");
  });

  it("does not cache a failed authentication response as a judgment", async () => {
    const { root, config } = fixture();
    const mock = vi.fn(async () => new Response("unauthorized", { status: 401 })); vi.stubGlobal("fetch", mock);
    const request = { state: "a", questions: { one: { type: "noul" as const, instructions: "Is this a?" } } };
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow("HTTP 401");
    expect(semanticCost(root).spentUsd).toBeGreaterThan(0);
    await expect(askSemantic(root, config.bassYaml.semantic, request)).rejects.toThrow("HTTP 401");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("upgrades 0.5.1 with semantic mode off and keeps a repeated upgrade unchanged", () => {
    const root = makeTempProject({ version: "0.5.1" });
    expect(upgradeProject(root, false).changes).toContain("add optional semantic mode (off)");
    upgradeProject(root, true);
    expect(loadConfig({ projectRoot: root }).bassYaml.semantic.mode).toBe("off");
    const before = fs.readFileSync(path.join(root, "bass.yaml"), "utf8");
    upgradeProject(root, true);
    expect(fs.readFileSync(path.join(root, "bass.yaml"), "utf8")).toBe(before);
  });
});
