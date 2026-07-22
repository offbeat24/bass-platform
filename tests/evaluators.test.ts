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
});
