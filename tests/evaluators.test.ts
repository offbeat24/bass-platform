import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { planEvaluators, runEvaluators } from "../src/evaluators/runner.js";

describe("Evaluator 러너", () => {
  it("명령 없음: 빈 계획은 빈 결과", () => {
    const results = runEvaluators(planEvaluators({}), process.cwd());
    expect(results).toEqual([]);
  });

  it("성공과 실패를 exit code 로 구분한다", () => {
    const plans = [
      {
        level: 1 as const,
        specs: [
          { name: "ok", command: "exit 0" },
          { name: "bad", command: "exit 3" },
        ],
      },
    ];
    const results = runEvaluators(plans, process.cwd());
    expect(results.find((r) => r.name === "ok")?.status).toBe("pass");
    const bad = results.find((r) => r.name === "bad")!;
    expect(bad.status).toBe("fail");
    expect(bad.exitCode).toBe(3);
  });

  it("timeout 처리", () => {
    const plans = [{ level: 2 as const, specs: [{ name: "slow", command: "sleep 5", timeout_ms: 300 }] }];
    const results = runEvaluators(plans, process.cwd());
    expect(results[0]!.status).toBe("timeout");
  });

  it("일부 평가기 실패 시에도 나머지는 실행된다", () => {
    const plans = [
      {
        level: 1 as const,
        specs: [
          { name: "fail-first", command: "exit 1" },
          { name: "still-runs", command: "echo hello" },
        ],
      },
    ];
    const results = runEvaluators(plans, process.cwd());
    expect(results).toHaveLength(2);
    expect(results[1]!.status).toBe("pass");
  });

  it("레벨 필터", () => {
    const plans = [
      { level: 1 as const, specs: [{ name: "l1", command: "exit 0" }] },
      { level: 2 as const, specs: [{ name: "l2", command: "exit 0" }] },
    ];
    const results = runEvaluators(plans, process.cwd(), { levels: [1] });
    expect(results.map((r) => r.name)).toEqual(["l1"]);
  });

  it("task evaluator의 전체 출력을 prompt 밖 evidence 파일에 보존한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bass-evidence-"));
    const evidenceDir = path.join(root, ".bass", "evidence", "EVAL-1", "attempt-1");
    const results = runEvaluators([
      { level: 1 as const, specs: [{ name: "full-output", command: "printf 'line one\\nline two\\nAPI_KEY=secret-value\\n'" }] },
    ], root, { evidenceDir });
    expect(results[0]?.evidencePath).toBe(".bass/evidence/EVAL-1/attempt-1/L1-full-output.log");
    const evidence = fs.readFileSync(path.join(root, results[0]!.evidencePath!), "utf8");
    expect(evidence).toContain("status: pass");
    expect(evidence).toContain("line one\nline two");
    expect(evidence).toContain("API_KEY=***masked***");
    expect(evidence).not.toContain("secret-value");
    expect(evidence.endsWith("\n")).toBe(true);
    expect(evidence.endsWith("\n\n")).toBe(false);
  });

  it("재사용된 pass는 기존 전문 evidence를 skip 요약으로 덮어쓰지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bass-reuse-evidence-"));
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    const evidenceDir = path.join(root, ".bass", "evidence", "EVAL-2", "attempt-1");
    const plans = [{ level: 1 as const, specs: [{ name: "reuse", command: "printf 'original full output\\n'" }] }];
    const first = runEvaluators(plans, root, { reusePassing: true, evidenceDir });
    expect(first[0]?.status).toBe("pass");
    const second = runEvaluators(plans, root, { reusePassing: true, evidenceDir });
    expect(second[0]?.status).toBe("skipped");
    const evidence = fs.readFileSync(path.join(root, second[0]!.evidencePath!), "utf8");
    expect(evidence).toContain("status: pass");
    expect(evidence).toContain("original full output");
    expect(evidence).not.toContain("status: skipped");
  });
});
