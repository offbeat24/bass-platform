import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ManagedFile {
  path: string;
  sha256: string;
}

export interface ManagedManifest {
  edition: "nan2026";
  bassVersion: string;
  templateVersion: string;
  adapterVersions: Record<string, string>;
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
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

export function loadManagedManifest(file: string): ManagedManifest | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ManagedManifest;
}

/**
 * Write generated files without overwriting user edits. A previously managed file
 * may be updated only while its current checksum still matches the old manifest.
 */
export function writeManagedFiles(
  root: string,
  files: Record<string, string>,
  previous: ManagedManifest | null,
): { report: ManagedWriteReport; managed: ManagedFile[] } {
  const report: ManagedWriteReport = { created: [], updated: [], unchanged: [], conflicts: [] };
  const prior = new Map((previous?.files ?? []).map((file) => [file.path, file.sha256]));
  const managed: ManagedFile[] = [];

  for (const rel of Object.keys(files).sort()) {
    const content = files[rel]!;
    const desiredHash = sha256(content);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      report.created.push(rel);
      managed.push({ path: rel, sha256: desiredHash });
      continue;
    }

    const current = fs.readFileSync(abs);
    const currentHash = sha256(current);
    if (currentHash === desiredHash) {
      report.unchanged.push(rel);
      managed.push({ path: rel, sha256: desiredHash });
      continue;
    }

    if (prior.get(rel) === currentHash) {
      fs.writeFileSync(abs, content, "utf8");
      report.updated.push(rel);
      managed.push({ path: rel, sha256: desiredHash });
      continue;
    }

    report.conflicts.push(rel);
    // Keep ownership in the manifest at the current user-edited checksum so future
    // runs keep reporting the conflict instead of silently adopting the template.
    managed.push({ path: rel, sha256: prior.get(rel) ?? currentHash });
  }

  return { report, managed };
}

export function relativeProjectPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === "" || rel === "." || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Destination must be a child of the project root: ${candidate}`);
  }
  let cursor = resolvedRoot;
  for (const segment of rel.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Destination must not traverse a symbolic link: ${cursor}`);
    }
  }
  return rel;
}
