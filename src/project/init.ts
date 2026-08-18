import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { templatesDir } from "../paths.js";
import { BASS_VERSION } from "../version.js";
import type { BassYaml } from "./bassYaml.js";

export type CapabilitySelection = BassYaml["capabilities"];
export type AdapterSelection = BassYaml["adapters"];

export const DEFAULT_CAPABILITIES: CapabilitySelection = {
  specification: "builtin",
  simplicity: "ponytail",
  ui_direction: "bass",
  ui_canvas: "off",
  html_report: "bass",
};

export const DEFAULT_ADAPTERS: AdapterSelection = {
  primary: "codex",
  compatibility: ["claude", "cursor"],
  runner: "host",
  context_provider: "bass",
  workspace_executor: "host",
  collaboration_provider: "events",
};

export interface InitOptions {
  projectRoot: string;
  name: string;
  profiles: string[];
  owner: string;
  withDesign: boolean;
  capabilities?: CapabilitySelection;
  adapters?: AdapterSelection;
  force?: boolean;
}

export interface InitResult {
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: string[];
}

export interface DoctorCheck {
  id: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

export const BASS_BLOCK_START = "<!-- bass:managed:start -->";
export const BASS_BLOCK_END = "<!-- bass:managed:end -->";
const MAX_AGENTS_BLOCK_BYTES = 2 * 1024;

export function initProject(opts: InitOptions): InitResult {
  const result: InitResult = { created: [], updated: [], skipped: [], conflicts: [] };
  const capabilities = opts.capabilities ?? DEFAULT_CAPABILITIES;
  const adapters = opts.adapters ?? DEFAULT_ADAPTERS;
  fs.mkdirSync(opts.projectRoot, { recursive: true });

  for (const relative of managedInstructionFiles(adapters)) {
    const absolute = path.join(opts.projectRoot, relative);
    if (fs.existsSync(absolute) && managedMarkersMalformed(fs.readFileSync(absolute, "utf8"))) {
      result.conflicts.push(relative);
    }
  }
  const existingBass = path.join(opts.projectRoot, "bass.yaml");
  if (fs.existsSync(existingBass) && configuredBassVersion(fs.readFileSync(existingBass, "utf8")) !== BASS_VERSION) {
    result.conflicts.push("bass.yaml");
  }
  if (result.conflicts.length > 0) return result;

  writeNewFile(opts.projectRoot, "bass.yaml", renderBassYaml(opts, capabilities, adapters), result, opts.force);
  updateManagedBlock(opts.projectRoot, "AGENTS.md", renderAgentsBlock(), result);

  if (adapters.compatibility.includes("claude") || adapters.primary === "claude") {
    updateManagedBlock(opts.projectRoot, "CLAUDE.md", renderClaudeShim(), result);
  }
  if (adapters.compatibility.includes("cursor") || adapters.primary === "cursor") {
    updateManagedBlock(
      opts.projectRoot,
      ".cursor/rules/bass.mdc",
      renderCursorShim(),
      result,
      "---\ndescription: BASS runtime entrypoint\nalwaysApply: true\n---\n",
    );
  }
  for (const [relative, template] of [
    ["PRODUCT.md", "PRODUCT.md"],
    ["TECH.md", "TECH.md"],
    ["DESIGN.md", "DESIGN.md"],
  ] as const) {
    writeNewFile(
      opts.projectRoot,
      relative,
      fs.readFileSync(path.join(templatesDir(), template), "utf8"),
      result,
    );
  }

  for (const dir of ["specs", ".bass/tasks", ".bass/records", ".bass/evidence", ".bass/cache"]) {
    const absolute = path.join(opts.projectRoot, dir);
    if (!fs.existsSync(absolute)) {
      fs.mkdirSync(absolute, { recursive: true });
      result.created.push(`${dir}/`);
    }
  }
  writeNewFile(opts.projectRoot, ".bass/events.jsonl", "", result);
  updateGitignore(opts.projectRoot, result);
  return result;
}

function writeNewFile(
  root: string,
  relative: string,
  content: string,
  result: InitResult,
  force = false,
): void {
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute) && !force) {
    result.skipped.push(relative);
    return;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const existed = fs.existsSync(absolute);
  fs.writeFileSync(absolute, content, "utf8");
  (existed ? result.updated : result.created).push(relative);
}

