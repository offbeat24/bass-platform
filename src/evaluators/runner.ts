import { spawnSync } from "node:child_process";
import type { EvaluatorResult } from "../types.js";
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

/**
 * 평가기를 순차 실행한다. BASS 는 프로젝트가 선언한 명령을 위임 실행할 뿐,
 * 무엇이 "테스트"인지 스스로 판단하지 않는다.
 */
export function runEvaluators(
  plans: EvaluatorPlan[],
  cwd: string,
  opts: { levels?: Array<1 | 2 | 3> } = {},
): EvaluatorResult[] {
  const results: EvaluatorResult[] = [];
  for (const plan of plans) {
    if (opts.levels && !opts.levels.includes(plan.level)) continue;
    for (const spec of plan.specs) {
      results.push(runOne(spec, plan.level, cwd));
    }
  }
  return results;
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
