import type { Capability, ModelRole, RouteRecommendation } from "../types.js";
import type { TaskFile } from "../task/taskFile.js";
import { loadRegistry, resolveAlias, type ModelRegistry } from "../registry/registry.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";

/**
 * 위험·capability 기반 라우팅 (Core 프롬프트 §9).
 *
 * BASS는 모델을 직접 호출하지 않으므로 이 라우터의 산출물은 "권고 + 이유"다.
 * 실행 주체(Codex/Cursor/Claude 세션)가 권고를 따르거나, 다른 선택을 하면
 * 그 사실을 run record 에 남긴다.
 */
export function routeTask(
  task: TaskFile,
  role: ModelRole,
  effectiveModels: Record<string, string>,
  registry: ModelRegistry = loadRegistry(),
): RouteRecommendation {
  const fm = task.frontmatter;
  const reasons: string[] = [];

  // 1. 작업 파일에 role 별 alias 가 명시되면 그것이 우선
  let alias = fm.models?.[role] ?? effectiveModels[role];
  if (fm.models?.[role]) {
    reasons.push(`task file pins ${role} to "${alias}"`);
  } else if (alias) {
    reasons.push(`effective config maps ${role} to "${alias}"`);
  }

  // 2. "auto" 는 위험도로 결정
  if (alias === "auto" || !alias) {
    const escalate =
      fm.risk.level === "high" ||
      fm.risk.level === "critical" ||
      // 요구사항 불확실성: Assumptions 섹션에 미해결 항목이 남은 경우
      hasOpenAssumptions(task);
    if (escalate) {
      alias = "reasoning-high";
      reasons.push(
        `auto-escalated: risk.level=${fm.risk.level}` +
          (hasOpenAssumptions(task) ? ", open assumptions present" : ""),
      );
    } else if (fm.risk.level === "medium") {
      alias = "balanced";
      reasons.push("auto: medium risk -> balanced");
    } else {
      alias = "fast-reliable";
      reasons.push("auto: low risk, mechanically verifiable -> fast-reliable");
    }
  }

  // 3. 위험 이유가 승인 정책에 걸리면 critic/planner 를 저사양으로 낮추지 않는다
  const approvals = findRequiredApprovals(fm);
  if (approvals.length > 0 && (role === "critic" || role === "planner" || role === "discovery")) {
    if (alias === "fast-reliable" || alias === "balanced") {
      reasons.push(
        `escalated ${role} to reasoning-high: approval-gated risks (${approvals
          .map((a) => a.rule.id)
          .join(", ")})`,
      );
      alias = "reasoning-high";
    }
  }

  const required = (fm.capabilities ?? []) as Capability[];
  let resolved = null;
  try {
    resolved = resolveAlias(registry, alias, { requiredCapabilities: required });
    if (resolved.fallbackChain.length > 0) {
      reasons.push(`capability fallback: ${resolved.fallbackChain.join(" -> ")}`);
    }
  } catch (err) {
    reasons.push(`resolution failed: ${(err as Error).message}`);
  }

  return {
    taskId: fm.id,
    role,
    recommendedAlias: alias,
    resolved,
    riskLevel: fm.risk.level,
    reasons,
    approvalsRequired: approvals.map((a) => `${a.rule.id}: ${a.rule.description}`),
  };
}

function hasOpenAssumptions(task: TaskFile): boolean {
  const content = task.sections.get("Assumptions") ?? "";
  // 비어 있지 않고 "none" 표기가 아니면 미해결 가정이 있다고 본다
  const normalized = content.trim().toLowerCase();
  return normalized.length > 0 && !["none", "없음", "n/a", "-"].includes(normalized);
}
