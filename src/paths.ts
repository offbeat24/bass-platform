import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** bass-platform 설치 루트 (registry/, profiles/, policies/ 의 부모) */
export function bassRoot(): string {
  // src/paths.ts 또는 dist/paths.js 기준 한 단계 위
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function registryPath(): string {
  return path.join(bassRoot(), "registry", "models.yaml");
}

export function profilePath(name: string): string {
  return path.join(bassRoot(), "profiles", `${name}.yaml`);
}

export function policyPath(name: string): string {
  return path.join(bassRoot(), "policies", `${name}.yaml`);
}

export function promptLibraryDir(): string {
  return path.join(bassRoot(), "prompt-library");
}

export function templatesDir(): string {
  return path.join(bassRoot(), "templates");
}

/** cwd에서 위로 올라가며 bass.yaml 이 있는 프로젝트 루트를 찾는다. */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, "bass.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
