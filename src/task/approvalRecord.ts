import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const approvalDecisionSchema = z.enum(["approved", "rejected"]);

export const riskApprovalSchema = z.object({
  rule_id: z.string().min(1),
  decision: approvalDecisionSchema,
  approver: z.string().min(1),
  reason: z.string().min(1),
  at: z.string().min(1),
});

const approvalFileSchema = z.object({
  task_id: z.string().min(1),
  risk_approvals: z.array(riskApprovalSchema).default([]),
});

export type RiskApproval = z.infer<typeof riskApprovalSchema>;

function approvalFilePath(projectRoot: string, taskId: string): string {
  return path.join(projectRoot, ".bass", "records", `${taskId}.approvals.json`);
}

export function loadRiskApprovals(projectRoot: string, taskId: string): RiskApproval[] {
  const file = existingApprovalFilePath(projectRoot, taskId);
  if (!fs.existsSync(file)) return [];
  const parsed = approvalFileSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid approval record (${file}):\n${issues}`);
  }
  if (parsed.data.task_id !== taskId) {
    throw new Error(`Approval record task mismatch: expected ${taskId}, got ${parsed.data.task_id}`);
  }
  return parsed.data.risk_approvals;
}

export interface RecordRiskApprovalOptions {
  projectRoot: string;
  taskId: string;
  ruleId: string;
  decision: "approved" | "rejected";
  approver: string;
  reason: string;
  at?: string;
}

export function recordRiskApproval(
  options: RecordRiskApprovalOptions,
): { approval: RiskApproval; changed: boolean; filePath: string } {
  const filePath = existingApprovalFilePath(options.projectRoot, options.taskId);
  const approvals = loadRiskApprovals(options.projectRoot, options.taskId);
  const existing = approvals.find((a) => a.rule_id === options.ruleId);

  if (
    existing &&
    existing.decision === options.decision &&
    existing.approver === options.approver &&
    existing.reason === options.reason
  ) {
    return { approval: existing, changed: false, filePath };
  }
  if (existing) {
    throw new Error(
      `Approval for "${options.ruleId}" already exists with a different decision. ` +
        "Preserve the original record and create a new task or amend it explicitly.",
    );
  }

  const approval: RiskApproval = {
    rule_id: options.ruleId,
    decision: options.decision,
    approver: options.approver,
    reason: options.reason,
    at: options.at ?? new Date().toISOString(),
  };
  approvals.push(approval);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ task_id: options.taskId, risk_approvals: approvals }, null, 2)}\n`,
    "utf8",
  );
  return { approval, changed: true, filePath };
}

function existingApprovalFilePath(projectRoot: string, taskId: string): string {
  const current = approvalFilePath(projectRoot, taskId);
  const legacy = path.join(projectRoot, "records", `${taskId}.approvals.json`);
  return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
}
