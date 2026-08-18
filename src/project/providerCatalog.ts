export type AgentHost = "codex" | "claude";

export interface ProviderHostBinding {
  pluginId: string;
  commands: readonly string[];
  mcpTools: readonly string[];
  cacheNames: readonly string[];
}

export interface ProviderDefinition {
  kind: "builtin" | "external";
  requiresAuth: boolean;
  authEnv: readonly string[];
  restartRequired: boolean;
  hosts: Partial<Record<AgentHost, ProviderHostBinding>>;
}

const bothHosts = (
  pluginId: string,
  commands: readonly string[] = [pluginId],
  mcpTools: readonly string[] = [],
  cacheNames: readonly string[] = [pluginId],
): Record<AgentHost, ProviderHostBinding> => ({
  codex: { pluginId, commands, mcpTools, cacheNames },
  claude: { pluginId, commands, mcpTools, cacheNames },
});

const builtin = (): ProviderDefinition => ({
  kind: "builtin",
  requiresAuth: false,
  authEnv: [],
  restartRequired: false,
  hosts: {},
});

/** Single source of truth for semantic provider IDs and host bindings. */
export const PROVIDER_CATALOG: Readonly<Record<string, ProviderDefinition>> = {
  off: builtin(),
  builtin: builtin(),
  bass: builtin(),
  host: builtin(),
  events: builtin(),
  ouroboros: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("ouroboros"),
  },
  ponytail: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("ponytail"),
  },
  pen: {
    kind: "external",
    requiresAuth: true,
    authEnv: ["PEN_API_KEY"],
    restartRequired: true,
    hosts: bothHosts("pen", [], ["pen"]),
  },
  "prime-agent": {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("prime-agent"),
  },
  graft: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("graft"),
  },
  omc: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: {
      claude: {
        pluginId: "oh-my-claudecode",
        commands: ["omc"],
        mcpTools: [],
        cacheNames: ["omc", "oh-my-claudecode"],
      },
    },
  },
  orca: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("orca"),
  },
  buzz: {
    kind: "external",
    requiresAuth: false,
    authEnv: [],
    restartRequired: true,
    hosts: bothHosts("buzz"),
  },
};

export function providerForCapabilityCall(capabilityCall: string): string | null {
  const provider = capabilityCall.split(":", 1)[0] ?? "";
  return PROVIDER_CATALOG[provider]?.kind === "external" ? provider : null;
}

export function providerDefinition(provider: string): ProviderDefinition | undefined {
  return PROVIDER_CATALOG[provider];
}
