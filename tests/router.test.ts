import { describe, it, expect } from "vitest";
import { routeTask } from "../src/router/router.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";

const DEFAULT_MODELS = {
  discovery: "reasoning-high",
  planner: "reasoning-high",
  worker: "auto",
  critic: "reasoning-high",
  summarizer: "fast-reliable",
  documentation: "balanced",
};

describe("위험·capability 기반 라우터", () => {
  it("저위험 단순 작업: worker=auto 는 fast-reliable 로", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-001", { riskLevel: "low" });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    expect(rec.recommendedAlias).toBe("fast-reliable");
    expect(rec.resolved?.model).toBeTruthy();
  });

  it("중위험 작업: auto 는 balanced 로", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-002", { riskLevel: "medium" });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    expect(rec.recommendedAlias).toBe("balanced");
  });

  it("저복잡도 고위험 작업: auto 가 reasoning-high 로 escalate", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-003", { riskLevel: "high" });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    expect(rec.recommendedAlias).toBe("reasoning-high");
    expect(rec.reasons.join(" ")).toMatch(/auto-escalated/);
  });

  it("미해결 가정이 있으면 escalate (불확실성 escalation)", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-004", {
      riskLevel: "low",
      sections: { Assumptions: "사용자가 세션 기반 인증을 원한다고 가정" },
    });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    expect(rec.recommendedAlias).toBe("reasoning-high");
  });

  it("인증 작업: 승인 조건이 트리거되고 critic 은 하향되지 않는다", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-005", {
      riskLevel: "medium",
      riskReasons: ["touches-auth"],
      models: { critic: "fast-reliable" },
    });
    const rec = routeTask(parseTaskFile(file), "critic", DEFAULT_MODELS);
    expect(rec.approvalsRequired.some((a) => a.startsWith("auth-and-permissions"))).toBe(true);
    expect(rec.recommendedAlias).toBe("reasoning-high");
    expect(rec.reasons.join(" ")).toMatch(/escalated critic/);
  });

  it("작업 파일의 role 별 alias 지정이 우선한다", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-006", { riskLevel: "low", models: { worker: "balanced" } });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    expect(rec.recommendedAlias).toBe("balanced");
    expect(rec.reasons.join(" ")).toMatch(/task file pins/);
  });

  it("도구 capability: capabilities 요구가 해석에 반영된다", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-007", { riskLevel: "low", capabilities: ["deep-reasoning"] });
    const rec = routeTask(parseTaskFile(file), "worker", DEFAULT_MODELS);
    // fast-reliable 은 deep-reasoning 이 없고 fallback 도 없어 해석 실패가 기록된다
    expect(rec.resolved === null || rec.resolved.capabilities.includes("deep-reasoning")).toBe(true);
  });
});
