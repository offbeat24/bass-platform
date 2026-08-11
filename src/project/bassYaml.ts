import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { BASS_PACKAGE, BASS_VERSION } from "../version.js";

const evaluatorSchema = z.object({
  name: z.string(),
  command: z.string(),
  timeout_ms: z.number().int().positive().optional(),
  surfaces: z.array(z.string()).optional(),
});

const capabilitySchema = z.object({
  specification: z.enum(["ouroboros", "builtin", "off"]).default("builtin"),
  simplicity: z.enum(["ponytail", "builtin", "off"]).default("ponytail"),
  ui_direction: z.enum(["bass", "off"]).default("bass"),
  ui_canvas: z.enum(["pen", "off"]).default("off"),
  html_report: z.enum(["bass", "off"]).default("bass"),
});

export const bassYamlSchema = z.object({
  bass: z.object({
    version: z.string(),
    profiles: z.array(z.string()).min(1),
  }),
  project: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
  execution: z
    .object({
      depth: z.enum(["adaptive", "fast", "standard", "hardened"]).default("adaptive"),
      verification: z.enum(["affected", "all"]).default("affected"),
    })
    .default({ depth: "adaptive", verification: "affected" }),
  capabilities: capabilitySchema.default({
    specification: "builtin",
    simplicity: "ponytail",
    ui_direction: "bass",
    ui_canvas: "off",
    html_report: "bass",
  }),
  adapters: z
    .object({
      primary: z.enum(["codex", "claude", "cursor"]).default("codex"),
      compatibility: z.array(z.enum(["codex", "claude", "cursor"])).default(["claude", "cursor"]),
    })
    .default({ primary: "codex", compatibility: ["claude", "cursor"] }),
  models: z.record(z.string(), z.string()).optional(),
  workflow: z
    .object({
      max_active_tasks: z.number().int().positive().optional(),
      reviewer_required: z.boolean().optional(),
    })
    .optional(),
  evaluators: z
    .object({
      level1: z.array(evaluatorSchema).optional(),
      level2: z.array(evaluatorSchema).optional(),
      level3: z.array(evaluatorSchema).optional(),
    })
    .optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  environments: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type BassYaml = z.infer<typeof bassYamlSchema>;
export type EvaluatorSpec = z.infer<typeof evaluatorSchema>;

export function loadBassYaml(projectRoot: string): BassYaml {
  const file = path.join(projectRoot, "bass.yaml");
  if (!fs.existsSync(file)) {
    throw new Error(`bass.yaml not found in ${projectRoot}`);
  }
  const raw = parse(fs.readFileSync(file, "utf8"));
  const result = bassYamlSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid bass.yaml (${file}):\n${issues}`);
  }
  if (result.data.bass.version !== BASS_VERSION) {
    throw new Error(
      `BASS version mismatch: project requires ${result.data.bass.version}, but the installed runtime is ${BASS_VERSION}. ` +
        `Install ${BASS_PACKAGE.name}@${result.data.bass.version}, or update bass.yaml only after reviewing the matching release notes.`,
    );
  }
  return result.data;
}
