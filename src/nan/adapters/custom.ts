import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type {
  InstallReport,
  RuntimeAdapter,
  RuntimeCheckReport,
  RuntimeContext,
  RuntimeDescriptor,
  RuntimeTarget,
  ScaffoldOptions,
  ScaffoldReport,
  VerificationReport,
} from "../domain/runtime.js";

const descriptorSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9-]+$/),
  name: z.string().min(1),
  version: z.string().min(1),
  kind: z.literal("custom"),
  description: z.string(),
  suitedTags: z.array(z.string()),
  capabilities: z.array(z.string()),
  supportedTargets: z.array(z.enum(["web", "android", "ios", "macos"])),
  license: z.string(),
  licenseRisk: z.enum(["low", "medium", "high"]),
});

class CustomMetadataAdapter implements RuntimeAdapter {
  constructor(private readonly value: RuntimeDescriptor, private readonly source: string) {}
  descriptor(): RuntimeDescriptor {
    return this.value;
  }
  doctor(_context: RuntimeContext): RuntimeCheckReport {
    return {
      runtime: this.value.id,
      status: "not-verified",
      checks: [{ id: "custom-implementation", status: "not-verified", detail: `metadata only: ${this.source}` }],
    };
  }
  scaffold(_options: ScaffoldOptions): ScaffoldReport {
    return {
      runtime: this.value.id,
      status: "failed",
      created: [],
      unchanged: [],
      conflicts: [],
      message: "Custom metadata is registered, but no executable adapter implementation is installed.",
    };
  }
  install(_projectRoot: string): InstallReport {
    return { runtime: this.value.id, status: "skipped", message: "custom adapter has no install command" };
  }
  verify(_projectRoot: string, targets: RuntimeTarget[]): VerificationReport {
    return {
      runtime: this.value.id,
      status: "not-verified",
      targets: targets.map((target) => ({ target, status: "not-verified", detail: "custom verification not implemented" })),
    };
  }
}

export function loadCustomAdapters(projectRoot: string): RuntimeAdapter[] {
  const root = path.join(projectRoot, ".bass", "nan2026", "adapters");
  if (!fs.existsSync(root)) return [];
  const adapters: RuntimeAdapter[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "runtime.yaml");
    if (!fs.existsSync(file)) continue;
    const parsed = descriptorSchema.safeParse(parse(fs.readFileSync(file, "utf8")));
    if (!parsed.success) {
      throw new Error(`Invalid custom runtime descriptor ${file}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
    }
    adapters.push(new CustomMetadataAdapter(parsed.data, file));
  }
  return adapters;
}
