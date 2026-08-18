import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ExecutionPlan, WorkflowState } from "../types.js";
import { findTask, transitionTask, type TaskFile } from "./taskFile.js";
import { normalizeWorkflowState } from "../workflow/stateMachine.js";

export const EVENT_KINDS = [
  "task.started",
  "attempt.started",
  "attempt.completed",
  "capability.started",
  "capability.completed",
  "evaluation.completed",
  "critic.completed",
  "evidence.recorded",
  "task.blocked",
  "task.completed",
] as const;

export const EVENT_STATUSES = ["running", "pass", "fail", "no-progress", "blocked", "skipped", "error"] as const;

const summarySchema = z.string().min(1).max(500).refine((value) => !/[\r\n]/.test(value), "summary must be one line");

export const bassEventSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]),
  at: z.iso.datetime(),
  task_id: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
  attempt: z.number().int().positive().optional(),
  parent_attempt: z.number().int().positive().optional(),
  kind: z.enum(EVENT_KINDS),
  status: z.enum(EVENT_STATUSES).optional(),
  name: z.string().min(1).max(100).optional(),
  summary: summarySchema,
  failure_fingerprint: z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/).optional(),
  turns: z.number().int().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  call_id: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  host: z.enum(["codex", "claude"]).optional(),
  capability_call: z.string().min(3).max(200).regex(/^[a-z0-9-]+:[a-z0-9-]+$/).optional(),
  evidence_path: z.string().min(1).max(500).optional(),
  plan_fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).superRefine((event, context) => {
  if (event.kind !== "capability.started" && event.kind !== "capability.completed") return;
  if (event.schema_version !== 2) {
    context.addIssue({ code: "custom", path: ["schema_version"], message: "capability events require schema v2" });
  }
  for (const field of ["attempt", "call_id", "host", "capability_call"] as const) {
    if (event[field] === undefined) {
      context.addIssue({ code: "custom", path: [field], message: `${field} is required for capability events` });
    }
  }
  if (event.kind === "capability.started" && event.status !== "running") {
    context.addIssue({ code: "custom", path: ["status"], message: "capability.started status must be running" });
  }
  if (event.kind === "capability.completed" && !["pass", "fail", "skipped", "error"].includes(event.status ?? "")) {
    context.addIssue({ code: "custom", path: ["status"], message: "invalid capability completion status" });
  }
});

export type BassEvent = z.infer<typeof bassEventSchema>;
export type NewBassEvent = Omit<BassEvent, "schema_version" | "at"> & { at?: string };

export interface EventReadResult {
  events: BassEvent[];
  warnings: string[];
}

export interface AttemptActionResult {
  changed: boolean;
  attempt: number;
  blocked: boolean;
  reason?: string;
  event?: BassEvent;
}

export function eventLogPath(projectRoot: string): string {
  return path.join(projectRoot, ".bass", "events.jsonl");
}

export function appendEvent(projectRoot: string, event: NewBassEvent): BassEvent {
  const parsed = bassEventSchema.parse({
    schema_version: 2,
    at: event.at ?? new Date().toISOString(),
    ...event,
    summary: normalizeEventSummary(event.summary),
  });
  const file = eventLogPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf8");
    if (existing.length > 0 && !existing.endsWith("\n")) fs.appendFileSync(file, "\n", "utf8");
  }
  fs.appendFileSync(file, `${JSON.stringify(parsed)}\n`, "utf8");
  return parsed;
}

