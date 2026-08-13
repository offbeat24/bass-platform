import fs from "node:fs";
import path from "node:path";
import { initProject, type InitOptions, type InitResult } from "./init.js";

export interface CreateProjectOptions extends Omit<InitOptions, "projectRoot" | "force"> {
  destination: string;
  /** Compatibility only. BASS 0.4 never installs into the target repository. */
  install?: boolean;
}

export interface CreateProjectResult {
  projectRoot: string;
  packageInstalled: false;
  initialized: InitResult;
}

export function createProject(options: CreateProjectOptions): CreateProjectResult {
  const projectRoot = path.resolve(options.destination);
  if (projectRoot === path.parse(projectRoot).root) throw new Error("Refusing to create a project at the filesystem root.");
  if (fs.existsSync(projectRoot) && !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`Project destination is not a directory: ${projectRoot}`);
  }
  if (fs.existsSync(projectRoot) && fs.readdirSync(projectRoot).length > 0) {
    throw new Error(`Project destination is not empty: ${projectRoot}. Use \`bass setup\` to connect it.`);
  }
  fs.mkdirSync(projectRoot, { recursive: true });
  const initialized = initProject({
    projectRoot,
    name: options.name,
    profiles: options.profiles,
    owner: options.owner,
    withDesign: options.withDesign,
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.adapters ? { adapters: options.adapters } : {}),
  });
  return { projectRoot, packageInstalled: false, initialized };
}
