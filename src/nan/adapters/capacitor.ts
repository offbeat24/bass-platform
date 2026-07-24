import type {
  ScaffoldOptions,
  TargetAdapter,
  TargetAdapterDescriptor,
  TargetComposition,
} from "../domain/runtime.js";

export class CapacitorMobileTargetAdapter implements TargetAdapter {
  descriptor(): TargetAdapterDescriptor {
    return {
      id: "capacitor-mobile",
      version: "1.0.0",
      name: "Capacitor Mobile Target",
      targets: ["android", "ios"],
      description: "Wraps a web runtime build for Android or iOS without changing its game domain.",
    };
  }

  compose(options: ScaffoldOptions): TargetComposition {
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
          `import type { CapacitorConfig } from "@capacitor/cli";\n\nconst config: CapacitorConfig = { appId: "com.nan2026.prototype", appName: "${options.projectName}", webDir: "dist" };\nexport default config;\n`,
      },
    };
  }
}

export function targetAdapters(): TargetAdapter[] {
  return [new CapacitorMobileTargetAdapter()];
}
