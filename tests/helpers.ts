import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASS_VERSION } from "../src/version.js";

export function makeTempProject(opts: {
  profiles?: string[];
  extraYaml?: string;
  version?: string;
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bass-test-"));
  const profiles = opts.profiles ?? ["common"];
  fs.writeFileSync(
    path.join(dir, "bass.yaml"),
    `bass:
  version: ${opts.version ?? BASS_VERSION}
  profiles:
${profiles.map((p) => `    - ${p}`).join("\n")}
project:
  name: test-project
${opts.extraYaml ?? ""}`,
    "utf8",
  );
  return dir;
}

export function writeTask(
  projectRoot: string,
  id: string,
  opts: {
    status?: string;
    riskLevel?: string;
    riskReasons?: string[];
    models?: Record<string, string>;
    sections?: Record<string, string>;
    capabilities?: string[];
    taskType?: string;
    config?: Record<string, unknown>;
    coordination?: { parent_task?: string | null; depends_on?: string[]; owned_paths?: string[] };
    loop?: {
      stop_when?: string[];
      required_evidence?: string[];
      max_turns?: number;
      max_attempts?: number;
      max_minutes?: number;
      no_progress_limit?: number;
    };
  } = {},
): string {
  const sections: Record<string, string> = {
    Problem: "실제 문제 설명",
    "What we are shipping": "이번에 제공하는 것",
    "What we are not shipping": "제외 범위",
    Facts: "확인된 사실",
    Decisions: "결정 사항",
    Assumptions: "none",
    "Relevant context": "관련 파일",
    "Allowed scope": "src/",
    "Forbidden scope": "docs/",
    "Acceptance criteria": "기준 1",
    "Human judgment": "제품 방향",
    Verification: "npm test",
    Rollback: "git revert",
    ...(opts.sections ?? {}),
  };
  const body = Object.entries(sections)
    .map(([name, content]) => `## ${name}\n\n${content}`)
    .join("\n\n");
  const content = `---
id: ${id}
title: Test task
status: ${opts.status ?? "READY"}
type: ${opts.taskType ?? "feature"}
risk:
  level: ${opts.riskLevel ?? "low"}
  reasons: [${(opts.riskReasons ?? []).join(", ")}]
${opts.models ? `models:\n${Object.entries(opts.models).map(([k, v]) => `  ${k}: ${v}`).join("\n")}` : ""}
${opts.capabilities ? `capabilities: [${opts.capabilities.join(", ")}]` : ""}
${opts.config ? `config:\n${Object.entries(opts.config).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`).join("\n")}` : ""}
${opts.coordination ? `coordination:\n  parent_task: ${opts.coordination.parent_task ?? "null"}\n  depends_on: ${JSON.stringify(opts.coordination.depends_on ?? [])}\n  owned_paths: ${JSON.stringify(opts.coordination.owned_paths ?? [])}` : ""}
${opts.loop && Object.keys(opts.loop).length > 0 ? `loop:\n${Object.entries(opts.loop).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`).join("\n")}` : ""}
human:
  owner: user
  reviewer_required: true
---

${body}
`;
  const tasksDir = path.join(projectRoot, ".bass", "tasks");
  fs.mkdirSync(tasksDir, { recursive: true });
  const file = path.join(tasksDir, `${id}.md`);
  fs.writeFileSync(file, content, "utf8");
  return file;
}

export function writeRunRecord(projectRoot: string, taskId: string, overrides: Record<string, unknown> = {}): string {
  const record = {
    record_version: 1,
    task_id: taskId,
    summary_of_changes: "변경 요약",
    why: "변경 이유",
    files_changed: ["src/a.ts"],
    verification: {
      evaluations_run: [{ name: "test", level: 2, status: "pass" }],
      not_verified: [],
    },
    critic_findings: { total: 1, open_high_or_medium: 0 },
    human_approval: { approved: true, approver: "user", at: "2026-07-21T00:00:00Z" },
    known_limitations: [],
    out_of_scope_findings: [],
    docs_updated: { needed: false, updated: [] },
    lessons: { recorded: false, candidates: [] },
    rollback: { method: "git revert" },
    attempts: [{ attempt: 1, status: "pass", started_at: "2026-07-21T00:00:00Z", completed_at: "2026-07-21T00:01:00Z" }],
    evidence: [],
    context: { sources: [], total_chars: 0, omitted: [] },
    usage: {
      turns: "unknown",
      attempts: 1,
      input_tokens: "unknown",
      output_tokens: "unknown",
      cached_input_tokens: "unknown",
      evaluator_tokens: "unknown",
      tool_calls: "unknown",
      subagents: 0,
      estimated_cost: "unknown",
    },
    scope: { actual_files: ["src/a.ts"], outside_allowed: [], forbidden_touched: [] },
    ...overrides,
  };
  const dir = path.join(projectRoot, ".bass", "records");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${taskId}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
  return file;
}
