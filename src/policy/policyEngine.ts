import fs from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { policyPath } from "../paths.js";
import type { TaskFrontmatter } from "../task/taskFile.js";

const ruleSchema = z.object({
  id: z.string(),
  description: z.string(),
  triggers: z.object({
    risk_reasons: z.array(z.string()).optional(),
    task_types: z.array(z.string()).optional(),
    risk_levels: z.array(z.string()).optional(),
  }),
});

const policyFileSchema = z.object({
  version: z.number(),
  rules: z.array(ruleSchema),
});

export type ApprovalRule = z.infer<typeof ruleSchema>;

export function loadApprovalPolicy(file: string = policyPath("approval")): ApprovalRule[] {
  const result = policyFileSchema.safeParse(parse(fs.readFileSync(file, "utf8")));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid approval policy (${file}):\n${issues}`);
  }
  return result.data.rules;
}

export interface TriggeredRule {
  rule: ApprovalRule;
  matchedBy: string[];
}

/** 작업 frontmatter 에 대해 인간 승인이 필요한 정책 규칙을 찾는다. */
export function findRequiredApprovals(
  task: TaskFrontmatter,
  rules: ApprovalRule[] = loadApprovalPolicy(),
): TriggeredRule[] {
  const out: TriggeredRule[] = [];
  for (const rule of rules) {
    const matchedBy: string[] = [];
    for (const reason of rule.triggers.risk_reasons ?? []) {
      if (task.risk.reasons.includes(reason)) matchedBy.push(`risk.reasons: ${reason}`);
    }
    for (const type of rule.triggers.task_types ?? []) {
      if (task.type === type) matchedBy.push(`type: ${type}`);
    }
    for (const level of rule.triggers.risk_levels ?? []) {
      if (task.risk.level === level) matchedBy.push(`risk.level: ${level}`);
    }
    if (matchedBy.length > 0) out.push({ rule, matchedBy });
  }
  return out;
}
