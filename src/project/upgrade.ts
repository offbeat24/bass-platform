import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { BASS_VERSION } from "../version.js";
import { bassYamlSchema } from "./bassYaml.js";
import {
  BASS_BLOCK_END,
  BASS_BLOCK_START,
  DEFAULT_ADAPTERS,
  DEFAULT_CAPABILITIES,
  initProject,
  renderAgentsBlock,
  renderClaudeShim,
  renderCursorShim,
  type AdapterSelection,
} from "./init.js";

export interface UpgradePlan {
  fromVersion: string;
  toVersion: string;
  changes: string[];
  removals: string[];
  conflicts: string[];
  applied: boolean;
}

export function upgradeProject(projectRoot: string, apply = false): UpgradePlan {
  const file = path.join(projectRoot, "bass.yaml");
  if (!fs.existsSync(file)) throw new Error(`bass.yaml not found in ${projectRoot}`);
  const raw = parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const fromVersion = String((raw["bass"] as Record<string, unknown> | undefined)?.["version"] ?? "unknown");
  const changes: string[] = [];
  const removals: string[] = [];
  const conflicts: string[] = [];
  const existingAdapters = (raw["adapters"] as Record<string, unknown> | undefined) ?? {};

  if (fromVersion !== BASS_VERSION) changes.push(`bass.version: ${fromVersion} -> ${BASS_VERSION}`);
  if (!raw["execution"]) changes.push("add adaptive execution policy");
  if (!raw["context"]) changes.push("add selective context budget");
  if (!raw["capabilities"]) changes.push("add explicit capability selections");
  if (!raw["adapters"]) changes.push("add Codex primary and Claude/Cursor compatibility adapters");
  else if (["runner", "context_provider", "workspace_executor", "collaboration_provider"].some((key) => existingAdapters[key] === undefined)) {
    changes.push("add explicit runner, context, workspace, and collaboration provider defaults");
  }
  for (const artifact of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
    if (!fs.existsSync(path.join(projectRoot, artifact))) changes.push(`create missing ${artifact} template`);
  }
  if (fs.existsSync(path.join(projectRoot, "tasks"))) removals.push("stop writing root tasks/; keep it read-only for 0.2 compatibility");
  if (fs.existsSync(path.join(projectRoot, "records"))) removals.push("stop writing root records/; keep it read-only for 0.2 compatibility");

  planManagedBlock("AGENTS.md", renderAgentsBlock(), "a <=2KB BASS managed block");
  const plannedAdapters = { ...DEFAULT_ADAPTERS, ...existingAdapters } as AdapterSelection;
  if (plannedAdapters.primary === "claude" || plannedAdapters.compatibility.includes("claude")) {
    planManagedBlock("CLAUDE.md", renderClaudeShim(), "the thin Claude compatibility shim");
  }
  if (plannedAdapters.primary === "cursor" || plannedAdapters.compatibility.includes("cursor")) {
    planManagedBlock(".cursor/rules/bass.mdc", renderCursorShim(), "the thin Cursor compatibility shim");
  }

  function planManagedBlock(relative: string, block: string, label: string): void {
    const target = path.join(projectRoot, relative);
    if (!fs.existsSync(target)) {
      changes.push(`create ${relative} with ${label}`);
      return;
    }
    const current = fs.readFileSync(target, "utf8");
    const starts = current.split(BASS_BLOCK_START).length - 1;
    const ends = current.split(BASS_BLOCK_END).length - 1;
    if (starts !== ends || starts > 1) {
      conflicts.push(`${relative} has malformed or duplicate BASS managed markers`);
      return;
    }
    const expected = `${BASS_BLOCK_START}\n${block.trim()}\n${BASS_BLOCK_END}`;
    if (starts === 0) changes.push(`append ${label} to ${relative}`);
    else if (!current.includes(expected)) changes.push(`refresh only the BASS managed block in ${relative}`);
  }

  if (!apply) return { fromVersion, toVersion: BASS_VERSION, changes, removals, conflicts, applied: false };
  if (conflicts.length > 0) throw new Error(`Upgrade stopped:\n- ${conflicts.join("\n- ")}`);

  const bass = { ...((raw["bass"] as Record<string, unknown> | undefined) ?? {}), version: BASS_VERSION };
  const currentExecution = (raw["execution"] as Record<string, unknown> | undefined) ?? {};
  const next = {
    ...raw,
    bass,
    execution: {
      depth: "adaptive",
      verification: "affected",
      ...currentExecution,
      loop: currentExecution["loop"] ?? { no_progress_limit: 1 },
      parallel: currentExecution["parallel"] ?? { max_agents: 2 },
    },
    context: raw["context"] ?? { max_chars: 12_000 },
    capabilities: raw["capabilities"] ?? DEFAULT_CAPABILITIES,
    adapters: { ...DEFAULT_ADAPTERS, ...existingAdapters },
  };
  const parsed = bassYamlSchema.safeParse(next);
  if (!parsed.success) {
    throw new Error(`Cannot upgrade invalid bass.yaml: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  const nextYaml = stringify(next, { lineWidth: 0 });
  if (fs.readFileSync(file, "utf8") !== nextYaml) fs.writeFileSync(file, nextYaml, "utf8");

  const project = parsed.data.project;
  initProject({
    projectRoot,
    name: project.name,
    profiles: parsed.data.bass.profiles,
    owner: "user",
    withDesign: fs.existsSync(path.join(projectRoot, "DESIGN.md")),
    capabilities: parsed.data.capabilities,
    adapters: parsed.data.adapters,
  });
  return { fromVersion, toVersion: BASS_VERSION, changes, removals, conflicts, applied: true };
}

export function formatUpgradePlan(plan: UpgradePlan): string {
  const lines = [`BASS upgrade ${plan.fromVersion} -> ${plan.toVersion} (${plan.applied ? "applied" : "check only"})`];
  for (const change of plan.changes) lines.push(`  change: ${change}`);
  for (const removal of plan.removals) lines.push(`  compatibility: ${removal}`);
  for (const conflict of plan.conflicts) lines.push(`  conflict: ${conflict}`);
  if (plan.changes.length === 0 && plan.conflicts.length === 0) lines.push("No changes required.");
  if (!plan.applied) lines.push("No files changed. Run `bass upgrade --apply` to apply this plan.");
  return lines.join("\n");
}
