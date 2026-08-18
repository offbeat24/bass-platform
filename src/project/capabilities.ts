import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { BassYaml } from "./bassYaml.js";
import {
  providerDefinition,
  type AgentHost,
  type ProviderHostBinding,
} from "./providerCatalog.js";

export type CapabilityState =
  | "actual-plugin"
  | "builtin"
  | "off"
  | "missing"
  | "unauthenticated"
  | "unsupported";

export interface CapabilityStatus {
  host: AgentHost;
  capability: string;
  selected: string;
  state: CapabilityState;
  installed: boolean;
  authenticated: boolean | null;
  sessionActive: boolean | null;
  restartRequired: boolean;
  detail: string;
}

export interface CapabilityInspectionOptions {
  host?: AgentHost;
  homeDir?: string;
  active?: Set<string>;
  authenticated?: Set<string>;
  allowGenericEnv?: boolean;
  commandAvailable?: (command: string) => boolean;
}

export function inspectCapabilities(
  config: BassYaml,
  options: CapabilityInspectionOptions = {},
): CapabilityStatus[] {
  return (Object.entries(config.capabilities) as Array<[keyof BassYaml["capabilities"], string]>).map(
    ([capability, selected]) => inspectSelection(capability, selected, options),
  );
}

export function inspectProviders(
  config: BassYaml,
  options: CapabilityInspectionOptions = {},
): CapabilityStatus[] {
  const adapters: Array<[string, string]> = [
    ["runner", config.adapters.runner],
    ["context_provider", config.adapters.context_provider],
    ["workspace_executor", config.adapters.workspace_executor],
    ["collaboration_provider", config.adapters.collaboration_provider],
  ];
  return [
    ...inspectCapabilities(config, options),
    ...adapters.map(([capability, selected]) => inspectSelection(capability, selected, options)),
  ];
}

function inspectSelection(
  capability: string,
  selected: string,
  options: CapabilityInspectionOptions,
): CapabilityStatus {
  const host = options.host ?? "codex";
  const definition = providerDefinition(selected);
  if (selected === "off") {
    return status(host, capability, selected, "off", false, null, null, false, "disabled for this project");
  }
  if (!definition) {
    return status(host, capability, selected, "unsupported", false, null, null, false, `${selected} is not in the provider catalog`);
  }
  if (definition.kind === "builtin") {
    return status(host, capability, selected, "builtin", true, true, true, false, "provided by BASS or the active host");
  }
  const binding = definition.hosts[host];
  if (!binding) {
    return status(host, capability, selected, "unsupported", false, null, null, false, `${selected} does not support ${host}`);
  }

  const active = options.active ?? hostEnvSet(host, "ACTIVE", options.allowGenericEnv !== false);
  const authenticated = options.authenticated ?? hostEnvSet(host, "AUTHENTICATED", options.allowGenericEnv !== false);
  const installed = providerInstalled(host, binding, options);
  const hasAuth = !definition.requiresAuth
    || authenticated.has(selected)
    || definition.authEnv.some((name) => Boolean(process.env[name]));
  const sessionActive = active.size > 0
    ? active.has(selected) || active.has(binding.pluginId)
    : null;
  if (!installed) {
    return status(host, capability, selected, "missing", false, null, false, false, `${selected} is selected but not installed for ${host}`);
  }
  if (!hasAuth) {
    return status(host, capability, selected, "unauthenticated", true, false, sessionActive, false, `${selected} is installed for ${host} but authentication was not detected`);
  }
  return status(
    host,
    capability,
    selected,
    "actual-plugin",
    true,
    true,
    sessionActive,
    definition.restartRequired && sessionActive !== true,
    sessionActive === true
      ? `${selected} is active in the ${host} session`
      : `${selected} is installed for ${host}; start a new session and confirm activation before invocation`,
  );
}

function status(
  host: AgentHost,
  capability: string,
  selected: string,
  state: CapabilityState,
  installed: boolean,
  authenticated: boolean | null,
  sessionActive: boolean | null,
  restartRequired: boolean,
  detail: string,
): CapabilityStatus {
  return { host, capability, selected, state, installed, authenticated, sessionActive, restartRequired, detail };
}

function providerInstalled(
  host: AgentHost,
  binding: ProviderHostBinding,
  options: CapabilityInspectionOptions,
): boolean {
  const available = options.commandAvailable ?? commandAvailable;
  if (binding.commands.some((command) => available(command))) return true;
  const home = options.homeDir ?? os.homedir();
  const root = host === "codex" ? ".codex" : ".claude";
  const cacheRoot = path.join(home, root, "plugins", "cache");
  if (!fs.existsSync(cacheRoot)) return false;
  const marketplaces = fs.readdirSync(cacheRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const candidates = binding.cacheNames.flatMap((name) => [
    path.join(cacheRoot, name),
    ...marketplaces.map((marketplace) => path.join(cacheRoot, marketplace.name, name)),
  ]);
  return candidates.some((candidate) => cachedPlugin(candidate, host));
}

function cachedPlugin(candidate: string, host: AgentHost): boolean {
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) return false;
  const manifest = host === "codex" ? ".codex-plugin" : ".claude-plugin";
  if (fs.existsSync(path.join(candidate, manifest, "plugin.json"))) return true;
  return fs.readdirSync(candidate, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() && fs.existsSync(path.join(candidate, entry.name, manifest, "plugin.json")),
  );
}

function commandAvailable(command: string): boolean {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(locator, [command], { stdio: "ignore", timeout: 3_000 }).status === 0;
}

function envSet(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

function hostEnvSet(host: AgentHost, kind: "ACTIVE" | "AUTHENTICATED", allowGeneric: boolean): Set<string> {
  const specific = envSet(`BASS_${host.toUpperCase()}_${kind}_CAPABILITIES`);
  return specific.size > 0 || !allowGeneric ? specific : envSet(`BASS_${kind}_CAPABILITIES`);
}

export function formatCapabilityStatuses(statuses: CapabilityStatus[]): string {
  return statuses
    .map((item) => {
      const session = item.sessionActive === null ? "unknown" : item.sessionActive ? "active" : "inactive";
      return `[${item.host.toUpperCase()}][${item.state.toUpperCase()}] ${item.capability}=${item.selected} installed=${item.installed} session=${session}${item.restartRequired ? " restart=yes" : ""} — ${item.detail}`;
    })
    .join("\n");
}
