import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ManagedFile { path: string; sha256: string }
export interface ManagedManifest {
  edition: "game";
  bassVersion: string;
  adapterId: string;
  adapterVersion: string;
  files: ManagedFile[];
}

export interface ManagedWriteReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  conflicts: string[];
}

export function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function stableJson(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sort(child)]));
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

export function loadManagedManifest(file: string): ManagedManifest | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ManagedManifest;
}

export function writeManagedFiles(
  root: string,
  files: Record<string, string>,
  previous: ManagedManifest | null,
): { report: ManagedWriteReport; managed: ManagedFile[] } {
  const report: ManagedWriteReport = { created: [], updated: [], unchanged: [], conflicts: [] };
  const prior = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const managed: ManagedFile[] = [];
  for (const relative of Object.keys(files).sort()) {
    const desired = files[relative]!;
    const desiredHash = sha256(desired);
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, desired, "utf8");
      report.created.push(relative);
      managed.push({ path: relative, sha256: desiredHash });
      continue;
    }
    const currentHash = sha256(fs.readFileSync(absolute));
    if (currentHash === desiredHash) {
      report.unchanged.push(relative);
      managed.push({ path: relative, sha256: desiredHash });
    } else if (prior.get(relative) === currentHash) {
      fs.writeFileSync(absolute, desired, "utf8");
      report.updated.push(relative);
      managed.push({ path: relative, sha256: desiredHash });
    } else {
      report.conflicts.push(relative);
      managed.push({ path: relative, sha256: prior.get(relative) ?? currentHash });
    }
  }
  return { report, managed };
}

export function relativeProjectPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Destination must be a child of the project root: ${candidate}`);
  }
  let cursor = resolvedRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Destination must not traverse a symbolic link: ${cursor}`);
    }
  }
  return relative.split(path.sep).join("/");
}
