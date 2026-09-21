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

const semanticSchema = z.object({
  mode: z.enum(["off", "enforce"]).default("off"),
  provider: z.literal("typesafe").default("typesafe"),
  model: z.string().min(1).default("jev-1.13.0"),
  input_usd_per_million: z.number().positive().max(100).optional(),
  document_paths: z.array(z.string().min(1)).default([]),
  max_usd: z.number().positive().max(100).default(0.05),
}).superRefine((value, context) => {
  if (value.model !== "jev-1.13.0" && value.input_usd_per_million === undefined) {
    context.addIssue({ code: "custom", path: ["input_usd_per_million"], message: "set the current price explicitly for a different model" });
  }
}).default({ mode: "off", provider: "typesafe", model: "jev-1.13.0", document_paths: [], max_usd: 0.05 });

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
      loop: z
        .object({
          max_turns: z.number().int().positive().max(100).optional(),
          max_attempts: z.number().int().positive().max(10).optional(),
          max_minutes: z.number().int().positive().max(1_440).optional(),
          no_progress_limit: z.number().int().positive().max(5).default(1),
        })
        .default({ no_progress_limit: 1 }),
      parallel: z
        .object({
          max_agents: z.number().int().min(1).max(3).default(2),
        })
        .default({ max_agents: 2 }),
    })
    .default({
      depth: "adaptive",
      verification: "affected",
      loop: { no_progress_limit: 1 },
      parallel: { max_agents: 2 },
    }),
  context: z
    .object({
      max_chars: z.number().int().positive().max(100_000).default(12_000),
    })
    .default({ max_chars: 12_000 }),
  semantic: semanticSchema,
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
      runner: z.enum(["host", "prime-agent"]).default("host"),
      context_provider: z.enum(["bass", "graft"]).default("bass"),
      workspace_executor: z.enum(["host", "omc", "orca"]).default("host"),
      collaboration_provider: z.enum(["events", "buzz"]).default("events"),
    })
    .default({
      primary: "codex",
      compatibility: ["claude", "cursor"],
      runner: "host",
      context_provider: "bass",
      workspace_executor: "host",
      collaboration_provider: "events",
    }),
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
