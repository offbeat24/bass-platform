import type {
  RuntimeScaffoldOptions,
  TargetAdapter,
  TargetAdapterDescriptor,
  TargetComposition,
} from "../domain.js";

export class CapacitorMobileTargetAdapter implements TargetAdapter {
  descriptor(): TargetAdapterDescriptor {
    return {
      id: "capacitor-mobile",
      adapterVersion: "1.0.0",
      name: "Capacitor Mobile Target",
      targets: ["android", "ios"],
      description: "Wraps an explicitly selected web runtime for Android or iOS.",
    };
  }

  compose(options: RuntimeScaffoldOptions): TargetComposition {
    const mobile = options.targets.filter((target) => target === "android" || target === "ios");
    if (mobile.length === 0) return { dependencies: {}, files: {} };

    const dependencies: Record<string, string> = {
      "@capacitor/core": "^7.0.0",
      "@capacitor/cli": "^7.0.0",
    };
    if (mobile.includes("android")) dependencies["@capacitor/android"] = "^7.0.0";
    if (mobile.includes("ios")) dependencies["@capacitor/ios"] = "^7.0.0";

    return {
      dependencies,
      files: {
        [`${options.destination}/capacitor.config.ts`]:
          `import type { CapacitorConfig } from "@capacitor/cli";\nconst config: CapacitorConfig = { appId: "com.offbeat24.game", appName: ${JSON.stringify(options.projectName)}, webDir: "dist" };\nexport default config;\n`,
      },
    };
  }
}

export function targetAdapterCatalog(): TargetAdapter[] {
  return [new CapacitorMobileTargetAdapter()];
}
