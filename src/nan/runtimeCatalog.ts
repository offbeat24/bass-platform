import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { builtinAdapters } from "./adapters/builtin.js";
import { loadCustomAdapters } from "./adapters/custom.js";
import type { NanConcept, RuntimeAdapter, RuntimeTarget } from "./domain/runtime.js";

const hardGateSchema = z
  .object({
    "theme-is-mechanic": z.boolean(),
    "one-sentence-playable-loop": z.boolean(),
    "representative-scene": z.boolean(),
    "vertical-slice-in-six-hours": z.boolean(),
    "maximum-two-new-core-systems": z.boolean(),
    "visible-player-feedback": z.boolean(),
    "shippable-evidence": z.boolean(),
  })
  .strict();

const conceptSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  axes: z.object({
    space: z.string(),
    coreVerb: z.string(),
    systemBehavior: z.string(),
    pressure: z.string(),
    themeCoupling: z.string(),
    visualReward: z.string(),
  }),
  representativeScene: z.string(),
  newCoreSystems: z.array(z.string()).max(2),
  hardGates: hardGateSchema,
  score: z.record(z.string(), z.number()),
  approvedBy: z.string().optional(),
});

export function runtimeCatalog(projectRoot?: string): RuntimeAdapter[] {
  const adapters = builtinAdapters();
  if (projectRoot) adapters.push(...loadCustomAdapters(projectRoot));
  const ids = new Set<string>();
  for (const adapter of adapters) {
    const id = adapter.descriptor().id;
    if (ids.has(id)) throw new Error(`Duplicate runtime id: ${id}`);
    ids.add(id);
  }
  return adapters.sort((a, b) => a.descriptor().id.localeCompare(b.descriptor().id));
}

export function getRuntime(runtimeId: string, projectRoot?: string): RuntimeAdapter {
  const adapter = runtimeCatalog(projectRoot).find((item) => item.descriptor().id === runtimeId);
  if (!adapter) throw new Error(`Unknown runtime "${runtimeId}". Run \`bass nan runtime list\`.`);
  return adapter;
}

export function loadConcept(projectRoot: string, conceptId: string): NanConcept {
  const file = path.join(projectRoot, "nan", "concepts", `${conceptId}.yaml`);
  if (!fs.existsSync(file)) throw new Error(`Concept not found: ${file}`);
  const result = conceptSchema.safeParse(parse(fs.readFileSync(file, "utf8")));
  if (!result.success) {
    throw new Error(`Invalid concept ${conceptId}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return result.data;
}

export function parseTargets(value: string): RuntimeTarget[] {
  const schema = z.array(z.enum(["web", "android", "ios", "macos"])).min(1);
  return schema.parse(value.split(",").map((item) => item.trim()).filter(Boolean));
}
