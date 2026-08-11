import fs from "node:fs";
import path from "node:path";
import type { GateCheck, GateReport } from "../types.js";
import { checkSections, countActiveTasks, TASK_SECTIONS, type TaskFile } from "../task/taskFile.js";
import { loadRunRecord } from "../task/runRecord.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { loadRiskApprovals } from "../task/approvalRecord.js";
import { normalizeWorkflowState } from "./stateMachine.js";

/** CAPTURED 상태에서 ACTIVE로 들어가기 전에 필요한 최소 작업 계약. */
const CAPTURED_SECTIONS = [
  "Problem",
  "What we are shipping",
  "What we are not shipping",
  "Acceptance criteria",
  "Relevant context",
  "Verification",
  "Rollback",
] as const;

export interface GateContext {
  projectRoot: string;
  effective: Record<string, unknown>;
}

/**
 * pre-task: 작업을 시작해도 되는가.
 * COL harness.py pre-task 패턴의 일반화 (KEEP).
 */
export function preTaskGate(task: TaskFile, ctx: GateContext): GateReport {
  const checks: GateCheck[] = [];
  const fm = task.frontmatter;

  checks.push({
    id: "status-ready",
    description: "작업 상태가 CAPTURED 또는 ACTIVE여야 한다",
    status: ["CAPTURED", "ACTIVE"].includes(normalizeWorkflowState(fm.status)) ? "pass" : "fail",
    detail: `current status: ${fm.status}`,
  });

  for (const c of checkSections(task, CAPTURED_SECTIONS)) {
    checks.push({
      id: `section:${c.section}`,
      description: `"${c.section}" 섹션 존재 및 내용`,
      status: c.present && c.nonEmpty ? "pass" : "fail",
      detail: c.present ? (c.nonEmpty ? undefined : "section is empty") : "section missing",
    });
  }

  // 알 수 없는 섹션 경고 (오타 방지)
  for (const name of task.sections.keys()) {
    if (!(TASK_SECTIONS as readonly string[]).includes(name)) {
      checks.push({
        id: `unknown-section:${name}`,
        description: `표준 외 섹션 "${name}"`,
        status: "warn",
      });
    }
  }

  const workflow = (ctx.effective["workflow"] ?? {}) as Record<string, unknown>;
  const maxActive = Number(workflow["max_active_tasks"] ?? 1);
  const active = countActiveTasks(ctx.projectRoot);
  checks.push({
    id: "active-task-limit",
    description: `동시 활성 작업 수 제한 (max ${maxActive})`,
    status: active <= maxActive ? "pass" : "fail",
    detail: `active tasks: ${active}`,
  });

  const approvals = findRequiredApprovals(fm);
  const recordedApprovals = loadRiskApprovals(ctx.projectRoot, fm.id);
  const unresolvedApprovals: string[] = [];
  for (const a of approvals) {
    const recorded = recordedApprovals.find((entry) => entry.rule_id === a.rule.id);
    if (!recorded) unresolvedApprovals.push(a.rule.id);
    checks.push({
      id: `approval:${a.rule.id}`,
      description: a.rule.description,
      status: !recorded ? "needs-human" : recorded.decision === "approved" ? "pass" : "fail",
      detail: !recorded
        ? `triggered by ${a.matchedBy.join("; ")}`
        : `${recorded.decision} by ${recorded.approver}: ${recorded.reason}`,
    });
  }

  // 미해결 가정이 있으면 인간 확인 대상으로 표시
  const assumptions = (task.sections.get("Assumptions") ?? "").trim().toLowerCase();
  if (assumptions.length > 0 && !["none", "없음", "n/a", "-"].includes(assumptions)) {
    checks.push({
      id: "open-assumptions",
      description: "미해결 가정이 남아 있다. 사실 확인 또는 인간 결정 필요",
      status: "warn",
      detail: task.sections.get("Assumptions")!.slice(0, 200),
    });
  }

  return buildReport("pre-task", fm.id, checks, unresolvedApprovals);
}

/**
 * 인간에게 결과를 보여주기 전에 실행하는 준비 상태 검사.
 * 최종 승인 자체는 요구하지 않고, 검증 근거와 미해결 인간 판단 항목을 모은다.
 */
export function preReviewGate(task: TaskFile, ctx: GateContext): GateReport {
  const completion = preCompleteGate(task, ctx);
  const checks = completion.checks.filter(
    (check) => check.id !== "status-review" && check.id !== "human-approval",
  );
  checks.unshift({
    id: "status-review-ready",
    description: "인간 리뷰 준비는 ACTIVE 또는 REVIEW 상태에서 가능하다",
    status: ["ACTIVE", "REVIEW"].includes(normalizeWorkflowState(task.frontmatter.status)) ? "pass" : "fail",
    detail: `current status: ${task.frontmatter.status}`,
  });
  return buildReport("pre-review", task.frontmatter.id, checks, []);
}

/**
 * pre-complete: DONE 처리해도 되는가 (Core 프롬프트 §13 DONE 조건).
 * run record 없이는 통과할 수 없다.
 */
