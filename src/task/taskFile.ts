import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { WorkflowState } from "../types.js";
import { assertTransition } from "../workflow/stateMachine.js";

const WORKFLOW_STATES = [
  "CAPTURED", "DISCOVERY", "SHAPED", "READY", "PLANNED", "IMPLEMENTING",
  "VERIFYING", "CRITIQUING", "HUMAN_REVIEW", "DONE",
  "BLOCKED", "NEEDS_DECISION", "NEEDS_EXPERT", "FAILED", "ROLLED_BACK", "CANCELLED",
] as const;

export const taskFrontmatterSchema = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/, "expected format like BASS-001"),
  title: z.string(),
  status: z.enum(WORKFLOW_STATES),
  type: z.string(),
  profile: z.string().optional(),
  risk: z.object({
    level: z.enum(["low", "medium", "high", "critical"]),
    reasons: z.array(z.string()).default([]),
  }),
  models: z.record(z.string(), z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  human: z.object({
    owner: z.string(),
    reviewer_required: z.boolean().default(true),
  }),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type TaskFrontmatter = z.infer<typeof taskFrontmatterSchema>;

/** 작업 파일 마크다운 본문의 표준 섹션 (Core 프롬프트 §14) */
export const TASK_SECTIONS = [
  "Problem",
  "What we are shipping",
  "What we are not shipping",
  "Facts",
  "Decisions",
  "Assumptions",
  "Relevant context",
  "Allowed scope",
  "Forbidden scope",
  "Acceptance criteria",
  "Human judgment",
  "Verification",
  "Rollback",
] as const;

export interface TaskFile {
  filePath: string;
  frontmatter: TaskFrontmatter;
  sections: Map<string, string>;
}

export function parseTaskFile(filePath: string): TaskFile {
  const raw = fs.readFileSync(filePath, "utf8");
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Task file has no YAML frontmatter: ${filePath}`);
  }
  const fmResult = taskFrontmatterSchema.safeParse(parse(fmMatch[1]!));
  if (!fmResult.success) {
    const issues = fmResult.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid task frontmatter (${filePath}):\n${issues}`);
  }

  const sections = new Map<string, string>();
  const body = fmMatch[2] ?? "";
  const headingRe = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  const headings: Array<{ name: string; start: number; contentStart: number }> = [];
  while ((match = headingRe.exec(body)) !== null) {
    headings.push({ name: match[1]!.trim(), start: match.index, contentStart: match.index + match[0].length });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    const end = i + 1 < headings.length ? headings[i + 1]!.start : body.length;
    sections.set(h.name, body.slice(h.contentStart, end).trim());
  }

  return { filePath, frontmatter: fmResult.data, sections };
}

export interface SectionCheck {
  section: string;
  present: boolean;
  nonEmpty: boolean;
}

export function checkSections(task: TaskFile, required: readonly string[]): SectionCheck[] {
  return required.map((section) => {
    const content = task.sections.get(section);
    return {
      section,
      present: content !== undefined,
      nonEmpty: (content ?? "").length > 0,
    };
  });
}

/** tasks/ 디렉터리에서 모든 작업 파일을 읽는다. */
export function listTasks(projectRoot: string): TaskFile[] {
  const dir = path.join(projectRoot, "tasks");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseTaskFile(path.join(dir, f)));
}

export function findTask(projectRoot: string, taskId: string): TaskFile {
  const dir = path.join(projectRoot, "tasks");
  const direct = path.join(dir, `${taskId}.md`);
  if (fs.existsSync(direct)) return parseTaskFile(direct);
  const all = listTasks(projectRoot);
  const found = all.find((t) => t.frontmatter.id === taskId);
  if (!found) throw new Error(`Task "${taskId}" not found under ${dir}`);
  return found;
}

export interface TaskTransitionResult {
  taskId: string;
  from: WorkflowState;
  to: WorkflowState;
  changed: boolean;
  filePath: string;
}

/**
 * 에이전트가 내부 상태를 안전하게 갱신한다.
 * 같은 상태로의 재실행은 성공한 no-op 이며, 잘못된 전이는 거부한다.
 */
export function transitionTask(
  projectRoot: string,
  taskId: string,
  to: WorkflowState,
): TaskTransitionResult {
  const task = findTask(projectRoot, taskId);
  const from = task.frontmatter.status;
  if (from === to) {
    return { taskId, from, to, changed: false, filePath: task.filePath };
  }

  assertTransition(from, to);
  const raw = fs.readFileSync(task.filePath, "utf8");
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) throw new Error(`Task file has no YAML frontmatter: ${task.filePath}`);
  const frontmatter = fmMatch[1]!;
  if (!/^status:\s*\S+\s*$/m.test(frontmatter)) {
    throw new Error(`Task frontmatter has no status field: ${task.filePath}`);
  }
  const updatedFrontmatter = frontmatter.replace(/^status:\s*\S+\s*$/m, `status: ${to}`);
  fs.writeFileSync(task.filePath, raw.replace(frontmatter, updatedFrontmatter), "utf8");
  return { taskId, from, to, changed: true, filePath: task.filePath };
}

export function countActiveTasks(projectRoot: string): number {
  const ACTIVE: WorkflowState[] = ["PLANNED", "IMPLEMENTING", "VERIFYING", "CRITIQUING"];
  return listTasks(projectRoot).filter((t) => ACTIVE.includes(t.frontmatter.status)).length;
}
