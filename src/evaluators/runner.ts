import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { EvaluatorResult, ExecutionPlan } from "../types.js";
import type { EvaluatorSpec } from "../project/bassYaml.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_TAIL_CHARS = 2000;

export interface EvaluatorPlan {
  level: 1 | 2 | 3;
  specs: EvaluatorSpec[];
}

/** effective config 의 evaluators 섹션에서 실행 계획을 만든다. */
export function planEvaluators(effective: Record<string, unknown>): EvaluatorPlan[] {
  const evaluators = (effective["evaluators"] ?? {}) as Record<string, unknown>;
  const plans: EvaluatorPlan[] = [];
  for (const level of [1, 2, 3] as const) {
    const specs = (evaluators[`level${level}`] ?? []) as EvaluatorSpec[];
    plans.push({ level, specs });
  }
  return plans;
}

export function selectEvaluatorPlans(
  plans: EvaluatorPlan[],
  executionPlan: ExecutionPlan,
  verification: "affected" | "all" = "affected",
): EvaluatorPlan[] {
  return plans
    .filter((plan) => executionPlan.verificationLevels.includes(plan.level))
    .map((plan) => ({
      ...plan,
      specs: plan.specs.filter((spec) => {
        if (verification === "all" || plan.level === 1 || !spec.surfaces?.length) return true;
        return spec.surfaces.some((surface) => executionPlan.changedSurfaces.includes(surface));
      }),
    }));
}

/**
 * 평가기를 순차 실행한다. BASS 는 프로젝트가 선언한 명령을 위임 실행할 뿐,
 * 무엇이 "테스트"인지 스스로 판단하지 않는다.
 */
export function runEvaluators(
  plans: EvaluatorPlan[],
  cwd: string,
  opts: { levels?: Array<1 | 2 | 3>; reusePassing?: boolean } = {},
): EvaluatorResult[] {
  const results: EvaluatorResult[] = [];
  const changed = opts.reusePassing ? changedFiles(cwd) : null;
  const canReuse = Boolean(opts.reusePassing && changed !== null);
  const cache = canReuse ? loadCache(cwd) : {};
  const seen = new Set<string>();
  for (const plan of plans) {
    if (opts.levels && !opts.levels.includes(plan.level)) continue;
    for (const spec of plan.specs) {
      const key = `${plan.level}:${spec.name}:${spec.command}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fingerprint = canReuse ? evaluatorFingerprint(spec, cwd, changed!) : "";
      if (canReuse && cache[key]?.status === "pass" && cache[key]?.fingerprint === fingerprint) {
        results.push({
          name: spec.name,
          level: plan.level,
          command: spec.command,
          status: "skipped",
          exitCode: 0,
          durationMs: 0,
          outputTail: "reused passing result for unchanged diff fingerprint",
        });
        continue;
      }
      const result = runOne(spec, plan.level, cwd);
      results.push(result);
      if (canReuse) {
        if (result.status === "pass") cache[key] = { status: "pass", fingerprint, at: new Date().toISOString() };
        else delete cache[key];
      }
    }
  }
  if (canReuse) saveCache(cwd, cache);
  return results;
}

interface CacheEntry {
  status: "pass";
  fingerprint: string;
  at: string;
}

type EvaluationCache = Record<string, CacheEntry>;

function cacheFile(cwd: string): string {
  return path.join(cwd, ".bass", "cache", "evaluations.json");
}

function loadCache(cwd: string): EvaluationCache {
  const file = cacheFile(cwd);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as EvaluationCache;
  } catch {
    return {};
  }
}

function saveCache(cwd: string, cache: EvaluationCache): void {
  const file = cacheFile(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

function changedFiles(cwd: string): string[] | null {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z"], { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")
    .filter(Boolean)
    .sort();
}

function evaluatorFingerprint(spec: EvaluatorSpec, cwd: string, changed: string[]): string {
  const relevant = spec.surfaces?.length
    ? changed.filter((file) => spec.surfaces!.some((surface) => surfaceForFile(file) === surface || file.startsWith(`${surface}/`)))
    : changed;
  const hash = crypto.createHash("sha256").update(spec.command);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  hash.update(`\0HEAD:${head.status === 0 ? head.stdout.trim() : "unborn"}`);
  for (const file of relevant) {
    hash.update(`\0${file}\0`);
    const absolute = path.join(cwd, file);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) hash.update(fs.readFileSync(absolute));
    else hash.update("<deleted>");
  }
  return hash.digest("hex");
}

function surfaceForFile(file: string): string {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  if (/(^|\/)(ui|components|styles|app)(\/|$)/.test(normalized)) return "ui";
  if (/(^|\/)(server|api|db|database|migrations?)(\/|$)/.test(normalized)) return "data";
  if (/(^|\/)(game|assets|scenes)(\/|$)|\.unity$/.test(normalized)) return "game";
  if (/(^|\/)(\.github|infra|deploy)(\/|$)|docker/.test(normalized)) return "release";
  return normalized.split("/")[0] ?? normalized;
}

function runOne(spec: EvaluatorSpec, level: 1 | 2 | 3, cwd: string): EvaluatorResult {
  const started = Date.now();
  const timeout = spec.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  try {
    const proc = spawnSync(spec.command, {
      cwd,
      shell: true,
      timeout,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const durationMs = Date.now() - started;
    const output = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
    const outputTail = output.slice(-OUTPUT_TAIL_CHARS);

    if (proc.error && (proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return { name: spec.name, level, command: spec.command, status: "timeout", exitCode: null, durationMs, outputTail };
    }
    if (proc.error) {
      return {
        name: spec.name,
        level,
        command: spec.command,
        status: "error",
        exitCode: null,
        durationMs,
        outputTail: proc.error.message,
      };
    }
    return {
      name: spec.name,
      level,
      command: spec.command,
      status: proc.status === 0 ? "pass" : "fail",
      exitCode: proc.status,
      durationMs,
      outputTail,
    };
  } catch (err) {
    return {
      name: spec.name,
      level,
      command: spec.command,
      status: "error",
      exitCode: null,
      durationMs: Date.now() - started,
      outputTail: (err as Error).message,
    };
  }
}

export function formatEvaluatorResults(results: EvaluatorResult[]): string {
  if (results.length === 0) return "[bass evaluate] no evaluators configured";
  const lines = ["[bass evaluate] results:"];
  for (const r of results) {
    lines.push(
      `  [L${r.level}] ${r.name}: ${r.status.toUpperCase()} (exit=${r.exitCode ?? "-"}, ${r.durationMs}ms) — ${r.command}`,
    );
    if (r.status !== "pass" && r.outputTail.trim().length > 0) {
      const tail = r.outputTail.trim().split("\n").slice(-10).join("\n    ");
      lines.push(`    ${tail}`);
    }
  }
  const failed = results.filter((r) => r.status !== "pass" && r.status !== "skipped");
  lines.push(failed.length === 0 ? "  => ALL PASS" : `  => ${failed.length} FAILING`);
  return lines.join("\n");
}
