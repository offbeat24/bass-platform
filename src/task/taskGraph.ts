import { normalizeWorkflowState } from "../workflow/stateMachine.js";
import type { TaskFile } from "./taskFile.js";

export type TaskGraphIssueKind = "missing-dependency" | "missing-parent" | "cycle" | "path-conflict";

export interface TaskGraphIssue {
  kind: TaskGraphIssueKind;
  taskIds: string[];
  detail: string;
}

export interface TaskGraphNode {
  id: string;
  title: string;
  status: string;
  parentTask: string | null;
  dependsOn: string[];
  ownedPaths: string[];
  blockedBy: string[];
  ready: boolean;
}

export interface TaskGraph {
  valid: boolean;
  ready: string[];
  nodes: TaskGraphNode[];
  issues: TaskGraphIssue[];
}

export function buildTaskGraph(tasks: TaskFile[]): TaskGraph {
  const byId = new Map(tasks.map((task) => [task.frontmatter.id, task]));
  const issues: TaskGraphIssue[] = [];

  for (const task of tasks) {
    const id = task.frontmatter.id;
    for (const dependency of task.frontmatter.coordination.depends_on) {
      if (!byId.has(dependency)) {
        issues.push({ kind: "missing-dependency", taskIds: [id, dependency], detail: `${id} depends on missing task ${dependency}` });
      }
    }
    const parent = task.frontmatter.coordination.parent_task;
    if (parent && !byId.has(parent)) {
      issues.push({ kind: "missing-parent", taskIds: [id, parent], detail: `${id} names missing parent task ${parent}` });
    }
  }

  issues.push(...cycleIssues(tasks, byId));
  issues.push(...pathConflictIssues(tasks, byId));

  const issueIds = new Set(issues.flatMap((issue) => issue.taskIds));
  const nodes = tasks
    .map((task): TaskGraphNode => {
      const dependsOn = task.frontmatter.coordination.depends_on;
      const blockedBy = dependsOn.filter((dependency) => {
        const target = byId.get(dependency);
        return !target || normalizeWorkflowState(target.frontmatter.status) !== "DONE";
      });
      const status = normalizeWorkflowState(task.frontmatter.status);
      return {
        id: task.frontmatter.id,
        title: task.frontmatter.title,
        status,
        parentTask: task.frontmatter.coordination.parent_task ?? null,
        dependsOn,
        ownedPaths: task.frontmatter.coordination.owned_paths,
        blockedBy,
        ready: status === "CAPTURED" && blockedBy.length === 0 && !issueIds.has(task.frontmatter.id),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    valid: issues.length === 0,
    ready: nodes.filter((node) => node.ready).map((node) => node.id),
    nodes,
    issues,
  };
}

export function formatTaskGraph(graph: TaskGraph): string {
  const lines = [`[bass task graph] ${graph.valid ? "VALID" : "INVALID"}; ready=${graph.ready.join(", ") || "(none)"}`];
  for (const node of graph.nodes) {
    const details = [
      node.dependsOn.length ? `depends=${node.dependsOn.join(",")}` : "",
      node.blockedBy.length ? `blocked=${node.blockedBy.join(",")}` : "",
      node.ownedPaths.length ? `owns=${node.ownedPaths.join(",")}` : "",
    ].filter(Boolean).join("; ");
    lines.push(`  ${node.ready ? "READY" : node.status.padEnd(6)} ${node.id}${details ? ` — ${details}` : ""}`);
  }
  for (const issue of graph.issues) lines.push(`  ISSUE ${issue.kind}: ${issue.detail}`);
  return lines.join("\n");
}

function cycleIssues(tasks: TaskFile[], byId: Map<string, TaskFile>): TaskGraphIssue[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const key = [...new Set(cycle)].sort().join("|");
      cycles.set(key, cycle);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const task = byId.get(id);
    for (const dependency of task?.frontmatter.coordination.depends_on ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };

  for (const task of tasks) visit(task.frontmatter.id);
  return [...cycles.values()].map((cycle) => ({
    kind: "cycle",
    taskIds: [...new Set(cycle)],
    detail: cycle.join(" -> "),
  }));
}

function pathConflictIssues(tasks: TaskFile[], byId: Map<string, TaskFile>): TaskGraphIssue[] {
  const active = tasks.filter((task) => !["DONE", "CANCELLED", "ROLLED_BACK"].includes(normalizeWorkflowState(task.frontmatter.status)));
  const issues: TaskGraphIssue[] = [];
  for (let leftIndex = 0; leftIndex < active.length; leftIndex++) {
    const left = active[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex++) {
      const right = active[rightIndex]!;
      if (dependsTransitively(left.frontmatter.id, right.frontmatter.id, byId)
        || dependsTransitively(right.frontmatter.id, left.frontmatter.id, byId)) continue;
      for (const leftPath of left.frontmatter.coordination.owned_paths) {
        for (const rightPath of right.frontmatter.coordination.owned_paths) {
          if (!pathsOverlap(leftPath, rightPath)) continue;
          issues.push({
            kind: "path-conflict",
            taskIds: [left.frontmatter.id, right.frontmatter.id],
            detail: `${left.frontmatter.id}:${leftPath} overlaps ${right.frontmatter.id}:${rightPath} without a dependency`,
          });
        }
      }
    }
  }
  return issues;
}

function dependsTransitively(taskId: string, targetId: string, byId: Map<string, TaskFile>, seen = new Set<string>()): boolean {
  if (seen.has(taskId)) return false;
  seen.add(taskId);
  const dependencies = byId.get(taskId)?.frontmatter.coordination.depends_on ?? [];
  return dependencies.includes(targetId)
    || dependencies.some((dependency) => dependsTransitively(dependency, targetId, byId, seen));
}

function pathsOverlap(left: string, right: string): boolean {
  const a = normalizePath(left);
  const b = normalizePath(right);
  return a === "" || b === "" || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}
