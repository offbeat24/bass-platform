import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ExecutionPlan, GateCheck, GateReport } from "../types.js";
import { checkSections, countActiveTasks, listTasks, TASK_SECTIONS, type TaskFile } from "../task/taskFile.js";
import { loadRunRecord, verifyContextSources, verifyEvidenceEntries } from "../task/runRecord.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { loadRiskApprovals } from "../task/approvalRecord.js";
import { normalizeWorkflowState } from "./stateMachine.js";
import { buildTaskGraph } from "../task/taskGraph.js";
import { inferChangedSurfaces } from "../execution/planner.js";
import { normalizeEventSummary, readEvents } from "../task/events.js";
import { capabilityCallId } from "../task/capability.js";
import { providerForCapabilityCall } from "../project/providerCatalog.js";

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
  executionPlan?: ExecutionPlan;
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

  const graph = buildTaskGraph(listTasks(ctx.projectRoot));
  const graphIssues = graph.issues.filter((issue) => issue.taskIds.includes(fm.id));
  const graphNode = graph.nodes.find((node) => node.id === fm.id);
  checks.push({
    id: "task-graph",
    description: "task dependency와 owned path 계약이 유효하다",
    status: graphIssues.length === 0 && (graphNode?.blockedBy.length ?? 0) === 0 ? "pass" : "fail",
    detail: graphIssues.length > 0
      ? graphIssues.map((issue) => issue.detail).join("; ")
      : graphNode?.blockedBy.length
        ? `blocked by: ${graphNode.blockedBy.join(", ")}`
        : undefined,
  });

  const workflow = (ctx.effective["workflow"] ?? {}) as Record<string, unknown>;
  const maxActive = ctx.executionPlan?.parallel.maxAgents ?? Number(workflow["max_active_tasks"] ?? 1);
  const active = countActiveTasks(ctx.projectRoot);
  const alreadyActive = normalizeWorkflowState(fm.status) === "ACTIVE";
  checks.push({
    id: "active-task-limit",
    description: `동시 활성 작업 수 제한 (max ${maxActive})`,
    status: (alreadyActive ? active <= maxActive : active < maxActive) ? "pass" : "fail",
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

  if (record.record_version >= 2) {
    const contractIssues: string[] = [];
    if (!ctx.executionPlan) {
      contractIssues.push("current ExecutionPlan is unavailable");
    } else if (!record.execution_contract) {
      contractIssues.push("execution_contract is missing");
    } else {
      if (record.execution_contract.contract_version !== ctx.executionPlan.contractVersion) {
        contractIssues.push("contract_version differs from the current plan");
      }
      if (record.execution_contract.plan_fingerprint !== ctx.executionPlan.planFingerprint) {
        contractIssues.push("plan_fingerprint differs from the current plan");
      }
      if (JSON.stringify(record.execution_contract.capability_calls) !== JSON.stringify(ctx.executionPlan.capabilityCalls)) {
        contractIssues.push("capability_calls differ from the current plan");
      }
    }
    checks.push({
      id: "execution-contract",
      description: "run record가 현재 정규화된 ExecutionPlan 계약과 일치한다",
      status: contractIssues.length === 0 ? "pass" : "fail",
      detail: contractIssues.join("; ") || undefined,
    });

    const invocationIssues: string[] = [];
    if (!ctx.executionPlan) {
      invocationIssues.push("current ExecutionPlan is unavailable");
    } else {
      const plannedExternal = ctx.executionPlan.capabilityCalls.filter(
        (capabilityCall) => providerForCapabilityCall(capabilityCall) !== null,
      );
      const completionEvents = readEvents(ctx.projectRoot).events.filter(
        (event) => event.task_id === fm.id && event.kind === "capability.completed",
      );
      const seen = new Set<string>();
      for (const invocation of record.capability_invocations) {
        if (seen.has(invocation.call_id)) invocationIssues.push(`duplicate call_id: ${invocation.call_id}`);
        seen.add(invocation.call_id);
        if (!plannedExternal.includes(invocation.capability_call)) {
          invocationIssues.push(`not in current plan: ${invocation.capability_call}`);
        }
        if (invocation.evidence_path && !record.evidence.some((entry) => entry.path === invocation.evidence_path)) {
          invocationIssues.push(`evidence not in manifest: ${invocation.evidence_path}`);
        }
        const expectedId = capabilityCallId(
          ctx.executionPlan.planFingerprint,
          fm.id,
          invocation.attempt,
          invocation.capability_call,
        );
        if (invocation.call_id !== expectedId) invocationIssues.push(`invalid call_id: ${invocation.capability_call}`);
        const event = completionEvents.find((candidate) => candidate.call_id === invocation.call_id);
        if (!event) {
          invocationIssues.push(`completion event missing: ${invocation.capability_call}`);
          continue;
        }
        if (
          event.capability_call !== invocation.capability_call
          || event.host !== invocation.host
          || event.status !== invocation.status
          || event.summary !== normalizeEventSummary(invocation.summary)
          || event.evidence_path !== invocation.evidence_path
        ) {
          invocationIssues.push(`record/event mismatch: ${invocation.capability_call}`);
        }
      }
      for (const capabilityCall of plannedExternal) {
        const latest = record.capability_invocations
          .filter((invocation) => invocation.capability_call === capabilityCall)
          .sort((left, right) => right.attempt - left.attempt)[0];
        if (!latest) invocationIssues.push(`missing invocation: ${capabilityCall}`);
        else if (latest.status !== "pass" && latest.status !== "skipped") {
          invocationIssues.push(`latest invocation did not complete successfully: ${capabilityCall}`);
        }
      }
    }
    checks.push({
      id: "capability-invocations",
      description: "외부 capability 호출이 이벤트와 일치하고 최신 시도가 완료되었다",
      status: invocationIssues.length === 0 ? "pass" : "fail",
      detail: invocationIssues.join("; ") || undefined,
    });
  }

  const failed = record.verification.evaluations_run.filter((e) => e.status === "fail" || e.status === "error" || e.status === "timeout");
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

  if (record.record_version >= 1) {
    const evidenceIssues = verifyEvidenceEntries(ctx.projectRoot, fm.id, record.evidence);
    const requiredEvidence = fm.loop.required_evidence;
    const missingEvidence = requiredEvidence.filter((kind) => !record.evidence.some((entry) => entry.kind === kind));
    checks.push({
      id: "evidence-manifest",
      description: "evidence 경로와 SHA-256이 유효하고 필수 종류가 존재한다",
      status: evidenceIssues.length === 0 && missingEvidence.length === 0 ? "pass" : "fail",
      detail: [...evidenceIssues, ...missingEvidence.map((kind) => `missing kind: ${kind}`)].join("; ") || undefined,
    });

    const contextIssues = verifyContextSources(ctx.projectRoot, record.context.sources);
    checks.push({
      id: "context-freshness",
      description: "사용한 컨텍스트가 실행 후 변경되지 않았다",
      status: contextIssues.length === 0 ? "pass" : "fail",
      detail: contextIssues.join("; ") || undefined,
    });

    const scope = evaluateScope(task, record.files_changed, record.scope.actual_files, gitChangedFiles(ctx.projectRoot));
    checks.push({
      id: "scope-diff",
      description: "실제 변경이 run record와 Allowed/Forbidden scope에 일치한다",
      status: scope.issues.length === 0
        && record.scope.outside_allowed.length === 0
        && record.scope.forbidden_touched.length === 0
        ? "pass"
        : "fail",
      detail: [
        ...scope.issues,
        ...record.scope.outside_allowed.map((file) => `recorded outside allowed: ${file}`),
        ...record.scope.forbidden_touched.map((file) => `recorded forbidden: ${file}`),
      ].join("; ") || undefined,
    });

    const eventAttempts = readEvents(ctx.projectRoot).events.filter(
      (event) => event.task_id === fm.id && event.kind === "attempt.started",
    ).length;
    const attemptsMatch = eventAttempts === 0 || eventAttempts === record.attempts.length;
    const latestAttempt = record.attempts.at(-1);
    const maxAttempts = ctx.executionPlan?.loop.maxAttempts ?? fm.loop.max_attempts ?? Number.POSITIVE_INFINITY;
    checks.push({
      id: "attempt-lineage",
      description: "시도 이력과 최종 결과가 일관되고 예산 이내다",
      status: record.attempts.length > 0
        && attemptsMatch
        && record.attempts.length <= maxAttempts
        && latestAttempt?.status === "pass"
        ? "pass"
        : "fail",
      detail: !attemptsMatch
        ? `events=${eventAttempts}, record=${record.attempts.length}`
        : latestAttempt && latestAttempt.status !== "pass"
          ? `latest attempt status: ${latestAttempt.status}`
          : undefined,
    });

    const missingModelReasons = record.models_used.filter(
      (model) => model.followed_recommendation === false && !model.reason?.trim(),
    );
    checks.push({
      id: "model-deviation-reasons",
      description: "모델 라우팅 권고를 벗어난 경우 이유가 기록됨",
      status: missingModelReasons.length === 0 ? "pass" : "fail",
      detail: missingModelReasons.map((model) => model.role).join(", ") || undefined,
    });
  }

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

  // Material UI는 실제 렌더링·viewport·console·evidence를 요구한다.
  const designProfile = Boolean(ctx.effective["design_profile"]);
  const materialUi = inferChangedSurfaces(task).includes("ui");
  if (record.record_version >= 1 && materialUi) {
    const design = record.design;
    const evidencePaths = new Set(record.evidence.map((entry) => entry.path));
    const missingPaths = design?.evidence_paths.filter((evidencePath) => !evidencePaths.has(evidencePath)) ?? [];
    const valid = Boolean(
      design?.rendered_verification
      && design.evidence_paths.length > 0
      && design.viewports.length > 0
      && design.console_errors === 0
      && missingPaths.length === 0,
    );
    checks.push({
      id: "design-rendered-verification",
      description: "material UI의 screenshot, viewport, console evidence가 유효하다",
      status: valid ? "pass" : "fail",
      detail: valid
        ? `${design!.viewports.join(", ")}; evidence=${design!.evidence_paths.length}; console_errors=0`
        : `rendered=${design?.rendered_verification ?? false}; evidence=${design?.evidence_paths.length ?? 0}; viewports=${design?.viewports.length ?? 0}; console_errors=${design?.console_errors ?? "missing"}${missingPaths.length ? `; unlisted=${missingPaths.join(",")}` : ""}`,
    });
  } else if (record.record_version === 0 && designProfile) {
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

function evaluateScope(
  task: TaskFile,
  recordedFiles: string[],
  actualFiles: string[],
  gitFiles: string[] | null,
): { issues: string[] } {
  const allowed = scopePaths(task.sections.get("Allowed scope") ?? "");
  const forbidden = scopePaths(task.sections.get("Forbidden scope") ?? "");
  const recorded = uniquePaths(recordedFiles);
  const actual = uniquePaths(actualFiles);
  const issues: string[] = [];
  if (allowed.length === 0) issues.push("Allowed scope has no literal project-relative paths");
  if (!samePaths(recorded, actual)) issues.push(`files_changed and scope.actual_files differ`);
  for (const file of actual) {
    if (allowed.length > 0 && !allowed.some((scope) => pathMatches(file, scope))) issues.push(`outside allowed scope: ${file}`);
    if (forbidden.some((scope) => pathMatches(file, scope))) issues.push(`forbidden scope touched: ${file}`);
  }
  if (gitFiles && gitFiles.length > 0) {
    for (const file of gitFiles.filter((item) => !item.startsWith(".bass/"))) {
      if (!actual.includes(file)) issues.push(`unrecorded git change: ${file}`);
    }
  }
  return { issues };
}

function scopePaths(value: string): string[] {
  return value
    .split(/[\r\n,]/)
    .map((line) => line.trim().replace(/^[-*]\s*/, "").replace(/^`|`$/g, ""))
    .filter((line) => line.length > 0 && !path.isAbsolute(line) && !line.replace(/\\/g, "/").split("/").includes(".."))
    .filter((line) => line.startsWith(".") || line.includes("/") || /\.[a-z0-9]{1,8}$/i.test(line))
    .map(normalizePath);
}

function pathMatches(file: string, scope: string): boolean {
  return scope === "" || file === scope || file.startsWith(`${scope}/`);
}

function uniquePaths(values: string[]): string[] {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort();
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}

function samePaths(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function gitChangedFiles(projectRoot: string): string[] | null {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"], { cwd: projectRoot, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter(Boolean)
    .map(normalizePath)
    .sort();
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
