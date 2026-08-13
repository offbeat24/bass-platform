import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { BassYaml } from "./bassYaml.js";

export type CapabilityState = "actual-plugin" | "builtin" | "off" | "missing" | "unauthenticated";

export interface CapabilityStatus {
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
  homeDir?: string;
  active?: Set<string>;
  authenticated?: Set<string>;
  commandAvailable?: (command: string) => boolean;
}

export function inspectCapabilities(config: BassYaml, options: CapabilityInspectionOptions = {}): CapabilityStatus[] {
  const active = options.active ?? envSet("BASS_ACTIVE_CAPABILITIES");
  const authenticated = options.authenticated ?? envSet("BASS_AUTHENTICATED_CAPABILITIES");
  return (Object.entries(config.capabilities) as Array<[keyof BassYaml["capabilities"], string]>).map(
    ([capability, selected]) => {
      if (selected === "off") return status(capability, selected, "off", false, null, null, false, "disabled for this project");
      if (selected === "builtin" || selected === "bass") {
        return status(capability, selected, "builtin", true, true, true, false, "provided by BASS");
      }

      const installed = providerInstalled(selected, options);
      const needsAuth = selected === "pen";
      const hasAuth = !needsAuth || authenticated.has(selected) || Boolean(process.env["PEN_API_KEY"]);
      const sessionActive = active.size > 0 ? active.has(selected) : null;
      if (!installed) return status(capability, selected, "missing", false, null, false, false, `${selected} is selected but not installed`);
      if (!hasAuth) return status(capability, selected, "unauthenticated", true, false, sessionActive, false, `${selected} is installed but authentication was not detected`);
      return status(
        capability,
        selected,
        "actual-plugin",
        true,
        true,
        sessionActive,
        sessionActive === false || sessionActive === null,
        sessionActive === true
          ? `${selected} is active in this host session`
          : `${selected} is installed; session activation cannot be confirmed, so start a new session after installation`,
      );
    },
  );
}

export function inspectProviders(config: BassYaml, options: CapabilityInspectionOptions = {}): CapabilityStatus[] {
  const builtins = new Set(["host", "bass", "events"]);
  const adapters: Array<[string, string]> = [
    ["runner", config.adapters.runner],
    ["context_provider", config.adapters.context_provider],
    ["workspace_executor", config.adapters.workspace_executor],
    ["collaboration_provider", config.adapters.collaboration_provider],
  ];
  const active = options.active ?? envSet("BASS_ACTIVE_CAPABILITIES");
  return [
    ...inspectCapabilities(config, options),
    ...adapters.map(([capability, selected]) => {
      if (builtins.has(selected)) {
        return status(capability, selected, "builtin", true, true, true, false, "provided by BASS or the active host");
      }
      const installed = providerInstalled(selected, options);
      const sessionActive = active.size > 0 ? active.has(selected) : null;
      if (!installed) {
        return status(capability, selected, "missing", false, null, false, false, `${selected} is selected but not installed`);
      }
      return status(
        capability,
        selected,
        "actual-plugin",
        true,
        true,
        sessionActive,
        sessionActive !== true,
        sessionActive === true
          ? `${selected} is active in this host session`
          : `${selected} is installed; host session activation must be confirmed before invocation`,
      );
    }),
  ];
}

function status(
  capability: string,
  selected: string,
  state: CapabilityState,
  installed: boolean,
  authenticated: boolean | null,
  sessionActive: boolean | null,
  restartRequired: boolean,
  detail: string,
): CapabilityStatus {
  return { capability, selected, state, installed, authenticated, sessionActive, restartRequired, detail };
}

function providerInstalled(provider: string, options: CapabilityInspectionOptions): boolean {
  const commands: Record<string, string[]> = {
    "prime-agent": ["prime-agent"],
    graft: ["graft"],
    omc: ["omc"],
    orca: ["orca"],
    buzz: ["buzz"],
  };
  if ((commands[provider] ?? [provider]).some((command) => (options.commandAvailable ?? commandAvailable)(command))) return true;
  const home = options.homeDir ?? os.homedir();
  const cacheNames: Record<string, string[]> = {
    omc: ["omc", "oh-my-claudecode"],
    "prime-agent": ["prime-agent"],
  };
  const roots = (cacheNames[provider] ?? [provider]).flatMap((name) => [
    path.join(home, ".codex", "plugins", "cache", name),
    path.join(home, ".claude", "plugins", "cache", name),
  ]);
  return roots.some((root) => fs.existsSync(root));
}

function commandAvailable(command: string): boolean {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  return spawnSync(locator, [command], { stdio: "ignore", timeout: 3_000 }).status === 0;
}

function envSet(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

export function formatCapabilityStatuses(statuses: CapabilityStatus[]): string {
  return statuses
    .map((item) => {
      const session = item.sessionActive === null ? "unknown" : item.sessionActive ? "active" : "inactive";
      return `[${item.state.toUpperCase()}] ${item.capability}=${item.selected} installed=${item.installed} session=${session}${item.restartRequired ? " restart=yes" : ""} — ${item.detail}`;
    })
    .join("\n");
}
