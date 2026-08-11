import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createProject } from "./create.js";
import {
  DEFAULT_ADAPTERS,
  DEFAULT_CAPABILITIES,
  initProject,
  type AdapterSelection,
  type CapabilitySelection,
  type InitResult,
} from "./init.js";

export interface SetupOptions {
  projectRoot: string;
  name?: string;
  profiles?: string[];
  owner?: string;
  withDesign?: boolean;
  capabilities?: CapabilitySelection;
  adapters?: AdapterSelection;
}

export interface SetupResult {
  mode: "create" | "init";
  projectRoot: string;
  initialized: InitResult;
}

export function setupProject(options: SetupOptions): SetupResult {
  const projectRoot = path.resolve(options.projectRoot);
  const exists = fs.existsSync(projectRoot);
  const empty = !exists || (fs.statSync(projectRoot).isDirectory() && fs.readdirSync(projectRoot).length === 0);
  const common = {
    name: options.name ?? path.basename(projectRoot),
    profiles: options.profiles ?? ["common"],
    owner: options.owner ?? "user",
    withDesign: options.withDesign ?? false,
    capabilities: options.capabilities ?? DEFAULT_CAPABILITIES,
    adapters: options.adapters ?? DEFAULT_ADAPTERS,
  };
  if (empty) {
    const created = createProject({ destination: projectRoot, ...common });
    return { mode: "create", projectRoot, initialized: created.initialized };
  }
  if (!fs.statSync(projectRoot).isDirectory()) throw new Error(`Not a directory: ${projectRoot}`);
  return { mode: "init", projectRoot, initialized: initProject({ projectRoot, ...common }) };
}

export function applyCapabilityAssignments(
  assignments: string[],
  base: CapabilitySelection = DEFAULT_CAPABILITIES,
): CapabilitySelection {
  const next = { ...base };
  const allowed: Record<string, string[]> = {
    specification: ["ouroboros", "builtin", "off"],
    simplicity: ["ponytail", "builtin", "off"],
    ui_direction: ["bass", "off"],
    ui_canvas: ["pen", "off"],
    html_report: ["bass", "off"],
  };
  for (const assignment of assignments) {
    const [name, provider, extra] = assignment.split("=");
    if (!name || !provider || extra !== undefined || !allowed[name]?.includes(provider)) {
      throw new Error(`Invalid capability "${assignment}". Expected name=provider.`);
    }
    (next as Record<string, string>)[name] = provider;
  }
  return next;
}

export async function promptCapabilities(base: CapabilitySelection = DEFAULT_CAPABILITIES): Promise<CapabilitySelection> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const defaults = Object.entries(base).map(([name, provider]) => `${name}=${provider}`).join(", ");
    const answer = await rl.question(`BASS capabilities (${defaults})\nEnter comma-separated overrides, or press Enter: `);
    if (!answer.trim()) return base;
    return applyCapabilityAssignments(answer.split(",").map((item) => item.trim()).filter(Boolean), base);
  } finally {
    rl.close();
  }
}
