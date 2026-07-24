import fs from "node:fs";
import path from "node:path";
import { promptLibraryDir, policyPath, profilePath } from "../paths.js";
import type { TaskFile } from "../task/taskFile.js";
import type { LoadedConfig } from "../config/loader.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { BASS_VERSION } from "../version.js";

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
  if (Array.isArray(checklist)) {
    profileLines.push("", "discovery checklist:");
    for (const item of checklist) profileLines.push(`- ${item}`);
  }
  const critics = opts.config.effective["critics"];
  if (Array.isArray(critics)) {
    profileLines.push("", `configured critics: ${critics.join(", ")}`);
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
  if (Boolean(opts.config.effective["design_profile"])) {
    projectParts.push(
      fs.existsSync(designMd)
        ? "UI 작업 전 반드시 프로젝트 루트의 DESIGN.md 를 읽어라. 디자인 의도의 단일 명세다."
        : "WARNING: design_profile 이 활성인데 DESIGN.md 가 없다. `bass init` 으로 생성하라.",
    );
  }
  parts.push({
    label: "project context",
    source: path.join(opts.projectRoot, "bass.yaml"),
    content: projectParts.join("\n"),
  });
  const nanWorkflow = path.join(opts.projectRoot, "nan", "AGENT_WORKFLOW.md");
  if (fs.existsSync(path.join(opts.projectRoot, "nan2026.yaml")) && fs.existsSync(nanWorkflow)) {
    parts.push(readPart("NAN 2026 workflow", nanWorkflow));
  }

  // 5. active policy
  const policyFile = policyPath("approval");
  const policyLines = [
    "다음 조건에 해당하면 구현 전에 정지하고 인간 승인을 요청한다.",
    "전체 목록: policies/approval.yaml",
  ];
  if (opts.task) {
    const triggered = findRequiredApprovals(opts.task.frontmatter);
    policyLines.push(
      "",
      triggered.length > 0
        ? `이 작업에서 이미 트리거된 승인 조건: ${triggered.map((t) => t.rule.id).join(", ")}`
        : "이 작업의 frontmatter 기준으로 사전 트리거된 승인 조건은 없다.",
    );
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
