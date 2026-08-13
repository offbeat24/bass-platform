import type { LoadedConfig } from "../config/loader.js";
import { buildExecutionPlan } from "../execution/planner.js";
import { loadRunRecord } from "./runRecord.js";
import { currentAttempt, readEvents } from "./events.js";
import { listTasks } from "./taskFile.js";
import { buildTaskGraph } from "./taskGraph.js";

export interface ProjectStatus {
  project: string;
  generated_at: string;
  ready: string[];
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    ready: boolean;
    blocked_by: string[];
    attempts: number;
    current_attempt: number | null;
    max_attempts: number;
    last_activity: string | null;
    blocked_reason: string | null;
    evaluations: Array<{ name: string; status: string }>;
    open_high_or_medium: number;
    evidence: number;
    usage: Record<string, number | "unknown">;
  }>;
  issues: string[];
  warnings: string[];
}

export async function watchProjectStatus(
  read: () => ProjectStatus,
  emit: (status: ProjectStatus) => void,
  options: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  let previous = "";
  const publish = (): void => {
    const status = read();
    const fingerprint = JSON.stringify({ ...status, generated_at: "" });
    if (fingerprint === previous) return;
    previous = fingerprint;
    emit(status);
  };
  publish();
  if (options.signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setInterval(publish, options.intervalMs ?? 1_000);
    const stop = (): void => {
      clearInterval(timer);
      options.signal?.removeEventListener("abort", stop);
      resolve();
    };
    options.signal?.addEventListener("abort", stop, { once: true });
    if (options.signal?.aborted) stop();
  });
}

export function buildProjectStatus(
  projectRoot: string,
  config: LoadedConfig,
  now = new Date(),
): ProjectStatus {
  const tasks = listTasks(projectRoot);
  const graph = buildTaskGraph(tasks);
  const eventRead = readEvents(projectRoot);
  const warnings = [...eventRead.warnings];
  const taskStatuses = tasks.map((task) => {
    const node = graph.nodes.find((item) => item.id === task.frontmatter.id)!;
    const events = eventRead.events.filter((event) => event.task_id === task.frontmatter.id);
    const eventAttempts = events.filter((event) => event.kind === "attempt.started").length;
    const last = events.at(-1) ?? null;
    const blocked = [...events].reverse().find((event) => event.kind === "task.blocked") ?? null;
    let record: ReturnType<typeof loadRunRecord> = null;
    try {
      record = loadRunRecord(projectRoot, task.frontmatter.id);
    } catch (error) {
      warnings.push(`${task.frontmatter.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const plan = buildExecutionPlan(config, task);
    return {
      id: task.frontmatter.id,
      title: task.frontmatter.title,
      status: node.status,
      ready: node.ready,
      blocked_by: node.blockedBy,
      attempts: record ? record.attempts.length : eventAttempts,
      current_attempt: currentAttempt(eventRead.events, task.frontmatter.id),
      max_attempts: plan.loop.maxAttempts,
      last_activity: last?.at ?? null,
      blocked_reason: blocked?.summary ?? null,
      evaluations: record?.verification.evaluations_run.map((item) => ({ name: item.name, status: item.status })) ?? [],
      open_high_or_medium: record?.critic_findings.open_high_or_medium ?? 0,
      evidence: record?.evidence.length ?? 0,
      usage: record?.usage ?? unknownUsage(),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    project: config.bassYaml.project.name,
    generated_at: now.toISOString(),
    ready: graph.ready,
    tasks: taskStatuses,
    issues: graph.issues.map((issue) => `${issue.kind}: ${issue.detail}`),
    warnings,
  };
}

export function formatProjectStatus(status: ProjectStatus): string {
  const lines = [`[bass status] ${status.project} at ${status.generated_at}`, `ready: ${status.ready.join(", ") || "(none)"}`];
  for (const task of status.tasks) {
    const evaluations = task.evaluations.length
      ? task.evaluations.map((item) => `${item.name}:${item.status}`).join(",")
      : "none";
    lines.push(
      `  [${task.status}] ${task.id} attempt=${task.current_attempt ?? task.attempts}/${task.max_attempts} eval=${evaluations} evidence=${task.evidence}`,
    );
    if (task.blocked_by.length) lines.push(`    blocked by: ${task.blocked_by.join(", ")}`);
    if (task.blocked_reason) lines.push(`    reason: ${task.blocked_reason}`);
  }
  for (const issue of status.issues) lines.push(`  ISSUE ${issue}`);
  for (const warning of status.warnings) lines.push(`  WARN ${warning}`);
  return lines.join("\n");
}

function unknownUsage(): Record<string, "unknown"> {
  return {
    turns: "unknown",
    attempts: "unknown",
    input_tokens: "unknown",
    output_tokens: "unknown",
    cached_input_tokens: "unknown",
    evaluator_tokens: "unknown",
    tool_calls: "unknown",
    subagents: "unknown",
    estimated_cost: "unknown",
  };
}