export function updateManagedBlock(
  root: string,
  relative: string,
  block: string,
  result: InitResult,
  initialContent = "",
): void {
  const absolute = path.join(root, relative);
  const existed = fs.existsSync(absolute);
  const current = existed ? fs.readFileSync(absolute, "utf8") : initialContent;
  if (managedMarkersMalformed(current)) {
    result.conflicts.push(relative);
    return;
  }
  const startCount = current.split(BASS_BLOCK_START).length - 1;
  const hasStart = startCount === 1;

  const managed = `${BASS_BLOCK_START}\n${block.trim()}\n${BASS_BLOCK_END}`;
  const next = hasStart
    ? current.replace(new RegExp(`${escapeRegExp(BASS_BLOCK_START)}[\\s\\S]*?${escapeRegExp(BASS_BLOCK_END)}`), managed)
    : `${current.trimEnd()}${current.trim().length ? "\n\n" : ""}${managed}\n`;
  if (Buffer.byteLength(managed, "utf8") > MAX_AGENTS_BLOCK_BYTES) {
    throw new Error(`BASS AGENTS.md block exceeds ${MAX_AGENTS_BLOCK_BYTES} bytes`);
  }
  if (next === current) {
    result.skipped.push(relative);
    return;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, next, "utf8");
  (existed ? result.updated : result.created).push(relative);
}

function renderBassYaml(opts: InitOptions, capabilities: CapabilitySelection, adapters: AdapterSelection): string {
  return `bass:
  version: ${BASS_VERSION}
  profiles: [${opts.profiles.join(", ")}]

project:
  name: ${yamlScalar(opts.name)}

execution:
  depth: adaptive
  verification: affected
  loop:
    no_progress_limit: 1
  parallel:
    max_agents: 2

context:
  max_chars: 12000

capabilities:
  specification: ${capabilities.specification}
  simplicity: ${capabilities.simplicity}
  ui_direction: ${capabilities.ui_direction}
  ui_canvas: ${capabilities.ui_canvas}
  html_report: ${capabilities.html_report}

adapters:
  primary: ${adapters.primary}
  compatibility: [${adapters.compatibility.join(", ")}]
  runner: ${adapters.runner}
  context_provider: ${adapters.context_provider}
  workspace_executor: ${adapters.workspace_executor}
  collaboration_provider: ${adapters.collaboration_provider}

evaluators:
  level1: []
  level2: []
  level3: []
`;
}

export function renderAgentsBlock(): string {
  return `BASS ${BASS_VERSION}: use \`bass agent guide --json\` before work.
- Humans own product direction, risk, and final judgment.
- Inspect facts; implement the smallest accepted change.
- Obey the plan fingerprint, task graph, scope, bounded loop, and gates.
- Claim named providers only after host-specific doctor confirmation.
- Run affected checks once; reuse unchanged passing evidence.
- Load selected product context only; keep full logs in task evidence.`;
}

export function renderClaudeShim(): string {
  return `Read the BASS managed block in \`AGENTS.md\`. Use \`bass agent guide --json\` as the dynamic execution contract. Do not copy the full BASS workflow here.`;
}

export function renderCursorShim(): string {
  return `Read the BASS managed block in AGENTS.md and use \`bass agent guide --json\`.`;
}

