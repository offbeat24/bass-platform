import fs from "node:fs";
import path from "node:path";
import { promptLibraryDir, policyPath, profilePath } from "../paths.js";
import type { TaskFile } from "../task/taskFile.js";
import type { LoadedConfig } from "../config/loader.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { loadRiskApprovals } from "../task/approvalRecord.js";
import { buildExecutionPlan } from "../execution/planner.js";
import { BASS_VERSION } from "../version.js";
import { selectTaskContext } from "./context.js";

export interface ComposeOptions {
  projectRoot: string;
  config: LoadedConfig;
  role?: string;
  critic?: string;
  task?: TaskFile;
}

interface ComposedPart {
  label: string;
  source: string;
  content: string;
}

/**
 * 지침 조합기 (Core 프롬프트 §12).
 * base behavior + workflow role + profile + project context + policy + task 를
 * 출처 주석과 함께 하나의 지침으로 조합한다. 프로젝트마다 프롬프트를 복사하지 않는다.
 */
export function composeInstructions(opts: ComposeOptions): string {
  const parts: ComposedPart[] = [];
  const lib = promptLibraryDir();
  const plan = opts.task ? buildExecutionPlan(opts.config, opts.task) : undefined;

  // 1. base behavior
  parts.push(readPart("base behavior", path.join(lib, "base", "behavior.md")));

  // 2. workflow role
  if (opts.role) {
    parts.push(readPart(`role: ${opts.role}`, path.join(lib, "roles", `${opts.role}.md`)));
  }
  if (opts.critic) {
    parts.push(readPart(`critic: ${opts.critic}`, path.join(lib, "critics", `${opts.critic}.md`)));
  }

  // 3. project-type profile 요약
  const profiles = opts.config.bassYaml.bass.profiles;
  const profileLines: string[] = [`active profiles: ${profiles.join(", ")}`];
  const checklist = opts.config.effective["discovery_checklist"];
  if (opts.role === "discovery" && Array.isArray(checklist)) {
    profileLines.push("", "discovery checklist:");
    for (const item of checklist) profileLines.push(`- ${item}`);
  }
  if (plan) {
    profileLines.push("", `planned critics: ${plan.critics.join(", ") || "none"}`);
  }
  parts.push({
    label: "project-type profile",
    source: profiles.map((p) => profilePath(p)).join(", "),
    content: profileLines.join("\n"),
  });

  // 4. project-specific context
  const projectParts: string[] = [
    `project: ${opts.config.bassYaml.project.name}`,
    opts.config.bassYaml.project.description ?? "",
  ].filter(Boolean);
  const designMd = path.join(opts.projectRoot, "DESIGN.md");
  if (opts.critic === "design" || plan?.changedSurfaces.includes("ui")) {
    projectParts.push(
      fs.existsSync(designMd)
        ? "Use the relevant DESIGN.md sections for UI work; load more only when needed."
        : "Before UI implementation, establish DESIGN.md from product and code evidence.",
    );
  }
  parts.push({
    label: "project context",
    source: path.join(opts.projectRoot, "bass.yaml"),
    content: projectParts.join("\n"),
  });

  // 5. active policy
  const policyFile = policyPath("approval");
  const policyLines = [
    "Apply policies/approval.yaml; reuse recorded approvals and honor rejections.",
  ];
  if (opts.task) {
    const triggered = findRequiredApprovals(opts.task.frontmatter);
    const recorded = loadRiskApprovals(opts.projectRoot, opts.task.frontmatter.id);
    if (triggered.length === 0) policyLines.push("No policy approval is triggered for this task.");
    for (const { rule } of triggered) {
      const decision = recorded.find((entry) => entry.rule_id === rule.id)?.decision;
      policyLines.push(`${rule.id}: ${decision === "approved"
        ? "approved; do not ask again"
        : decision === "rejected"
          ? "rejected; do not proceed with the rejected action"
          : "pending; obtain and record the missing human decision before the affected action"}.`);
    }
  }
  parts.push({ label: "active policy", source: policyFile, content: policyLines.join("\n") });

  // 6. task specification
  if (opts.task) {
    parts.push({
      label: `task: ${opts.task.frontmatter.id}`,
      source: opts.task.filePath,
      content: fs.readFileSync(opts.task.filePath, "utf8"),
    });
  }

  // 7. task-selected repository context. Full documents remain on disk.
  const selected = selectTaskContext({
    projectRoot: opts.projectRoot,
    task: opts.task,
    profiles,
    maxChars: opts.config.bassYaml.context.max_chars,
  });
  for (const item of selected.loaded) {
    parts.push({
      label: `context: ${item.source}${item.selector ? `#${item.selector}` : ""}`,
      source: path.join(opts.projectRoot, item.source),
      content: item.content,
    });
  }
  parts.push({
    label: "context manifest",
    source: path.join(opts.projectRoot, "bass.yaml"),
    content: [
      `selected context: ${selected.totalChars}/${selected.maxChars} chars`,
      ...selected.loaded.map((item) => `- loaded ${item.origin}: ${item.source}${item.selector ? `#${item.selector}` : ""} (${item.chars} chars, sha256:${item.sha256})`),
      ...selected.omitted.map((item) => `- omitted: ${item.source} (${item.reason})`),
    ].join("\n"),
  });

  const header = [
    "<!-- composed by bass compose -->",
    `<!-- bass-platform v${BASS_VERSION} | composed at ${new Date().toISOString()} -->`,
    "<!-- 이 파일은 파생물이다. 수정하지 말고 원본(source 주석)을 수정하라. -->",
  ].join("\n");

  return [
    header,
    ...parts.map((p) => `\n<!-- section: ${p.label} | source: ${p.source} -->\n\n${p.content.trim()}`),
  ].join("\n");
}

function readPart(label: string, file: string): ComposedPart {
  if (!fs.existsSync(file)) {
    throw new Error(`Prompt part not found for "${label}": ${file}`);
  }
  return { label, source: file, content: fs.readFileSync(file, "utf8") };
}
