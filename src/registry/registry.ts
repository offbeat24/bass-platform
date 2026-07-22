import fs from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { AliasResolution, Capability } from "../types.js";
import { registryPath } from "../paths.js";

const mappingSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

const aliasSchema = z.object({
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  stable: mappingSchema,
  candidate: mappingSchema.optional(),
  fallback: z.string().nullable().default(null),
});

const registrySchema = z.object({
  version: z.number(),
  providers: z.record(z.string(), z.object({ channels: z.array(z.string()) })).default({}),
  aliases: z.record(z.string(), aliasSchema),
});

export type ModelRegistry = z.infer<typeof registrySchema>;
export type AliasEntry = z.infer<typeof aliasSchema>;

export function loadRegistry(file: string = registryPath()): ModelRegistry {
  if (!fs.existsSync(file)) throw new Error(`Model registry not found: ${file}`);
  const result = registrySchema.safeParse(parse(fs.readFileSync(file, "utf8")));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid model registry (${file}):\n${issues}`);
  }
  return result.data;
}

export interface ResolveOptions {
  /** candidate 채널 사용 (평가 목적) */
  channel?: "stable" | "candidate";
  /** 필요 capability. 부족하면 fallback 체인을 시도한다. */
  requiredCapabilities?: Capability[];
}

/**
 * alias 또는 "pin:provider/model" 표기를 실제 모델로 해석한다.
 * capability mismatch 시 fallback 체인을 따라가며, 순환은 감지해 중단한다.
 */
export function resolveAlias(
  registry: ModelRegistry,
  aliasOrPin: string,
  opts: ResolveOptions = {},
): AliasResolution {
  if (aliasOrPin.startsWith("pin:")) {
    const spec = aliasOrPin.slice(4);
    const slash = spec.indexOf("/");
    if (slash < 1) throw new Error(`Invalid pin "${aliasOrPin}" (expected pin:provider/model)`);
    return {
      alias: aliasOrPin,
      channel: "pinned",
      provider: spec.slice(0, slash),
      model: spec.slice(slash + 1),
      capabilities: [],
      fallbackChain: [],
      notes: "explicit pin — registry capabilities not checked",
    };
  }

  const channel = opts.channel ?? "stable";
  const required = opts.requiredCapabilities ?? [];
  const chain: string[] = [];
  let current: string | null = aliasOrPin;

  while (current !== null) {
    if (chain.includes(current)) {
      throw new Error(`Fallback cycle detected: ${[...chain, current].join(" -> ")}`);
    }
    chain.push(current);

    const entry: AliasEntry | undefined = registry.aliases[current];
    if (!entry) throw new Error(`Unknown model alias "${current}"`);

    const caps = entry.capabilities as Capability[];
    const missing = required.filter((c) => !caps.includes(c));
    if (missing.length === 0) {
      const mapping = channel === "candidate" && entry.candidate ? entry.candidate : entry.stable;
      const usedChannel = channel === "candidate" && entry.candidate ? "candidate" : "stable";
      return {
        alias: aliasOrPin,
        channel: usedChannel,
        provider: mapping.provider,
        model: mapping.model,
        capabilities: caps,
        fallbackChain: chain.length > 1 ? chain : [],
        ...(channel === "candidate" && !entry.candidate
          ? { notes: `no candidate for "${current}", using stable` }
          : {}),
      };
    }
    current = entry.fallback;
  }

  throw new Error(
    `No alias in fallback chain [${chain.join(" -> ")}] satisfies capabilities: ${required.join(", ")}`,
  );
}
