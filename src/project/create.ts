import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { bassRoot } from "../paths.js";
import { initProject, type InitOptions, type InitResult } from "./init.js";

export interface CreateProjectOptions
  extends Omit<InitOptions, "projectRoot" | "force"> {
  destination: string;
  install?: boolean;
}

export interface CreateProjectResult {
  projectRoot: string;
  packageArtifact?: string;
  packageInstalled: boolean;
  initialized: InitResult;
}

interface PackedArtifact {
  filename: string;
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runNpm(args: string[], cwd: string, timeout: number): string {
  const result = spawnSync(npmCommand(), args, {
    cwd,
    encoding: "utf8",
    timeout,
  });
  if (result.status !== 0) {
    const detail =
      result.error?.message ??
      result.stderr?.trim() ??
      result.stdout?.trim() ??
      "unknown npm error";
    throw new Error(`npm ${args[0]} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function packageName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return normalized || "bass-project";
}

function ensureNewProjectRoot(destination: string): string {
  const projectRoot = path.resolve(destination);
  if (projectRoot === path.parse(projectRoot).root) {
    throw new Error("Refusing to create a BASS project at the filesystem root.");
  }
  if (fs.existsSync(projectRoot)) {
    if (!fs.statSync(projectRoot).isDirectory()) {
      throw new Error(`Project destination is not a directory: ${projectRoot}`);
    }
    if (fs.readdirSync(projectRoot).length > 0) {
      throw new Error(
        `Project destination is not empty: ${projectRoot}. Use \`bass init\` to connect an existing project.`,
      );
    }
  } else {
    fs.mkdirSync(projectRoot, { recursive: true });
  }
  return projectRoot;
}

function ensurePackageJson(projectRoot: string, name: string): void {
  const packageFile = path.join(projectRoot, "package.json");
  if (fs.existsSync(packageFile)) return;
  fs.writeFileSync(
    packageFile,
    `${JSON.stringify({ name: packageName(name), version: "0.1.0", private: true }, null, 2)}\n`,
    "utf8",
  );
}

function packLocalBass(projectRoot: string): string {
  const toolsDir = path.join(projectRoot, "tools");
  fs.mkdirSync(toolsDir, { recursive: true });
  const output = runNpm(
    ["pack", "--ignore-scripts", "--json", "--pack-destination", toolsDir, bassRoot()],
    projectRoot,
    120_000,
  );
  let packed: PackedArtifact[];
  try {
    packed = JSON.parse(output) as PackedArtifact[];
  } catch {
    throw new Error(`npm pack returned invalid JSON: ${output}`);
  }
  const filename = packed[0]?.filename;
  if (!filename) throw new Error("npm pack did not report a package artifact.");
  const artifact = path.join(toolsDir, path.basename(filename));
  if (!fs.existsSync(artifact)) {
    throw new Error(`Packed BASS artifact is missing: ${artifact}`);
  }
  return artifact;
}

function installLocalBass(projectRoot: string, artifact: string): void {
  const relativeArtifact = `./${path.relative(projectRoot, artifact).split(path.sep).join("/")}`;
  runNpm(
    ["install", "--save-dev", "--no-audit", "--no-fund", relativeArtifact],
    projectRoot,
    180_000,
  );
}

/**
 * Create a new project root and connect it to the exact BASS package that
 * created it. Existing non-empty directories are intentionally rejected;
 * `bass init` remains the safe path for existing projects.
 */
export function createProject(options: CreateProjectOptions): CreateProjectResult {
  const projectRoot = ensureNewProjectRoot(options.destination);
  let packageArtifact: string | undefined;

  if (options.install !== false) {
    ensurePackageJson(projectRoot, options.name);
    packageArtifact = packLocalBass(projectRoot);
    installLocalBass(projectRoot, packageArtifact);
  }

  const initialized = initProject({
    projectRoot,
    name: options.name,
    profiles: options.profiles,
    owner: options.owner,
    withDesign: options.withDesign,
  });

  return {
    projectRoot,
    ...(packageArtifact ? { packageArtifact } : {}),
    packageInstalled: options.install !== false,
    initialized,
  };
}
