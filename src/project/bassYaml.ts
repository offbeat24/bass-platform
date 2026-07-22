import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const evaluatorSchema = z.object({
  name: z.string(),
  command: z.string(),
  timeout_ms: z.number().int().positive().optional(),
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
  return result.data;
}
