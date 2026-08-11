import fs from "node:fs";
import path from "node:path";
import type { LoadedConfig } from "../config/loader.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { loadRiskApprovals } from "../task/approvalRecord.js";
import { allowedTransitions } from "../workflow/stateMachine.js";
import type { TaskFile } from "../task/taskFile.js";
import { buildExecutionPlan } from "../execution/planner.js";
import { normalizeWorkflowState } from "../workflow/stateMachine.js";
import type { ExecutionPlan } from "../types.js";

export interface AgentGuide {
  contract: {
    user_interface: "natural-language";
    cli_operator: "ai-agent";
    goal: string;
  };
  project: {
    root: string;
    name: string;
    profiles: string[];
    design_profile: boolean;
    design_spec: "ready" | "missing" | "template";
  };
  operating_rules: string[];
  execution_plan: ExecutionPlan;
  task?: {
    id: string;
    status: string;
    workflow_depth: string;
    allowed_transitions: string[];
    unresolved_human_decisions: string[];
    suggested_next_actions: string[];
  };
}

export function buildAgentGuide(
  projectRoot: string,
  config: LoadedConfig,
  task?: TaskFile,
): AgentGuide {
  const designProfile = Boolean(config.effective["design_profile"]);
  const designFile = path.join(projectRoot, "DESIGN.md");
  const designSpec = !designProfile
    ? "ready"
    : !fs.existsSync(designFile)
      ? "missing"
      : isTemplateDesignSpec(fs.readFileSync(designFile, "utf8"))
        ? "template"
        : "ready";

  const guide: AgentGuide = {
    contract: {
      user_interface: "natural-language",
      cli_operator: "ai-agent",
      goal:
        "Implement the smallest change that satisfies the user's intent while preserving explicit human ownership of product and risk decisions.",
    },
    project: {
      root: projectRoot,
      name: config.bassYaml.project.name,
      profiles: config.bassYaml.bass.profiles,
      design_profile: designProfile,
      design_spec: designSpec,
    },
    operating_rules: [
      "Operate BASS internally; never ask the user to run commands or edit records.",
      "Inspect repository facts yourself; ask only for product or risk decisions.",
      "Implement the smallest accepted change and obey execution_plan.scopeLock.",
      "Run each planned affected check once; reuse a passing result while its diff fingerprint is unchanged.",
      "Retry only failed and directly affected checks, within maxReworkLoops.",
      "Never self-approve risk or final product judgment.",
      "Preserve repository-native instructions and avoid a second source of truth.",
      "Load optional capability skills only when named in execution_plan.capabilityCalls.",
    ],
    execution_plan: buildExecutionPlan(config, task),
  };

  if (task) {
    const required = findRequiredApprovals(task.frontmatter);
    const recorded = loadRiskApprovals(projectRoot, task.frontmatter.id);
    const unresolved = required
      .filter((approval) => !recorded.some((entry) => entry.rule_id === approval.rule.id))
      .map((approval) => approval.rule.id);
    guide.task = {
      id: task.frontmatter.id,
      status: normalizeWorkflowState(task.frontmatter.status),
      workflow_depth: guide.execution_plan.depth,
      allowed_transitions: allowedTransitions(task.frontmatter.status),
      unresolved_human_decisions: unresolved,
      suggested_next_actions: suggestedNextActions(task.frontmatter.status, unresolved, designProfile, designSpec),
    };
  }

  return guide;
}

function suggestedNextActions(
  status: string,
  unresolvedApprovals: string[],
  designProfile: boolean,
  designSpec: "ready" | "missing" | "template",
): string[] {
  if (unresolvedApprovals.length > 0) {
    return [
      `Present one decision packet covering: ${unresolvedApprovals.join(", ")}.`,
      "Record only the user's explicit decision, then rerun the pre-task gate.",
    ];
  }

  const canonical = normalizeWorkflowState(status as TaskFile["frontmatter"]["status"]);
  const actions: Record<string, string[]> = {
    CAPTURED: ["Lock scope and acceptance criteria, then move to ACTIVE."],
    ACTIVE: ["Implement the smallest change and run only the planned affected checks."],
    REVIEW: ["Show the result, evidence, limitations, and product judgment once."],
    DONE: ["Do not repeat completed side effects. Start a new task only for a materially new request."],
    BLOCKED: ["Explain the concrete blocker and resume only from the first incomplete step."],
    NEEDS_DECISION: ["Ask one decision question with a recommendation and consequences."],
    NEEDS_EXPERT: ["Request named expert review; do not present the work as complete."],
    FAILED: ["Reuse prior evidence, diagnose the failure, and retry only the failed step."],
  };
  const result = [...(actions[canonical] ?? ["Inspect the current state before choosing the next action."])];
  if (designProfile && designSpec !== "ready") {
    result.unshift(
      designSpec === "missing"
        ? "Create DESIGN.md from an audit of existing product and code evidence before UI implementation."
        : "Replace the blank DESIGN.md template with confirmed, inconsistent, missing, and proposed design findings.",
    );
  }
  return result;
}

function isTemplateDesignSpec(content: string): boolean {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, "").trim();
  const sectionContent = withoutComments
    .split(/^##\s+/m)
    .slice(1)
    .map((section) => section.replace(/^[^\n]*\n?/, "").trim());
  return sectionContent.length === 0 || sectionContent.every((section) => section.length === 0);
}
