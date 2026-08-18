import { describe, it, expect } from "vitest";
import { allowedTransitions, assertTransition, isTerminal } from "../src/workflow/stateMachine.js";
import { preTaskGate, preReviewGate, preCompleteGate } from "../src/workflow/gates.js";
import { parseTaskFile, transitionTask } from "../src/task/taskFile.js";
import { loadConfig } from "../src/config/loader.js";
import { makeTempProject, writeTask, writeRunRecord } from "./helpers.js";
import { recordRiskApproval } from "../src/task/approvalRecord.js";
import { recordFinalApproval } from "../src/task/runRecord.js";
import { evidenceEntryForFile } from "../src/task/runRecord.js";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { claimCapability, completeCapability } from "../src/task/capability.js";
import { finishAttempt, startAttempt } from "../src/task/events.js";

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

  it("누락 dependency와 독립 작업의 owned path 충돌을 차단", () => {
    const root = makeTempProject({});
    writeTask(root, "T-101", {
      coordination: { depends_on: ["MISSING-999"], owned_paths: ["src/shared"] },
    });
    const file = writeTask(root, "T-102", {
      coordination: { owned_paths: ["src/shared/component.ts"] },
    });
    const config = loadConfig({ projectRoot: root });
    const report = preTaskGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    const graph = report.checks.find((check) => check.id === "task-graph");
    expect(graph?.status).toBe("fail");
    expect(graph?.detail).toMatch(/overlaps/);
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

  it("run record v2의 실행 계약과 capability 완료 이벤트가 일치하면 통과한다", () => {
    const root = makeTempProject({});
    const file = writeTask(root, "T-206", { status: "ACTIVE", riskLevel: "medium" });
    const task = parseTaskFile(file);
    const config = loadConfig({ projectRoot: root });
    const plan = buildExecutionPlan(config, task);
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "bass-gate-capability-"));
    startAttempt({ projectRoot: root, task, plan });
    const claim = claimCapability({
      projectRoot: root,
      task,
      plan,
      config: config.bassYaml,
      capabilityCall: "ponytail:full",
      host: "codex",
      inspection: { homeDir: fakeHome, commandAvailable: (command) => command === "ponytail", active: new Set(["ponytail"]) },
    });
    completeCapability({
      projectRoot: root,
      task,
      plan,
      config: config.bassYaml,
      capabilityCall: "ponytail:full",
      host: "codex",
      status: "pass",
      summary: "provider result accepted",
    });
    finishAttempt({ projectRoot: root, task, plan, result: "pass", summary: "accepted" });
    transitionTask(root, "T-206", "REVIEW");
    writeRunRecord(root, "T-206", {
      record_version: 2,
      execution_contract: {
        contract_version: plan.contractVersion,
        plan_fingerprint: plan.planFingerprint,
        capability_calls: plan.capabilityCalls,
      },
      capability_invocations: [{
        call_id: claim.callId,
        attempt: 1,
        capability_call: "ponytail:full",
        host: "codex",
        status: "pass",
        summary: "provider result accepted",
      }],
    });

    const report = preCompleteGate(parseTaskFile(file), {
      projectRoot: root,
      effective: config.effective,
      executionPlan: plan,
    });
    expect(report.checks.find((check) => check.id === "execution-contract")?.status).toBe("pass");
    expect(report.checks.find((check) => check.id === "capability-invocations")?.status).toBe("pass");
    expect(report.passed).toBe(true);
  });

  it("run record v2가 현재 plan fingerprint와 다르면 완료를 차단한다", () => {
    const { root, task, effective } = setup();
    const config = loadConfig({ projectRoot: root });
    const plan = buildExecutionPlan(config, task);
    writeRunRecord(root, "T-200", {
      record_version: 2,
      execution_contract: {
        contract_version: 1,
        plan_fingerprint: "0".repeat(64),
        capability_calls: plan.capabilityCalls,
      },
    });
    const report = preCompleteGate(task, { projectRoot: root, effective, executionPlan: plan });
    expect(report.checks.find((check) => check.id === "execution-contract")?.status).toBe("fail");
    expect(report.checks.find((check) => check.id === "capability-invocations")?.status).toBe("fail");
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
    const file = writeTask(root, "T-201", { status: "HUMAN_REVIEW", config: { changed_surfaces: ["ui"] } });
    writeRunRecord(root, "T-201"); // design 필드 없음
    const config = loadConfig({ projectRoot: root });
    const report = preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.checks.find((c) => c.id === "design-rendered-verification")?.status).toBe("fail");
  });

  it("material UI에서 렌더링 미수행은 완료를 차단한다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const file = writeTask(root, "T-202", { status: "HUMAN_REVIEW", config: { changed_surfaces: ["ui"] } });
    writeRunRecord(root, "T-202", { design: { rendered_verification: false } });
    const config = loadConfig({ projectRoot: root });
    const report = preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === "design-rendered-verification")?.status).toBe("fail");
  });

  it("material UI의 실제 screenshot·viewport·console evidence가 있으면 통과한다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const file = writeTask(root, "T-204", { status: "HUMAN_REVIEW", config: { changed_surfaces: ["ui"] } });
    const evidenceDir = path.join(root, ".bass", "evidence", "T-204");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "desktop.png"), "png", "utf8");
    const screenshot = evidenceEntryForFile(root, "T-204", "screenshot", ".bass/evidence/T-204/desktop.png", "browser");
    writeRunRecord(root, "T-204", {
      evidence: [screenshot],
      design: {
        rendered_verification: true,
        environment: "local",
        evidence_paths: [screenshot.path],
        viewports: ["1440x900"],
        console_errors: 0,
      },
    });
    const config = loadConfig({ projectRoot: root });
    expect(preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective }).passed).toBe(true);
  });

  it("0.3 run record는 기존 렌더링 기록 계약으로 계속 읽는다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const file = writeTask(root, "T-205", { status: "HUMAN_REVIEW" });
    writeRunRecord(root, "T-205", { record_version: 0, design: { rendered_verification: false } });
    const config = loadConfig({ projectRoot: root });
    const report = preCompleteGate(parseTaskFile(file), { projectRoot: root, effective: config.effective });
    expect(report.passed).toBe(true);
    expect(report.checks.find((c) => c.id === "design-not-rendered")?.status).toBe("needs-human");
  });

  it("필수 evidence 종류가 없으면 완료를 차단", () => {
    const { root, task, effective } = setup({ loop: { required_evidence: ["test-output"] } });
    writeRunRecord(root, "T-200");
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "evidence-manifest");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("missing kind: test-output");
  });

  it("evidence 파일이 생성 뒤 바뀌면 SHA-256 불일치로 차단", () => {
    const { root, task, effective } = setup();
    const evidenceDir = path.join(root, ".bass", "evidence", "T-200");
    fs.mkdirSync(evidenceDir, { recursive: true });
    const evidencePath = path.join(evidenceDir, "test.log");
    fs.writeFileSync(evidencePath, "passed", "utf8");
    const entry = evidenceEntryForFile(root, "T-200", "test-output", ".bass/evidence/T-200/test.log", "vitest");
    fs.writeFileSync(evidencePath, "tampered", "utf8");
    writeRunRecord(root, "T-200", { evidence: [entry] });
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "evidence-manifest");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("checksum mismatch");
  });

  it("사용한 context가 이후 변경되면 stale 상태로 차단", () => {
    const { root, task, effective } = setup();
    const productPath = path.join(root, "PRODUCT.md");
    fs.writeFileSync(productPath, "# Product\n\nOriginal", "utf8");
    const sha256 = createHash("sha256").update(fs.readFileSync(productPath)).digest("hex");
    fs.writeFileSync(productPath, "# Product\n\nChanged", "utf8");
    writeRunRecord(root, "T-200", {
      context: { sources: [{ path: "PRODUCT.md", sha256, chars: 20 }], total_chars: 20, omitted: [] },
    });
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "context-freshness");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("context changed after use");
  });

  it("Allowed/Forbidden 범위를 벗어난 실제 변경 기록을 차단", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", {
      files_changed: ["docs/secret.md"],
      scope: { actual_files: ["docs/secret.md"], outside_allowed: [], forbidden_touched: [] },
    });
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "scope-diff");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toMatch(/outside allowed scope|forbidden scope touched/);
  });

  it("git working tree의 미기록 변경 파일을 실제 diff 불일치로 차단", () => {
    const { root, task, effective } = setup();
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    fs.writeFileSync(path.join(root, "src", "unrecorded.ts"), "export const changed = true;\n", "utf8");
    writeRunRecord(root, "T-200");
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "scope-diff");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("unrecorded git change: src/unrecorded.ts");
  });

  it("완전히 새 중첩 디렉터리도 접힌 폴더명이 아닌 실제 파일 단위로 비교", () => {
    const { root, task, effective } = setup();
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "a.ts"), "export {};\n", "utf8");
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=BASS", "-c", "user.email=bass@example.invalid", "commit", "-qm", "baseline"], { cwd: root }).status).toBe(0);
    fs.mkdirSync(path.join(root, "new-dir", "nested"), { recursive: true });
    fs.writeFileSync(path.join(root, "new-dir", "nested", "file.ts"), "export {};\n", "utf8");
    writeRunRecord(root, "T-200");
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "scope-diff");
    expect(check?.detail).toContain("unrecorded git change: new-dir/nested/file.ts");
  });

  it("rename은 원본 삭제와 대상 추가를 모두 실제 변경 범위로 검사", () => {
    const { root, task, effective } = setup();
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "old.ts"), "export const renamed = true;\n", "utf8");
    expect(spawnSync("git", ["init", "-q"], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["add", "."], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["-c", "user.name=BASS", "-c", "user.email=bass@example.invalid", "commit", "-qm", "baseline"], { cwd: root }).status).toBe(0);
    expect(spawnSync("git", ["mv", "src/old.ts", "src/new.ts"], { cwd: root }).status).toBe(0);
    writeRunRecord(root, "T-200", {
      files_changed: ["src/new.ts", "src/old.ts"],
      scope: { actual_files: ["src/new.ts", "src/old.ts"], outside_allowed: [], forbidden_touched: [] },
    });
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "scope-diff");
    expect(check?.status).toBe("pass");
  });

  it("모델 권고를 따르지 않았으면 구체적 이유를 요구", () => {
    const { root, task, effective } = setup();
    writeRunRecord(root, "T-200", {
      models_used: [{ role: "worker", alias: "custom", followed_recommendation: false }],
    });
    const check = preCompleteGate(task, { projectRoot: root, effective }).checks.find((item) => item.id === "model-deviation-reasons");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toBe("worker");
  });
});
