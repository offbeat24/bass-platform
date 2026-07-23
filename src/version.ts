import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface BassPackageMetadata {
  name: string;
  version: string;
}

let cachedMetadata: BassPackageMetadata | null = null;

/** package.json is the single source of truth for the installed CLI identity. */
export function loadPackageMetadata(): BassPackageMetadata {
  if (cachedMetadata) return cachedMetadata;

  const packageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const raw = JSON.parse(fs.readFileSync(packageFile, "utf8")) as Partial<BassPackageMetadata>;

  if (!raw.name || !raw.version) {
    throw new Error(`Invalid BASS package metadata: ${packageFile}`);
  }

  cachedMetadata = { name: raw.name, version: raw.version };
  return cachedMetadata;
}

export const BASS_PACKAGE = loadPackageMetadata();
export const BASS_VERSION = BASS_PACKAGE.version;
