import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const usageMetricSchema = z.union([z.number().nonnegative(), z.literal("unknown")]);

const executionContractSchema = z.object({
  contract_version: z.literal(1),
  plan_fingerprint: sha256Schema,
  capability_calls: z.array(z.string()),
});

const capabilityInvocationSchema = z.object({
  call_id: sha256Schema,
  attempt: z.number().int().positive(),
  capability_call: z.string().min(3).max(200).regex(/^[a-z0-9-]+:[a-z0-9-]+$/),
  host: z.enum(["codex", "claude"]),
  status: z.enum(["pass", "fail", "skipped", "error"]),
  summary: z.string().min(1).max(500).refine((value) => !/[\r\n]/.test(value), "summary must be one line"),
  evidence_path: z.string().min(1).max(500).optional(),
});

export const evidenceEntrySchema = z.object({
  kind: z.string().min(1),
  path: z.string().min(1),
  sha256: sha256Schema,
  produced_by: z.string().min(1),
  at: z.iso.datetime(),
});

/**
 * run record: 작업 완료 판정의 근거 (COL run-report 의 KEEP 계승).
 * `.bass/records/<taskId>.json` 에 저장한다. 0.2 records/ 는 읽기 호환한다.
 */
export const runRecordSchema = z.object({
  record_version: z.number().int().min(0).default(0),
  execution_contract: executionContractSchema.optional(),
  capability_invocations: z.array(capabilityInvocationSchema).default([]),
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
        reason: z.string().optional(),
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
      evidence_paths: z.array(z.string()).default([]),
      viewports: z.array(z.string()).default([]),
      console_errors: z.number().int().nonnegative().optional(),
    })
    .optional(),
  attempts: z
    .array(
      z.object({
        attempt: z.number().int().positive(),
        parent_attempt: z.number().int().positive().optional(),
        status: z.enum(["pass", "fail", "no-progress", "blocked"]),
        started_at: z.iso.datetime(),
        completed_at: z.iso.datetime().optional(),
        failure_fingerprint: z.string().optional(),
      }),
    )
    .default([]),
  evidence: z.array(evidenceEntrySchema).default([]),
  context: z
    .object({
      sources: z.array(z.object({ path: z.string().min(1), sha256: sha256Schema, chars: z.number().int().nonnegative() })).default([]),
      total_chars: z.number().int().nonnegative().default(0),
      omitted: z.array(z.string()).default([]),
    })
    .default({ sources: [], total_chars: 0, omitted: [] }),
  usage: z
    .object({
      turns: usageMetricSchema.default("unknown"),
      attempts: usageMetricSchema.default("unknown"),
      input_tokens: usageMetricSchema.default("unknown"),
      output_tokens: usageMetricSchema.default("unknown"),
      cached_input_tokens: usageMetricSchema.default("unknown"),
      evaluator_tokens: usageMetricSchema.default("unknown"),
      tool_calls: usageMetricSchema.default("unknown"),
      subagents: usageMetricSchema.default("unknown"),
      estimated_cost: usageMetricSchema.default("unknown"),
    })
    .default({
      turns: "unknown",
      attempts: "unknown",
      input_tokens: "unknown",
      output_tokens: "unknown",
      cached_input_tokens: "unknown",
      evaluator_tokens: "unknown",
      tool_calls: "unknown",
      subagents: "unknown",
      estimated_cost: "unknown",
    }),
  scope: z
    .object({
      actual_files: z.array(z.string()).default([]),
      outside_allowed: z.array(z.string()).default([]),
      forbidden_touched: z.array(z.string()).default([]),
    })
    .default({ actual_files: [], outside_allowed: [], forbidden_touched: [] }),
  refinement_proposal: z
    .object({
      summary: z.string().min(1),
      proposed_changes: z.array(z.string()).default([]),
      status: z.enum(["pending", "approved", "rejected"]).default("pending"),
    })
    .optional(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;

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

export function evidenceEntryForFile(
  projectRoot: string,
  taskId: string,
  kind: string,
  relativePath: string,
  producedBy: string,
  at = new Date(),
): EvidenceEntry {
  const file = safeEvidencePath(projectRoot, taskId, relativePath);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Evidence file not found: ${relativePath}`);
  return {
    kind,
    path: normalizeRelative(projectRoot, file),
    sha256: sha256File(file),
    produced_by: producedBy,
    at: at.toISOString(),
  };
}

export function verifyEvidenceEntries(projectRoot: string, taskId: string, entries: EvidenceEntry[]): string[] {
  const issues: string[] = [];
  for (const entry of entries) {
    try {
      const file = safeEvidencePath(projectRoot, taskId, entry.path);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        issues.push(`${entry.path}: file not found`);
        continue;
      }
      const actual = sha256File(file);
      if (actual !== entry.sha256) issues.push(`${entry.path}: checksum mismatch`);
    } catch (error) {
      issues.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return issues;
}

export function verifyContextSources(
  projectRoot: string,
  sources: RunRecord["context"]["sources"],
): string[] {
  const issues: string[] = [];
  for (const source of sources) {
    try {
      const file = safeProjectFile(projectRoot, source.path);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        issues.push(`${source.path}: file not found`);
        continue;
      }
      if (sha256File(file) !== source.sha256) issues.push(`${source.path}: context changed after use`);
    } catch (error) {
      issues.push(`${source.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return issues;
}

function safeEvidencePath(projectRoot: string, taskId: string, relativePath: string): string {
  const expectedRoot = path.resolve(projectRoot, ".bass", "evidence", taskId);
  const candidate = safeProjectFile(projectRoot, relativePath);
  const relative = path.relative(expectedRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`evidence must be under .bass/evidence/${taskId}/`);
  }
  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate);
    const realRoot = fs.existsSync(expectedRoot) ? fs.realpathSync(expectedRoot) : expectedRoot;
    const realRelative = path.relative(realRoot, realCandidate);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
      throw new Error("resolved evidence path is outside the task evidence directory");
    }
  }
  return candidate;
}

function safeProjectFile(projectRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error("absolute paths are not portable");
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("path is outside project root");
  return candidate;
}

function normalizeRelative(projectRoot: string, file: string): string {
  return path.relative(path.resolve(projectRoot), file).split(path.sep).join("/");
}

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
