import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { BASS_VERSION } from "../version.js";
import type {
  RuntimeAdapter,
  RuntimeCheck,
  RuntimeCheckReport,
  RuntimeCheckStatus,
  RuntimeContext,
  RuntimeDescriptor,
  RuntimeInstallReport,
  RuntimeScaffoldOptions,
  RuntimeScaffoldReport,
  RuntimeTarget,
  RuntimeVerificationReport,
} from "./domain.js";
import { loadManagedManifest, relativeProjectPath, stableJson, writeManagedFiles, type ManagedManifest } from "./managedFiles.js";
import { CapacitorMobileTargetAdapter } from "./adapters/capacitor.js";

export { targetAdapterCatalog } from "./adapters/capacitor.js";

interface RuntimeSpec { descriptor: RuntimeDescriptor; dependency?: { name: string; version: string } }

const SPECS: RuntimeSpec[] = [
  { descriptor: { id: "vanilla-web", name: "Vanilla Web Canvas/DOM", adapterVersion: "1.0.0", dimension: "2d", deployment: "web", description: "Zero-engine browser runtime for small prototypes.", capabilities: ["canvas", "dom", "pointer", "keyboard"], supportedTargets: ["web", "android", "ios"], license: "Platform APIs", licenseRisk: "low" } },
  { descriptor: { id: "pixi", name: "PixiJS", adapterVersion: "1.0.0", dimension: "2d", deployment: "web", description: "Renderer-focused 2D browser runtime.", packageName: "pixi.js", capabilities: ["webgl", "sprites", "pointer"], supportedTargets: ["web", "android", "ios"], license: "MIT", licenseRisk: "low" }, dependency: { name: "pixi.js", version: "^8.0.0" } },
  { descriptor: { id: "phaser", name: "Phaser", adapterVersion: "1.0.0", dimension: "2d", deployment: "web", description: "Full 2D game runtime with scenes and physics.", packageName: "phaser", capabilities: ["physics", "scenes", "audio", "sprites"], supportedTargets: ["web", "android", "ios"], license: "MIT", licenseRisk: "low" }, dependency: { name: "phaser", version: "^3.90.0" } },
  { descriptor: { id: "playcanvas", name: "PlayCanvas Engine", adapterVersion: "1.0.0", dimension: "3d", deployment: "web", description: "Browser-first 3D runtime.", packageName: "playcanvas", capabilities: ["webgl", "webgpu", "3d", "physics"], supportedTargets: ["web", "android", "ios"], license: "MIT", licenseRisk: "low" }, dependency: { name: "playcanvas", version: "^2.0.0" } },
  { descriptor: { id: "unity", name: "Unity", adapterVersion: "1.0.0", dimension: "either", deployment: "hybrid", description: "Native and WebGL runtime for complex games.", capabilities: ["physics", "animation", "webgl", "native"], supportedTargets: ["web", "android", "ios", "macos"], license: "Unity Terms", licenseRisk: "medium" } },
];

export function runtimeCatalog(): RuntimeAdapter[] {
  return SPECS.map((spec) => new BuiltinRuntimeAdapter(spec));
}

export function getRuntime(runtimeId: string): RuntimeAdapter {
  const adapter = runtimeCatalog().find((item) => item.descriptor().id === runtimeId);
  if (!adapter) throw new Error(`Unknown runtime "${runtimeId}". Run \`bass runtime list\`.`);
  return adapter;
}

export function parseRuntimeTargets(value: string): RuntimeTarget[] {
  const allowed = new Set<RuntimeTarget>(["web", "android", "ios", "macos"]);
  const targets = value.split(",").map((item) => item.trim()).filter(Boolean) as RuntimeTarget[];
  if (targets.length === 0 || targets.some((target) => !allowed.has(target))) throw new Error(`Invalid targets: ${value}`);
  return [...new Set(targets)];
}

class BuiltinRuntimeAdapter implements RuntimeAdapter {
  constructor(private readonly spec: RuntimeSpec) {}

  descriptor(): RuntimeDescriptor { return this.spec.descriptor; }

  doctor(context: RuntimeContext): RuntimeCheckReport {
    const checks: RuntimeCheck[] = [];
    if (this.spec.descriptor.id === "unity") {
      const roots = unityRoots();
      const found = roots.find((root) => fs.existsSync(root));
      checks.push({ id: "unity-editor", status: found ? "pass" : "not-verified", detail: found ? `Unity editor root: ${found}` : "Unity editor was not detected" });
    } else {
      const node = Number(process.versions.node.split(".")[0]) >= 20;
      checks.push({ id: "node", status: node ? "pass" : "fail", detail: node ? `Node.js ${process.versions.node}` : "Node.js 20+ required on host" });
      checks.push({ id: "npm", status: commandAvailable(npmCommand()) ? "pass" : "fail", detail: commandAvailable(npmCommand()) ? "npm available" : "npm unavailable" });
      if (context.targets.includes("android")) {
        const android = Boolean(process.env["ANDROID_HOME"] || process.env["ANDROID_SDK_ROOT"]);
        checks.push({ id: "capacitor-android-toolchain", status: android ? "pass" : "not-verified", detail: android ? "Android SDK detected" : "Android SDK was not detected on this host" });
      }
      if (context.targets.includes("ios")) {
        const ios = process.platform === "darwin" && fs.existsSync("/Applications/Xcode.app");
        checks.push({ id: "capacitor-ios-toolchain", status: ios ? "pass" : "not-verified", detail: ios ? "Xcode detected" : "iOS build toolchain requires Xcode on macOS" });
      }
    }
    for (const target of context.targets) {
      checks.push({ id: `target-${target}`, status: this.spec.descriptor.supportedTargets.includes(target) ? "pass" : "fail", detail: this.spec.descriptor.supportedTargets.includes(target) ? "supported" : "unsupported" });
    }
    return { runtime: this.spec.descriptor.id, status: overall(checks), checks };
  }