export function preCompleteGate(task: TaskFile, ctx: GateContext): GateReport {
  const checks: GateCheck[] = [];
  const fm = task.frontmatter;

  checks.push({
    id: "status-review",
    description: "완료 처리는 REVIEW 상태에서만 가능하다",
    status: normalizeWorkflowState(fm.status) === "REVIEW" ? "pass" : "fail",
    detail: `current status: ${fm.status}`,
  });

  const record = loadRunRecord(ctx.projectRoot, fm.id);
  if (!record) {
    checks.push({
      id: "run-record",
      description: `run record 존재 (.bass/records/${fm.id}.json)`,
      status: "fail",
      detail: "run record not found — 완료 근거 없이 DONE 처리할 수 없다",
    });
    return buildReport("pre-complete", fm.id, checks, []);
  }
  checks.push({ id: "run-record", description: "run record 존재 및 스키마 유효", status: "pass" });

  const failed = record.verification.evaluations_run.filter((e) => e.status === "fail" || e.status === "error");
  checks.push({
    id: "evaluations",
    description: "요구된 검증 통과",
    status: failed.length === 0 && record.verification.evaluations_run.length > 0 ? "pass" : "fail",
    detail:
      record.verification.evaluations_run.length === 0
        ? "no evaluations were run"
        : failed.length > 0
          ? `failing: ${failed.map((f) => f.name).join(", ")}`
          : undefined,
  });

  if (record.verification.not_verified.length > 0) {
    checks.push({
      id: "not-verified",
      description: "검증되지 않은 항목이 명시됨 (인간 판단 대상)",
      status: "needs-human",
      detail: record.verification.not_verified.join("; "),
    });
  }

  checks.push({
    id: "critic-findings",
    description: "미해결 high/medium critic finding 없음",
    status: record.critic_findings.open_high_or_medium === 0 ? "pass" : "fail",
    detail: `open high/medium: ${record.critic_findings.open_high_or_medium}`,
  });

  const workflow = (ctx.effective["workflow"] ?? {}) as Record<string, unknown>;
  const reviewerRequired = Boolean(workflow["reviewer_required"] ?? true) || fm.human.reviewer_required;
  if (reviewerRequired) {
    checks.push({
      id: "human-approval",
      description: "인간 승인 기록",
      status: record.human_approval?.approved ? "pass" : "fail",
      detail: record.human_approval
        ? `approver: ${record.human_approval.approver} at ${record.human_approval.at}`
        : "human_approval missing in run record",
    });
  }

  checks.push({
    id: "docs-updated",
    description: "문서 변경 필요 여부 확인",
    status: !record.docs_updated.needed || record.docs_updated.updated.length > 0 ? "pass" : "fail",
    detail: record.docs_updated.needed ? `updated: ${record.docs_updated.updated.join(", ") || "(none)"}` : "no doc changes needed",
  });

  checks.push({
    id: "rollback",
    description: "롤백 또는 복구 방법 기록",
    status: record.rollback.method.trim().length > 0 ? "pass" : "fail",
  });

  // Design Profile 활성 시: 렌더링 검증 여부 기록 강제 (검증 자체가 아니라 "기록"을 강제)
  const designProfile = Boolean(ctx.effective["design_profile"]);
  if (designProfile) {
    checks.push({
      id: "design-rendered-verification",
      description: "렌더링 검증 수행 여부가 기록됨 (Design 프롬프트 §12)",
      status: record.design !== undefined ? "pass" : "fail",
      detail:
        record.design === undefined
          ? "run record 에 design.rendered_verification 기록 없음"
          : record.design.rendered_verification
            ? `rendered in: ${record.design.environment ?? "unspecified"}`
            : "렌더링하지 않음이 명시됨 — 인간 검토 시 참고",
    });
    if (record.design && !record.design.rendered_verification) {
      checks.push({
        id: "design-not-rendered",
        description: "렌더링 미수행 UI — 시각적 검증 완료로 표현 금지",
        status: "needs-human",
      });
    }
  }

  // 교훈: 강제하지 않되 판단 흔적을 요구
  checks.push({
    id: "lessons",
    description: "교훈 기록 여부 판단됨",
    status: "pass",
    detail: record.lessons.recorded
      ? `candidates: ${record.lessons.candidates.length}`
      : "no lessons recorded (judged not needed)",
  });

  return buildReport("pre-complete", fm.id, checks, []);
}

function buildReport(
  gate: "pre-task" | "pre-review" | "pre-complete",
  taskId: string,
  checks: GateCheck[],
  approvalsRequired: string[],
): GateReport {
  return {
    gate,
    taskId,
    passed:
      checks.every((c) => c.status !== "fail") &&
      (gate !== "pre-task" || checks.every((c) => c.status !== "needs-human")),
    checks,
    approvalsRequired,
  };
}

/** 게이트 리포트를 사람이 읽는 텍스트로 변환 */
export function formatGateReport(report: GateReport): string {
  const lines: string[] = [];
  const symbol = { pass: "PASS", fail: "FAIL", warn: "WARN", "needs-human": "HUMAN" } as const;
  lines.push(`[bass gate ${report.gate}] task=${report.taskId} => ${report.passed ? "PASSED" : "FAILED"}`);
  for (const c of report.checks) {
    lines.push(`  [${symbol[c.status]}] ${c.id} — ${c.description}${c.detail ? ` (${c.detail})` : ""}`);
  }
  if (report.approvalsRequired.length > 0) {
    lines.push(`  human approvals required: ${report.approvalsRequired.join(", ")}`);
  }
  return lines.join("\n");
}