export function readEvents(projectRoot: string): EventReadResult {
  const file = eventLogPath(projectRoot);
  if (!fs.existsSync(file)) return { events: [], warnings: [] };
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split("\n");
  const events: BassEvent[] = [];
  const warnings: string[] = [];
  const lastContentLine = raw.endsWith("\n") ? lines.length - 2 : lines.length - 1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    try {
      const result = bassEventSchema.safeParse(JSON.parse(line));
      if (!result.success) throw new Error(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      events.push(result.data);
    } catch (error) {
      warnings.push(
        index === lastContentLine && !raw.endsWith("\n")
          ? `truncated final event line ${index + 1} ignored`
          : `invalid event line ${index + 1} ignored: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { events, warnings };
}

export function currentAttempt(events: BassEvent[], taskId: string): number | null {
  const taskEvents = events.filter((event) => event.task_id === taskId);
  const starts = taskEvents.filter((event) => event.kind === "attempt.started" && event.attempt !== undefined);
  const completions = new Set(
    taskEvents.filter((event) => event.kind === "attempt.completed").map((event) => event.attempt),
  );
  return starts.map((event) => event.attempt!).reverse().find((attempt) => !completions.has(attempt)) ?? null;
}

export function startAttempt(opts: {
  projectRoot: string;
  task: TaskFile;
  plan: ExecutionPlan;
  parentAttempt?: number;
  now?: Date;
}): AttemptActionResult {
  if (normalizeWorkflowState(opts.task.frontmatter.status) !== "ACTIVE") {
    throw new Error(`Attempt start requires ACTIVE status (current: ${opts.task.frontmatter.status})`);
  }
  const now = opts.now ?? new Date();
  const { events } = readEvents(opts.projectRoot);
  const open = currentAttempt(events, opts.task.frontmatter.id);
  if (open !== null) {
    const started = events.find(
      (event) => event.task_id === opts.task.frontmatter.id && event.kind === "attempt.started" && event.attempt === open,
    );
    if (started?.plan_fingerprint && started.plan_fingerprint !== opts.plan.planFingerprint) {
      throw new Error(`Open attempt ${open} is bound to a different ExecutionPlan; finish it before changing the plan`);
    }
    return { changed: false, attempt: open, blocked: false };
  }
  const taskEvents = events.filter((event) => event.task_id === opts.task.frontmatter.id);
  const starts = taskEvents.filter((event) => event.kind === "attempt.started");
  if (starts.length >= opts.plan.loop.maxAttempts) {
    return blockAttempt(opts.projectRoot, opts.task.frontmatter.id, starts.length, "NEEDS_EXPERT", "attempt budget exhausted", now);
  }
  const firstStarted = starts[0]?.at;
  if (firstStarted && now.getTime() - Date.parse(firstStarted) > opts.plan.loop.maxMinutes * 60_000) {
    return blockAttempt(opts.projectRoot, opts.task.frontmatter.id, starts.length, "NEEDS_DECISION", "loop time budget exhausted", now);
  }

  if (!taskEvents.some((event) => event.kind === "task.started")) {
    appendEvent(opts.projectRoot, {
      at: now.toISOString(),
      task_id: opts.task.frontmatter.id,
      kind: "task.started",
      status: "running",
      summary: "task work started",
    });
  }
  const attempt = starts.length + 1;
  const event = appendEvent(opts.projectRoot, {
    at: now.toISOString(),
    task_id: opts.task.frontmatter.id,
    attempt,
    ...(opts.parentAttempt ? { parent_attempt: opts.parentAttempt } : {}),
    kind: "attempt.started",
    status: "running",
    plan_fingerprint: opts.plan.planFingerprint,
    summary: `attempt ${attempt} started`,
  });
  return { changed: true, attempt, blocked: false, event };
}

export function finishAttempt(opts: {
  projectRoot: string;
  task: TaskFile;
  plan: ExecutionPlan;
  result: "pass" | "fail" | "no-progress";
  summary: string;
  failureFingerprint?: string;
  turns?: number;
  now?: Date;
}): AttemptActionResult {
  const now = opts.now ?? new Date();
  const before = readEvents(opts.projectRoot).events;
  const attempt = currentAttempt(before, opts.task.frontmatter.id);
  if (attempt === null) throw new Error(`No active attempt for ${opts.task.frontmatter.id}`);
  const started = [...before].reverse().find(
    (event) => event.task_id === opts.task.frontmatter.id && event.kind === "attempt.started" && event.attempt === attempt,
  );
  if (started?.plan_fingerprint && started.plan_fingerprint !== opts.plan.planFingerprint) {
    throw new Error(`Attempt ${attempt} is bound to a different ExecutionPlan; finish it with the original plan`);
  }
  const failureFingerprint = opts.result === "pass"
    ? undefined
    : opts.failureFingerprint ?? fingerprint(opts.summary);
  const event = appendEvent(opts.projectRoot, {
    at: now.toISOString(),
    task_id: opts.task.frontmatter.id,
    attempt,
    kind: "attempt.completed",
    status: opts.result,
    summary: normalizeEventSummary(opts.summary),
    ...(failureFingerprint ? { failure_fingerprint: failureFingerprint } : {}),
    ...(opts.turns !== undefined ? { turns: opts.turns } : {}),
    ...(started ? { duration_ms: Math.max(0, now.getTime() - Date.parse(started.at)) } : {}),
  });

  const events = [...before, event].filter((item) => item.task_id === opts.task.frontmatter.id);
  const totalTurns = events
    .filter((item) => item.kind === "attempt.completed")
    .reduce((sum, item) => sum + (item.turns ?? 0), 0);
  const firstStarted = events.find((item) => item.kind === "attempt.started");
  const elapsed = firstStarted ? now.getTime() - Date.parse(firstStarted.at) : 0;
  if (totalTurns > opts.plan.loop.maxTurns) {
    return blockAfterEvent(opts.projectRoot, opts.task.frontmatter.id, attempt, event, "NEEDS_DECISION", `turn budget exceeded: ${totalTurns}/${opts.plan.loop.maxTurns}`, now);
  }
  if (elapsed > opts.plan.loop.maxMinutes * 60_000) {
    return blockAfterEvent(opts.projectRoot, opts.task.frontmatter.id, attempt, event, "NEEDS_DECISION", "loop time budget exhausted", now);
  }
  if (opts.result === "no-progress") {
    const count = consecutiveNoProgress(events);
    if (count >= opts.plan.loop.noProgressLimit) {
      return blockAfterEvent(opts.projectRoot, opts.task.frontmatter.id, attempt, event, "NEEDS_DECISION", `no progress limit reached: ${count}`, now);
    }
  }
  if (opts.result === "fail" && failureFingerprint) {
    const repeats = consecutiveSameFailure(events, failureFingerprint) - 1;
    if (repeats >= opts.plan.loop.noProgressLimit) {
      return blockAfterEvent(opts.projectRoot, opts.task.frontmatter.id, attempt, event, "NEEDS_DECISION", "same failure repeated without new evidence", now);
    }
  }
  if (opts.result !== "pass" && attempt >= opts.plan.loop.maxAttempts) {
    return blockAfterEvent(opts.projectRoot, opts.task.frontmatter.id, attempt, event, "NEEDS_EXPERT", "attempt budget exhausted", now);
  }
  return { changed: true, attempt, blocked: false, event };
}

function blockAttempt(
  projectRoot: string,
  taskId: string,
  attempt: number,
  state: "NEEDS_DECISION" | "NEEDS_EXPERT",
  reason: string,
  now: Date,
): AttemptActionResult {
  holdTask(projectRoot, taskId, state);
  const event = appendEvent(projectRoot, {
    at: now.toISOString(),
    task_id: taskId,
    ...(attempt > 0 ? { attempt } : {}),
    kind: "task.blocked",
    status: "blocked",
    summary: reason,
  });
  return { changed: true, attempt, blocked: true, reason, event };
}

function blockAfterEvent(
  projectRoot: string,
  taskId: string,
  attempt: number,
  completed: BassEvent,
  state: "NEEDS_DECISION" | "NEEDS_EXPERT",
  reason: string,
  now: Date,
): AttemptActionResult {
  blockAttempt(projectRoot, taskId, attempt, state, reason, now);
  return { changed: true, attempt, blocked: true, reason, event: completed };
}

function holdTask(projectRoot: string, taskId: string, state: "NEEDS_DECISION" | "NEEDS_EXPERT"): void {
  const current = findTask(projectRoot, taskId);
  if (normalizeWorkflowState(current.frontmatter.status) !== state) {
    transitionTask(projectRoot, taskId, state as WorkflowState);
  }
}

function consecutiveNoProgress(events: BassEvent[]): number {
  let count = 0;
  for (const event of [...events].reverse()) {
    if (event.kind === "evidence.recorded" && !isRoutineEvidence(event)) break;
    if (event.kind !== "attempt.completed") continue;
    if (event.status !== "no-progress") break;
    count++;
  }
  return count;
}

function consecutiveSameFailure(events: BassEvent[], failureFingerprint: string): number {
  let count = 0;
  for (const event of [...events].reverse()) {
    if (event.kind === "evidence.recorded" && !isRoutineEvidence(event)) break;
    if (event.kind !== "attempt.completed") continue;
    if (event.status !== "fail" || event.failure_fingerprint !== failureFingerprint) break;
    count++;
  }
  return count;
}

function isRoutineEvidence(event: BassEvent): boolean {
  return event.kind === "evidence.recorded" && event.name?.startsWith("evaluation-log:") === true;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(oneLine(value).toLowerCase()).digest("hex");
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

export function normalizeEventSummary(value: string): string {
  return redactEventSecrets(oneLine(value));
}

function redactEventSecrets(value: string): string {
  return value
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|authorization)\s*[:=]\s*)([^\s]+)/gi, "$1***masked***")
    .replace(/\b(?:sk-[a-z0-9_-]{8,}|gh[pousr]_[a-z0-9]{8,})\b/gi, "***masked***");
}
