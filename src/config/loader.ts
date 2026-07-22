import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { ConfigLayer } from "../types.js";
import { profilePath } from "../paths.js";
import { loadBassYaml, type BassYaml } from "../project/bassYaml.js";
import { mergeLayers, explainLayers, maskSecrets } from "./merge.js";
import type { ResolvedConfigEntry } from "../types.js";

/** 최하위 계층: BASS 자체 기본값 */
const BUILT_IN_DEFAULTS: Record<string, unknown> = {
  models: {
    discovery: "reasoning-high",
    planner: "reasoning-high",
    worker: "auto",
    critic: "reasoning-high",
    summarizer: "fast-reliable",
    documentation: "balanced",
  },
  workflow: {
    max_active_tasks: 1,
    reviewer_required: true,
  },
  design_profile: false,
};

interface ProfileFile {
  name: string;
  extends?: string;
  defaults?: Record<string, unknown>;
  [key: string]: unknown;
}

/** extends 체인을 따라 프로파일을 낮은 우선순위 → 높은 우선순위 순으로 펼친다. */
export function resolveProfileChain(names: string[]): ConfigLayer[] {
  const layers: ConfigLayer[] = [];
  const seen = new Set<string>();

  const loadOne = (name: string): void => {
    if (seen.has(name)) return;
    const file = profilePath(name);
    if (!fs.existsSync(file)) {
      throw new Error(`Unknown profile "${name}" (expected at ${file})`);
    }
    const raw = parse(fs.readFileSync(file, "utf8")) as ProfileFile;
    if (raw.extends) loadOne(raw.extends);
    seen.add(name);

    const { name: _n, extends: _e, defaults, ...rest } = raw;
    layers.push({
      name: `profile:${name}`,
      source: file,
      values: { ...rest, ...(defaults ?? {}) },
    });
  };

  for (const name of names) loadOne(name);
  return layers;
}

export interface LoadConfigOptions {
  projectRoot: string;
  env?: string;
  taskValues?: Record<string, unknown>;
  runtimeOverrides?: Record<string, unknown>;
}

export interface LoadedConfig {
  bassYaml: BassYaml;
  layers: ConfigLayer[];
  effective: Record<string, unknown>;
}

export function loadConfig(opts: LoadConfigOptions): LoadedConfig {
  const bassYaml = loadBassYaml(opts.projectRoot);
  const layers: ConfigLayer[] = [
    { name: "bass-defaults", source: "built-in", values: BUILT_IN_DEFAULTS },
    ...resolveProfileChain(bassYaml.bass.profiles),
  ];

  const { bass: _bass, environments, ...projectValues } = bassYaml as unknown as Record<
    string,
    unknown
  > & { environments?: Record<string, Record<string, unknown>> };
  layers.push({
    name: "project",
    source: path.join(opts.projectRoot, "bass.yaml"),
    values: projectValues,
  });

  if (opts.env) {
    const envValues = environments?.[opts.env];
    if (!envValues) {
      throw new Error(`Environment "${opts.env}" not defined in bass.yaml`);
    }
    layers.push({
      name: `environment:${opts.env}`,
      source: path.join(opts.projectRoot, "bass.yaml"),
      values: envValues,
    });
  }

  if (opts.taskValues && Object.keys(opts.taskValues).length > 0) {
    layers.push({ name: "task", source: "task file", values: opts.taskValues });
  }

  if (opts.runtimeOverrides && Object.keys(opts.runtimeOverrides).length > 0) {
    layers.push({ name: "override", source: "runtime --set", values: opts.runtimeOverrides });
  }

  return { bassYaml, layers, effective: mergeLayers(layers) };
}

/** `bass config explain` 용: 키별 최종값·출처·override 이력 (비밀 마스킹 포함) */
export function explainConfig(config: LoadedConfig): ResolvedConfigEntry[] {
  return maskSecrets(explainLayers(config.layers));
}

/** "a.b.c=value" 형식의 --set 인자를 중첩 객체로 변환 */
export function parseSetArgs(args: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq < 1) throw new Error(`Invalid --set value: "${arg}" (expected key=value)`);
    const keys = arg.slice(0, eq).split(".");
    let rawValue: unknown = arg.slice(eq + 1);
    if (rawValue === "true") rawValue = true;
    else if (rawValue === "false") rawValue = false;
    else if (typeof rawValue === "string" && rawValue !== "" && !Number.isNaN(Number(rawValue)))
      rawValue = Number(rawValue);

    let cursor = out;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (typeof cursor[k] !== "object" || cursor[k] === null) cursor[k] = {};
      cursor = cursor[k] as Record<string, unknown>;
    }
    cursor[keys[keys.length - 1]!] = rawValue;
  }
  return out;
}
