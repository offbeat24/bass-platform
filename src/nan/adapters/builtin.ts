import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type {
  InstallReport,
  RuntimeAdapter,
  RuntimeCheck,
  RuntimeCheckReport,
  RuntimeContext,
  RuntimeDescriptor,
  RuntimeTarget,
  ScaffoldOptions,
  ScaffoldReport,
  VerificationReport,
} from "../domain/runtime.js";
import { loadManagedManifest, stableJson, writeManagedFiles, type ManagedManifest } from "../managedFiles.js";
import { CapacitorMobileTargetAdapter } from "./capacitor.js";
import { BASS_VERSION } from "../../version.js";

interface AdapterSpec {
  descriptor: RuntimeDescriptor;
  dependency?: { name: string; version: string };
}

const BUILT_INS: AdapterSpec[] = [
  {
    descriptor: {
      id: "vanilla-web",
      name: "Vanilla Web Canvas/DOM",
      version: "1.0.0",
      kind: "web-2d",
      description: "Zero-engine web runtime for small, rule-driven prototypes.",
      suitedTags: ["simple", "canvas", "dom", "puzzle", "card"],
      capabilities: ["canvas", "dom", "pointer", "keyboard"],
      supportedTargets: ["web", "android", "ios"],
      license: "Platform APIs",
      licenseRisk: "low",
    },
  },
  {
    descriptor: {
      id: "pixi-web",
      name: "PixiJS Web",
      version: "1.0.0",
      kind: "web-2d",
      description: "Renderer-centered 2D runtime for grids, networks, queues, and drag interactions.",
      suitedTags: ["grid", "network", "queue", "drag", "2d"],
      capabilities: ["webgl", "canvas", "sprites", "pointer"],
      supportedTargets: ["web", "android", "ios"],
      license: "MIT",
      licenseRisk: "low",
    },
    dependency: { name: "pixi.js", version: "^8.0.0" },
  },
  {
    descriptor: {
      id: "phaser-web",
      name: "Phaser Web",
      version: "1.0.0",
      kind: "web-2d",
      description: "Full 2D game runtime for arenas, movement, collisions, and spawners.",
      suitedTags: ["arena", "movement", "collision", "spawner", "2d"],
      capabilities: ["physics", "scenes", "audio", "sprites"],
      supportedTargets: ["web", "android", "ios"],
      license: "MIT",
      licenseRisk: "low",
    },
    dependency: { name: "phaser", version: "^3.90.0" },
  },
  {
    descriptor: {
      id: "playcanvas-web",
      name: "PlayCanvas Engine",
      version: "1.0.0",
      kind: "web-3d",
      description: "Browser-first 3D runtime with WebGL/WebGPU delivery.",
      suitedTags: ["3d", "spatial", "camera", "physics", "browser"],
      capabilities: ["webgl", "webgpu", "3d", "physics"],
      supportedTargets: ["web", "android", "ios"],
      license: "MIT",
      licenseRisk: "low",
    },
    dependency: { name: "playcanvas", version: "^2.0.0" },
  },
  {
    descriptor: {
      id: "unity",
      name: "Unity",
      version: "1.0.0",
      kind: "native",
      description: "Runtime for complex physics, animation, WebGL, and native application targets.",
      suitedTags: ["3d", "physics", "animation", "native", "complex"],
      capabilities: ["physics", "animation", "webgl", "native"],
      supportedTargets: ["web", "android", "ios", "macos"],
      license: "Unity Terms",
      licenseRisk: "medium",
    },
  },
];

function commandAvailable(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, { stdio: "ignore", timeout: 5_000 });
  return result.status === 0;
}

function overall(checks: Array<{ status: "pass" | "fail" | "not-verified" }>): "pass" | "fail" | "not-verified" {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "not-verified")) return "not-verified";
  return "pass";
}

function packageFiles(spec: AdapterSpec, options: ScaffoldOptions): Record<string, string> {
  const destination = options.destination;
  if (spec.descriptor.id === "unity") {
    return {
      [`${destination}/Assets/README.md`]:
        "# NAN Unity workspace\n\nAdd scenes and prefabs in feature-owned folders. Do not edit the same Scene/Prefab concurrently.\n",
      [`${destination}/Packages/manifest.json`]: stableJson({ dependencies: {} }),
      [`${destination}/ProjectSettings/ProjectVersion.txt`]:
        "m_EditorVersion: 6000.5.4f1\nm_EditorVersionWithRevision: 6000.5.4f1\n",
    };
  }

  const dependencies: Record<string, string> = {};
  if (spec.dependency) dependencies[spec.dependency.name] = spec.dependency.version;
  const targetComposition = new CapacitorMobileTargetAdapter().compose(options);
  Object.assign(dependencies, targetComposition.dependencies);
  const files: Record<string, string> = {
    [`${destination}/package.json`]: stableJson({
      name: options.projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      private: true,
      version: BASS_VERSION,
      type: "module",
      scripts: { build: "vite build", dev: "vite", test: "vitest run" },
      dependencies,
      devDependencies: { typescript: "^7.0.0", vite: "^7.0.0", vitest: "^4.0.0" },
    }),
    [`${destination}/index.html`]:
      '<!doctype html>\n<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NAN Prototype</title></head><body><main id="app"></main><script type="module" src="/src/main.ts"></script></body></html>\n',
    [`${destination}/src/main.ts`]:
      `// ${spec.descriptor.name} adapter entry point. Keep theme/game rules in separate modules.\nconst app = document.querySelector<HTMLElement>("#app");\nif (app) app.textContent = "NAN vertical slice ready";\n`,
    [`${destination}/tsconfig.json`]: stableJson({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        noEmit: true,
      },
      include: ["src"],
    }),
  };
  Object.assign(files, targetComposition.files);
  return files;
}

