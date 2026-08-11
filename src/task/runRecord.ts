import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * run record: 작업 완료 판정의 근거 (COL run-report 의 KEEP 계승).
 * `.bass/records/<taskId>.json` 에 저장한다. 0.2 records/ 는 읽기 호환한다.
 */
export const runRecordSchema = z.object({
  task_id: z.string(),
  summary_of_changes: z.string().min(1),
  why: z.string().min(1),
  files_changed: z.array(z.string()),
  models_used: z
    .array(
      z.object({
        role: z.string(),
        alias: z.string(),
        actual_model: z.string().optional(),
        followed_recommendation: z.boolean().optional(),
      }),
    )
    .default([]),
  verification: z.object({
    evaluations_run: z.array(
      z.object({
        name: z.string(),
        level: z.number().int().min(1).max(3),
        status: z.enum(["pass", "fail", "timeout", "skipped", "error"]),
      }),
    ),
    not_verified: z.array(z.string()).default([]),
  }),
  critic_findings: z
    .object({
      total: z.number().int().min(0),
      open_high_or_medium: z.number().int().min(0),
      report_path: z.string().optional(),
    })
    .default({ total: 0, open_high_or_medium: 0 }),
  human_approval: z
    .object({
      approved: z.boolean(),
      approver: z.string(),
      at: z.string(),
      notes: z.string().optional(),
    })
    .optional(),
  known_limitations: z.array(z.string()).default([]),
  out_of_scope_findings: z.array(z.string()).default([]),
  docs_updated: z.object({
    needed: z.boolean(),
    updated: z.array(z.string()).default([]),
  }),
  lessons: z
    .object({
      recorded: z.boolean(),
      candidates: z.array(z.string()).default([]),
    })
    .default({ recorded: false, candidates: [] }),
  rollback: z.object({
    method: z.string().min(1),
  }),
  design: z
    .object({
      rendered_verification: z.boolean(),
      environment: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

export function runRecordPath(projectRoot: string, taskId: string): string {
  return path.join(projectRoot, ".bass", "records", `${taskId}.json`);
}

export function loadRunRecord(projectRoot: string, taskId: string): RunRecord | null {
  const file = existingRunRecordPath(projectRoot, taskId);
  if (!fs.existsSync(file)) return null;
  const result = runRecordSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid run record (${file}):\n${issues}`);
  }
  return result.data;
}

export function recordFinalApproval(
  projectRoot: string,
  taskId: string,
  approver: string,
  notes?: string,
): { record: RunRecord; changed: boolean; filePath: string } {
  const filePath = existingRunRecordPath(projectRoot, taskId);
  const record = loadRunRecord(projectRoot, taskId);
  if (!record) {
    throw new Error(`Run record not found: ${filePath}. Prepare verification evidence before human review.`);
  }

  if (
    record.human_approval?.approved &&
    record.human_approval.approver === approver &&
    (record.human_approval.notes ?? "") === (notes ?? "")
  ) {
    return { record, changed: false, filePath };
  }
  if (record.human_approval) {
    throw new Error(
      `Final approval already exists for ${taskId}. Preserve the original approval instead of overwriting it.`,
    );
  }

  const updated: RunRecord = {
    ...record,
    human_approval: {
      approved: true,
      approver,
      at: new Date().toISOString(),
      ...(notes ? { notes } : {}),
    },
  };
  fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return { record: updated, changed: true, filePath };
}

function existingRunRecordPath(projectRoot: string, taskId: string): string {
  const current = runRecordPath(projectRoot, taskId);
  const legacy = path.join(projectRoot, "records", `${taskId}.json`);
  return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
}
