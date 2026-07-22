import { describe, it, expect } from "vitest";
import { allowedTransitions, assertTransition, isTerminal } from "../src/workflow/stateMachine.js";
import { preTaskGate, preCompleteGate } from "../src/workflow/gates.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { loadConfig } from "../src/config/loader.js";
import { makeTempProject, writeTask, writeRunRecord } from "./helpers.js";

describe("워크플로 상태 머신", () => {
  it("정상 전이: 표준 경로를 따른다", () => {
    expect(() => assertTransition("CAPTURED", "DISCOVERY")).not.toThrow();
    expect(() => assertTransition("READY", "PLANNED")).not.toThrow();
    expect(() => assertTransition("HUMAN_REVIEW", "DONE")).not.toThrow();
  });

  it("잘못된 전이: 단계 건너뛰기 거부", () => {
    expect(() => assertTransition("CAPTURED", "IMPLEMENTING")).toThrow(/Invalid workflow transition/);
    expect(() => assertTransition("READY", "DONE")).toThrow();
  });

  it("검증·비판 단계에서 구현/발견 단계로 회귀 가능", () => {
    expect(allowedTransitions("CRITIQUING")).toContain("IMPLEMENTING");
    expect(allowedTransitions("HUMAN_REVIEW")).toContain("DISCOVERY");
  });

  it("BLOCKED 에서 활성 단계로 복귀 가능", () => {
    expect(allowedTransitions("IMPLEMENTING")).toContain("BLOCKED");
    expect(allowedTransitions("BLOCKED")).toContain("IMPLEMENTING");
  });

  it("실패 후 재시도와 롤백", () => {
    expect(allowedTransitions("FAILED")).toContain("IMPLEMENTING");
    expect(allowedTransitions("FAILED")).toContain("ROLLED_BACK");
  });

  it("종결 상태: DONE 이후는 ROLLED_BACK 만, CANCELLED 는 전이 불가", () => {
    expect(isTerminal("DONE")).toBe(true);
    expect(allowedTransitions("DONE")).toEqual(["ROLLED_BACK"]);
    expect(allowedTransitions("CANCELLED")).toEqual([]);
  });
});

describe("pre-task 게이트", () => {
  function setup(taskOpts: Parameters<typeof writeTask>[2] = {}) {
    const root = makeTempProject({});
    const file = writeTask(root, "T-100", taskOpts);
    const config = loadConfig({ projectRoot: root });
    return { root, task: parseTaskFile(file), effective: config.effective };
  }

  it("READY 상태 + 필수 섹션 충족이면 통과", () => {
    const { root, task, effective } = setup();
    const report = preTaskGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(true);
  });

  it("CAPTURED 상태면 실패", () => {
    const { root, task, effective } = setup({ status: "CAPTURED" });
    const report = preTaskGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "status-ready")?.status).toBe("fail");
  });

  it("필수 섹션이 비어 있으면 실패", () => {
    const { root, task, effective } = setup({ sections: { Problem: "" } });
    const report = preTaskGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
  });

  it("승인 조건 트리거 시 needs-human 체크 포함", () => {
    const { root, task, effective } = setup({ riskReasons: ["deletes-data"] });
    const report = preTaskGate(task, { projectRoot: root, effective });
    expect(report.approvalsRequired).toContain("data-destruction");
    expect(report.checks.some((c) => c.status === "needs-human")).toBe(true);
  });
});

describe("pre-complete 게이트", () => {
  function setup(taskOpts: Parameters<typeof writeTask>[2] = {}) {
    const root = makeTempProject({});
    const file = writeTask(root, "T-200", { status: "HUMAN_REVIEW", ...taskOpts });
    const config = loadConfig({ projectRoot: root });
    return { root, task: parseTaskFile(file), effective: config.effective };
  }

  it("run record 없으면 실패", () => {
    const { root, task, effective } = setup();
    const report = preCompleteGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "run-record")?.status).toBe("fail");
  });

  it("완전한 run record 면 통과", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200");
    const report = preCompleteGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(true);
  });

  it("실패한 평가가 있으면 실패", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", {
      verification: { evaluations_run: [{ name: "test", level: 2, status: "fail" }], not_verified: [] },
    });
    const report = preCompleteGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
  });

  it("미해결 high/medium critic finding 이 있으면 실패", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", { critic_findings: { total: 3, open_high_or_medium: 1 } });
    const report = preCompleteGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
  });

  it("인간 승인 누락 시 실패 (reviewer_required)", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", { human_approval: undefined });
    const report = preCompleteGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "human-approval")?.status).toBe("fail");
  });

  it("design_profile 활성 시 렌더링 검증 기록이 없으면 실패", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const file = writeTask(root, "T-201", { status: "HUMAN_REVIEW" });
    writeRunRecord(root, "T-201"); // design 필드 없음
    const config = loadConfig({ projectRoot: root });
    const report = preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.checks.find((c) => c.id === "design-rendered-verification")?.status).toBe("fail");
  });

  it("렌더링 미수행이 명시되면 통과하되 인간 확인 표시", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const file = writeTask(root, "T-202", { status: "HUMAN_REVIEW" });
    writeRunRecord(root, "T-202", { design: { rendered_verification: false } });
    const config = loadConfig({ projectRoot: root });
    const report = preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.passed).toBe(true);
    expect(report.checks.find((c) => c.id === "design-not-rendered")?.status).toBe("needs-human");
  });
});