function updateGitignore(root: string, result: InitResult): void {
  const relative = ".gitignore";
  const absolute = path.join(root, relative);
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
  const lines = [".bass/cache/", ".bass/local.yaml", "!.bass/evidence/**/*.log"];
  const missing = lines.filter((line) => !current.split(/\r?\n/).includes(line));
  if (missing.length === 0) return;
  const next = `${current.trimEnd()}${current.trim().length ? "\n" : ""}${missing.join("\n")}\n`;
  fs.writeFileSync(absolute, next, "utf8");
  (current ? result.updated : result.created).push(relative);
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function doctor(projectRoot: string, effective: Record<string, unknown>): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const required = (relative: string, id: string): string | null => {
    const absolute = path.join(projectRoot, relative);
    if (!fs.existsSync(absolute)) {
      checks.push({ id, status: "fail", detail: `${relative} missing; run bass setup` });
      return null;
    }
    return fs.readFileSync(absolute, "utf8");
  };

  if (required("bass.yaml", "bass-yaml")) checks.push({ id: "bass-yaml", status: "pass" });
  const agents = required("AGENTS.md", "agents-entrypoint");
  if (agents) {
    const startCount = agents.split(BASS_BLOCK_START).length - 1;
    const endCount = agents.split(BASS_BLOCK_END).length - 1;
    checks.push({
      id: "agents-managed-block",
      status: startCount === 1 && endCount === 1 ? "pass" : "fail",
      detail: startCount === 1 && endCount === 1 ? undefined : "expected exactly one BASS managed block",
    });
  }

  const adapters = (effective["adapters"] ?? DEFAULT_ADAPTERS) as AdapterSelection;
  if (adapters.primary === "claude" || adapters.compatibility?.includes("claude")) {
    const claude = required("CLAUDE.md", "adapter-claude");
    if (claude) checks.push({ id: "adapter-claude-managed-block", status: hasOneManagedBlock(claude) ? "pass" : "fail", detail: hasOneManagedBlock(claude) ? undefined : "CLAUDE.md BASS managed block missing or malformed" });
  }
  if (adapters.primary === "cursor" || adapters.compatibility?.includes("cursor")) {
    const cursor = required(".cursor/rules/bass.mdc", "adapter-cursor");
    if (cursor) checks.push({ id: "adapter-cursor-managed-block", status: hasOneManagedBlock(cursor) ? "pass" : "fail", detail: hasOneManagedBlock(cursor) ? undefined : "Cursor BASS managed block missing or malformed" });
  }

  for (const relative of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
    checks.push({
      id: relative.toLowerCase().replace(".md", "-md"),
      status: fs.existsSync(path.join(projectRoot, relative)) ? "pass" : "fail",
      detail: fs.existsSync(path.join(projectRoot, relative)) ? undefined : `${relative} missing; run bass setup`,
    });
  }
  return checks;
}

function hasOneManagedBlock(content: string): boolean {
  return content.split(BASS_BLOCK_START).length === 2
    && content.split(BASS_BLOCK_END).length === 2
    && content.indexOf(BASS_BLOCK_START) < content.indexOf(BASS_BLOCK_END);
}

function managedMarkersMalformed(content: string): boolean {
  const startCount = content.split(BASS_BLOCK_START).length - 1;
  const endCount = content.split(BASS_BLOCK_END).length - 1;
  return startCount !== endCount
    || startCount > 1
    || (startCount === 1 && content.indexOf(BASS_BLOCK_START) > content.indexOf(BASS_BLOCK_END));
}

function managedInstructionFiles(adapters: AdapterSelection): string[] {
  const files = ["AGENTS.md"];
  if (adapters.primary === "claude" || adapters.compatibility.includes("claude")) files.push("CLAUDE.md");
  if (adapters.primary === "cursor" || adapters.compatibility.includes("cursor")) files.push(".cursor/rules/bass.mdc");
  return files;
}

function configuredBassVersion(content: string): string | null {
  try {
    const raw = parse(content) as { bass?: { version?: unknown } };
    return typeof raw?.bass?.version === "string" ? raw.bass.version : null;
  } catch {
    return null;
  }
}
