import { describe, it, expect } from "vitest";
import { allowedTransitions, assertTransition, isTerminal } from "../src/workflow/stateMachine.js";
import { preTaskGate, preReviewGate, preCompleteGate } from "../src/workflow/gates.js";
import { parseTaskFile, transitionTask } from "../src/task/taskFile.js";
import { loadConfig } from "../src/config/loader.js";
import { makeTempProject, writeTask, writeRunRecord } from "./helpers.js";
import { recordRiskApproval } from "../src/task/approvalRecord.js";
import { recordFinalApproval } from "../src/task/runRecord.js";

describe("워크플로 상태 머신", () => {
  it("정상 전이: 표준 경로를 따른다", () => {
    expect(() => assertTransition("CAPTURED", "ACTIVE")).not.toThrow();
    expect(() => assertTransition("ACTIVE", "REVIEW")).not.toThrow();
    expect(() => assertTransition("REVIEW", "DONE")).not.toThrow();
  });

  it("잘못된 전이: 단계 건너뛰기 거부", () => {
    expect(() => assertTransition("CAPTURED", "REVIEW")).toThrow(/Invalid workflow transition/);
    expect(() => assertTransition("ACTIVE", "DONE")).toThrow();
  });

  it("0.2 검증·비판 상태를 ACTIVE로 해석하고 범위 재정의 시 CAPTURED로 회귀", () => {
    expect(allowedTransitions("CRITIQUING")).toContain("REVIEW");
    expect(allowedTransitions("CRITIQUING")).toContain("CAPTURED");
    expect(allowedTransitions("HUMAN_REVIEW")).toContain("CAPTURED");
  });

  it("BLOCKED 에서 활성 단계로 복귀 가능", () => {
    expect(allowedTransitions("IMPLEMENTING")).toContain("BLOCKED");
    expect(allowedTransitions("BLOCKED")).toContain("ACTIVE");
  });

  it("실패 후 재시도와 롤백", () => {
    expect(allowedTransitions("FAILED")).toContain("ACTIVE");
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

  it("BLOCKED 상태면 실패", () => {
    const { root, task, effective } = setup({ status: "BLOCKED" });
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
    expect(report.passed).toBe(false);
    expect(report.approvalsRequired).toContain("data-destruction");
    expect(report.checks.some((c) => c.status === "needs-human")).toBe(true);
  });

  it("명시적 위험 승인 기록 후 통과하고 재기록은 no-op", () => {
    const { root, task, effective } = setup({ riskReasons: ["deletes-data"] });
    const first = recordRiskApproval({
      projectRoot: root,
      taskId: "T-100",
      ruleId: "data-destruction",
      decision: "approved",
      approver: "owner",
      reason: "백업과 복구 절차 확인",
    });
    const second = recordRiskApproval({
      projectRoot: root,
      taskId: "T-100",
      ruleId: "data-destruction",
      decision: "approved",
      approver: "owner",
      reason: "백업과 복구 절차 확인",
    });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const report = preTaskGate(task, { projectRoot: root, effective });
    expect(report.passed).toBe(true);
  });
});

describe("에이전트 내부 상태 전이", () => {
  it("정상 전이는 기록하고 같은 전이는 멱등 no-op", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-150", { status: "CAPTURED" });
    expect(transitionTask(root, "T-150", "ACTIVE").changed).toBe(true);
    expect(transitionTask(root, "T-150", "ACTIVE").changed).toBe(false);
    expect(parseTaskFile(file).frontmatter.status).toBe("ACTIVE");
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

  it("pre-review 는 최종 승인 전에 검증 근거만 검사", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-203", { status: "CRITIQUING" });
    writeRunRecord(root, "T-203", { human_approval: undefined });
    const config = loadConfig({ projectRoot: root });
    const report = preReviewGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.passed).toBe(true);
    expect(report.checks.some((c) => c.id === "human-approval")).toBe(false);
  });

  it("최종 승인 기록은 멱등하고 pre-complete 를 통과시킨다", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", { human_approval: undefined });
    expect(recordFinalApproval(root, "T-200", "owner", "결과 확인").changed).toBe(true);
    expect(recordFinalApproval(root, "T-200", "owner", "결과 확인").changed).toBe(false);
    expect(preCompleteGate(task, { projectRoot: root, effective }).passed).toBe(true);
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