  scaffold(options: RuntimeScaffoldOptions): RuntimeScaffoldReport {
    try {
      const destination = relativeProjectPath(options.projectRoot, options.destination);
      const manifestFile = path.join(options.projectRoot, ".bass", "runtime", `${this.spec.descriptor.id}.json`);
      const previous = loadManagedManifest(manifestFile);
      const { report, managed } = writeManagedFiles(options.projectRoot, scaffoldFiles(this.spec, { ...options, destination }), previous);
      const manifest: ManagedManifest = { edition: "game", bassVersion: BASS_VERSION, adapterId: this.spec.descriptor.id, adapterVersion: this.spec.descriptor.adapterVersion, files: managed };
      fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
      fs.writeFileSync(manifestFile, stableJson(manifest), "utf8");
      return {
        runtime: this.spec.descriptor.id,
        status: report.conflicts.length ? "conflict" : report.created.length + report.updated.length ? "applied" : "unchanged",
        ...report,
      };
    } catch (error) {
      return { runtime: this.spec.descriptor.id, status: "failed", created: [], updated: [], unchanged: [], conflicts: [], message: error instanceof Error ? error.message : String(error) };
    }
  }

  install(runtimeRoot: string): RuntimeInstallReport {
    if (this.spec.descriptor.id === "unity") return { runtime: "unity", status: "skipped", message: "Open the generated project with Unity Hub." };
    const result = spawnSync(npmCommand(), ["install"], { cwd: runtimeRoot, encoding: "utf8", timeout: 180_000 });
    return result.status === 0
      ? { runtime: this.spec.descriptor.id, status: "installed", command: "npm install" }
      : { runtime: this.spec.descriptor.id, status: "failed", command: "npm install", message: result.error?.message ?? result.stderr?.trim() ?? "npm install failed" };
  }

  verify(runtimeRoot: string, targets: RuntimeTarget[]): RuntimeVerificationReport {
    const results = targets.map((target) => {
      if (!this.spec.descriptor.supportedTargets.includes(target)) return { target, status: "fail" as const, detail: "unsupported target" };
      if (this.spec.descriptor.id === "unity") return { target, status: "not-verified" as const, detail: "Run and record the project-specific Unity batch build." };
      if (target !== "web") return { target, status: "not-verified" as const, detail: "Run the native Capacitor build in the selected platform toolchain." };
      const result = spawnSync(npmCommand(), ["run", "build"], { cwd: runtimeRoot, encoding: "utf8", timeout: 120_000 });
      return result.status === 0 ? { target, status: "pass" as const, detail: "npm run build passed" } : { target, status: "fail" as const, detail: result.error?.message ?? result.stderr?.trim() ?? "build failed" };
    });
    return { runtime: this.spec.descriptor.id, status: overall(results), targets: results };
  }
}

function scaffoldFiles(spec: RuntimeSpec, options: RuntimeScaffoldOptions): Record<string, string> {
  const destination = options.destination;
  if (spec.descriptor.id === "unity") {
    return {
      [`${destination}/Assets/README.md`]: "# Game workspace\n\nKeep scenes and prefabs in feature-owned folders.\n",
      [`${destination}/Packages/manifest.json`]: stableJson({ dependencies: {} }),
      [`${destination}/ProjectSettings/ProjectVersion.txt`]: "m_EditorVersion: 6000.0.0f1\n",
    };
  }
  const dependencies: Record<string, string> = {};
  if (spec.dependency) dependencies[spec.dependency.name] = spec.dependency.version;
  const targetComposition = new CapacitorMobileTargetAdapter().compose(options);
  Object.assign(dependencies, targetComposition.dependencies);
  const files: Record<string, string> = {
    [`${destination}/package.json`]: stableJson({ name: packageName(options.projectName), private: true, version: "0.1.0", type: "module", scripts: { build: "vite build", dev: "vite", test: "vitest run" }, dependencies, devDependencies: { typescript: "^7.0.0", vite: "^7.0.0", vitest: "^4.0.0" } }),
    [`${destination}/index.html`]: "<!doctype html>\n<html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Game</title></head><body><main id=\"app\"></main><script type=\"module\" src=\"/src/main.ts\"></script></body></html>\n",
    [`${destination}/src/main.ts`]: `const app = document.querySelector<HTMLElement>("#app");\nif (app) app.textContent = ${JSON.stringify(`${spec.descriptor.name} ready`)};\n`,
    [`${destination}/tsconfig.json`]: stableJson({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true }, include: ["src"] }),
  };
  Object.assign(files, targetComposition.files);
  return files;
}

function packageName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "bass-game";
}

function overall(items: Array<{ status: RuntimeCheckStatus }>): RuntimeCheckStatus {
  if (items.some((item) => item.status === "fail")) return "fail";
  if (items.some((item) => item.status === "not-verified")) return "not-verified";
  return "pass";
}

function npmCommand(): string { return process.platform === "win32" ? "npm.cmd" : "npm"; }
function commandAvailable(command: string): boolean { return spawnSync(command, ["--version"], { stdio: "ignore", timeout: 3_000 }).status === 0; }
function unityRoots(): string[] {
  if (process.platform === "win32") return [path.join(process.env["ProgramFiles"] ?? "C:\\Program Files", "Unity", "Hub", "Editor")];
  if (process.platform === "darwin") return ["/Applications/Unity/Hub/Editor"];
  return [path.join(os.homedir(), "Unity", "Hub", "Editor"), "/opt/unity/editors"];
}
