import fs from "node:fs";
import path from "node:path";
import type { LoadedConfig } from "../config/loader.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { loadRiskApprovals } from "../task/approvalRecord.js";
import { allowedTransitions } from "../workflow/stateMachine.js";
import type { TaskFile } from "../task/taskFile.js";

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
    nan2026: boolean;
  };
  operating_rules: string[];
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
  const nan2026 = config.bassYaml.bass.profiles.includes("nan2026");
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
      nan2026,
    },
    operating_rules: [
      "Do not ask the user to run BASS commands or edit BASS records.",
      "Investigate repository facts directly; ask only for product, value, or risk decisions a human must own.",
      "Treat workflow states as internal execution state, not as approval prompts.",
      "Use risk-proportional depth and keep reversible low-risk work moving.",
      "Record explicit human decisions before crossing a policy gate; never self-approve.",
      "Make retries idempotent: reuse completed state, evidence, and decisions instead of duplicating them.",
      "For UI work, inspect the rendered result and DESIGN.md before claiming visual completion.",
      "Treat adoption into an existing repository as one proportional task, not as a separate ceremony.",
      "Inspect and preserve repository-native instructions, validation, design, and history before choosing profiles or evaluators.",
      "If BASS overlaps an existing system, integrate the smallest useful contract and do not create a second source of truth.",
      "Validate adoption with one real user task and keep lessons project-local until repetition justifies promotion.",
      "Use Ouroboros only for consequential ambiguity or high-risk semantic evaluation; import its result once into the BASS task.",
      "Use Ponytail only within accepted scope; preserve requirements and safeguards, run cheap checks first, and do not repeat loops without new evidence.",
    ],
  };

  if (nan2026) {
    guide.operating_rules.push(
      "Read nan/AGENT_WORKFLOW.md and treat concept/runtime selection as meaningful human decisions.",
      "Maintain NAN trace, evidence, and protection records internally; do not turn checkpoint bookkeeping into user approval prompts.",
      "Never present an unexecuted platform build as verified.",
      "NAN plugin boundary: Ouroboros is pre-approval clarification or post-lock evaluation only; Ponytail never removes protected trace, gates, acceptance, evidence, or platform requirements.",
    );
  }

  if (task) {
    const required = findRequiredApprovals(task.frontmatter);
    const recorded = loadRiskApprovals(projectRoot, task.frontmatter.id);
    const unresolved = required
      .filter((approval) => !recorded.some((entry) => entry.rule_id === approval.rule.id))
      .map((approval) => approval.rule.id);
    guide.task = {
      id: task.frontmatter.id,
      status: task.frontmatter.status,
      workflow_depth: workflowDepth(config, task),
      allowed_transitions: allowedTransitions(task.frontmatter.status),
      unresolved_human_decisions: unresolved,
      suggested_next_actions: suggestedNextActions(task.frontmatter.status, unresolved, designProfile, designSpec),
    };
  }

  return guide;
}

function workflowDepth(config: LoadedConfig, task: TaskFile): string {
  const grill = (config.effective["grill"] ?? {}) as Record<string, unknown>;
  return String(grill[task.frontmatter.risk.level] ?? "STANDARD").toUpperCase();
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

  const actions: Record<string, string[]> = {
    CAPTURED: ["Inspect the repository and turn the natural-language request into a short task specification."],
    DISCOVERY: ["Finish fact-finding, separate assumptions from decisions, and shape the smallest useful outcome."],
    SHAPED: ["Confirm acceptance criteria and automatically prepare the task for implementation."],
    READY: ["Run the pre-task gate and begin implementation when it passes."],
    PLANNED: ["Begin the approved, scoped implementation."],
    IMPLEMENTING: ["Implement within scope, then run declared evaluators."],
    VERIFYING: ["Collect mechanical and rendered evidence; fix failures before critique."],
    CRITIQUING: ["Run independent relevant critics, prepare the run record, then run the pre-review gate."],
    HUMAN_REVIEW: ["Show the result, evidence, limitations, and product judgment to the user once."],
    DONE: ["Do not repeat completed side effects. Start a new task only for a materially new request."],
    BLOCKED: ["Explain the concrete blocker and resume only from the first incomplete step."],
    NEEDS_DECISION: ["Ask one decision question with a recommendation and consequences."],
    NEEDS_EXPERT: ["Request named expert review; do not present the work as complete."],
    FAILED: ["Reuse prior evidence, diagnose the failure, and retry only the failed step."],
  };
  const result = [...(actions[status] ?? ["Inspect the current state before choosing the next action."])];
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