class BuiltinAdapter implements RuntimeAdapter {
  constructor(private readonly spec: AdapterSpec) {}

  descriptor(): RuntimeDescriptor {
    return this.spec.descriptor;
  }

  doctor(context: RuntimeContext): RuntimeCheckReport {
    const checks: RuntimeCheck[] = [];
    if (this.spec.descriptor.id === "unity") {
      const unityRoot = "/Applications/Unity/Hub/Editor";
      const installed = fs.existsSync(unityRoot) && fs.readdirSync(unityRoot).length > 0;
      checks.push({
        id: "unity-editor",
        status: installed ? "pass" : "fail",
        detail: installed ? `Unity editor found under ${unityRoot}` : "Unity Hub editor not found",
      });
      for (const target of context.targets) {
        const moduleName =
          target === "web" ? "WebGLSupport" : target === "android" ? "AndroidPlayer" : target === "ios" ? "iOSSupport" : "MacStandaloneSupport";
        const found =
          installed &&
          fs
            .readdirSync(unityRoot)
            .some((version) => fs.existsSync(path.join(unityRoot, version, "PlaybackEngines", moduleName)));
        checks.push({
          id: `unity-module-${target}`,
          status: found ? "pass" : "not-verified",
          detail: found ? `${moduleName} installed` : `${moduleName} was not found`,
        });
      }
    } else {
      const nodeReady = commandAvailable("node") && Number(process.versions.node.split(".")[0]) >= 20;
      const npmReady = commandAvailable("npm");
      checks.push({
        id: "node",
        status: nodeReady ? "pass" : "fail",
        detail: nodeReady ? `Node.js ${process.versions.node} available` : "Node.js 20+ is required",
      });
      checks.push({
        id: "npm",
        status: npmReady ? "pass" : "fail",
        detail: npmReady ? "npm available" : "npm is required",
      });
      for (const target of context.targets.filter((item) => item === "android" || item === "ios")) {
        const verified =
          target === "android"
            ? Boolean(process.env["ANDROID_HOME"] || process.env["ANDROID_SDK_ROOT"])
            : fs.existsSync("/Applications/Xcode.app");
        checks.push({
          id: `native-${target}`,
          status: verified ? "pass" : "not-verified",
          detail: verified ? `${target} toolchain detected` : `${target} toolchain was not detected`,
        });
      }
    }
    return { runtime: this.spec.descriptor.id, status: overall(checks), checks };
  }

  scaffold(options: ScaffoldOptions): ScaffoldReport {
    try {
      const manifestRel = `.bass/nan2026/runtime-${this.spec.descriptor.id}.json`;
      const manifestFile = path.join(options.projectRoot, manifestRel);
      const previous = loadManagedManifest(manifestFile);
      const files = packageFiles(this.spec, options);
      const { report, managed } = writeManagedFiles(options.projectRoot, files, previous);
      const manifest: ManagedManifest = {
        edition: "nan2026",
        bassVersion: BASS_VERSION,
        templateVersion: "1.0.0",
        adapterVersions: { [this.spec.descriptor.id]: this.spec.descriptor.version },
        files: managed,
      };
      const nextManifest = stableJson(manifest);
      if (!fs.existsSync(manifestFile) || fs.readFileSync(manifestFile, "utf8") !== nextManifest) {
        fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
        fs.writeFileSync(manifestFile, nextManifest, "utf8");
      }
      return {
        runtime: this.spec.descriptor.id,
        status: report.conflicts.length > 0 ? "conflict" : report.created.length + report.updated.length > 0 ? "applied" : "unchanged",
        created: [...report.created, ...report.updated],
        unchanged: report.unchanged,
        conflicts: report.conflicts,
      };
    } catch (error) {
      return {
        runtime: this.spec.descriptor.id,
        status: "failed",
        created: [],
        unchanged: [],
        conflicts: [],
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  install(projectRoot: string): InstallReport {
    if (this.spec.descriptor.id === "unity") {
      return { runtime: this.spec.descriptor.id, status: "skipped", message: "Open the project with Unity Hub." };
    }
    const result = spawnSync("npm", ["install"], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 180_000,
    });
    return result.status === 0
      ? { runtime: this.spec.descriptor.id, status: "installed", command: "npm install" }
      : {
          runtime: this.spec.descriptor.id,
          status: "failed",
          command: "npm install",
          message: result.error?.message ?? result.stderr?.trim() ?? "npm install failed",
        };
  }

  verify(projectRoot: string, targets: RuntimeTarget[]): VerificationReport {
    const targetResults = targets.map((target) => {
      if (this.spec.descriptor.id === "unity") {
        return {
          target,
          status: "not-verified" as const,
          detail: "Unity batch build is project-specific; record a successful build before certification.",
        };
      }
      if (target !== "web") {
        return {
          target,
          status: "not-verified" as const,
          detail: `${target} native build has not been executed by BASS`,
        };
      }
      const packageFile = path.join(projectRoot, "package.json");
      if (!fs.existsSync(packageFile)) {
        return { target, status: "fail" as const, detail: `missing ${packageFile}` };
      }
      const result = spawnSync("npm", ["run", "build"], {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 120_000,
      });
      return result.status === 0
        ? { target, status: "pass" as const, detail: "npm run build passed" }
        : {
            target,
            status: "fail" as const,
            detail: result.error?.message ?? result.stderr?.trim() ?? "build failed",
          };
    });
    return { runtime: this.spec.descriptor.id, status: overall(targetResults), targets: targetResults };
  }
}

export function builtinAdapters(): RuntimeAdapter[] {
  return BUILT_INS.map((spec) => new BuiltinAdapter(spec));
}
