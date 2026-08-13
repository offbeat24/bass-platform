import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { TaskFile } from "../task/taskFile.js";

export interface SelectedContext {
  source: string;
  selector?: string;
  origin: "explicit" | "automatic";
  chars: number;
  sha256: string;
  content: string;
}

export interface OmittedContext {
  source: string;
  reason: string;
}

export interface ContextSelection {
  loaded: SelectedContext[];
  omitted: OmittedContext[];
  totalChars: number;
  maxChars: number;
}

interface ContextReference {
  source: string;
  selector?: string;
  origin: "explicit" | "automatic";
}

export function selectTaskContext(opts: {
  projectRoot: string;
  task?: TaskFile;
  profiles: string[];
  maxChars: number;
}): ContextSelection {
  const explicit = parseRelevantContext(opts.task?.sections.get("Relevant context") ?? "");
  const automatic = automaticReferences(opts.projectRoot, opts.task, opts.profiles);
  const references = dedupe([
    ...explicit.map((reference) => ({ ...reference, origin: "explicit" as const })),
    ...automatic,
  ]);
  const loaded: SelectedContext[] = [];
  const omitted: OmittedContext[] = [];
  let totalChars = 0;

  for (const reference of references) {
    const result = readReference(opts.projectRoot, reference);
    if ("reason" in result) {
      omitted.push({ source: displayReference(reference), reason: result.reason });
      continue;
    }
    if (totalChars + result.content.length > opts.maxChars) {
      omitted.push({ source: displayReference(reference), reason: `context budget ${opts.maxChars} chars exceeded` });
      continue;
    }
    totalChars += result.content.length;
    loaded.push({
      source: result.source,
      ...(reference.selector ? { selector: reference.selector } : {}),
      origin: reference.origin,
      chars: result.content.length,
      sha256: result.sha256,
      content: result.content,
    });
  }

  return { loaded, omitted, totalChars, maxChars: opts.maxChars };
}

function parseRelevantContext(value: string): Array<{ source: string; selector?: string }> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, "").replace(/^`|`$/g, ""))
    .filter((line) => line.length > 0 && !/^(none|없음)$/i.test(line))
    .filter(looksLikePath)
    .map(splitReference);
}

function looksLikePath(value: string): boolean {
  const candidate = value.split("#", 1)[0]!.trim();
  return candidate.startsWith(".")
    || candidate.startsWith("/")
    || candidate.includes("/")
    || /\.[a-z0-9]{1,8}$/i.test(candidate);
}

function splitReference(value: string): { source: string; selector?: string } {
  const hash = value.indexOf("#");
  if (hash < 0) return { source: value.trim() };
  const source = value.slice(0, hash).trim();
  const selector = value.slice(hash + 1).trim();
  return selector ? { source, selector } : { source };
}

function automaticReferences(
  projectRoot: string,
  task: TaskFile | undefined,
  profiles: string[],
): ContextReference[] {
  if (!task) return [];
  const references: ContextReference[] = [
    { source: "PRODUCT.md", selector: "Product intent", origin: "automatic" },
    { source: "TECH.md", selector: "Stack", origin: "automatic" },
    { source: "TECH.md", selector: "Architecture", origin: "automatic" },
  ];
  const taskText = [
    task.sections.get("Allowed scope") ?? "",
    task.sections.get("What we are shipping") ?? "",
    ...(task.frontmatter.capabilities ?? []),
    ...configuredSurfaces(task),
  ].join(" ");
  if (profiles.includes("web") || /\b(ui|ux|design|component|style|css|screen|화면|디자인)\b/i.test(taskText)) {
    references.push(
      { source: "DESIGN.md", selector: "Purpose", origin: "automatic" },
      { source: "DESIGN.md", selector: "Design principles", origin: "automatic" },
    );
  }
  return references.filter((reference) => fs.existsSync(path.join(projectRoot, reference.source)));
}

function configuredSurfaces(task: TaskFile): string[] {
  const value = task.frontmatter.config?.["changed_surfaces"];
  return Array.isArray(value) ? value.map(String) : [];
}

function dedupe(references: ContextReference[]): ContextReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.source}#${reference.selector ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readReference(
  projectRoot: string,
  reference: ContextReference,
): { source: string; content: string; sha256: string } | { reason: string } {
  if (path.isAbsolute(reference.source)) return { reason: "absolute paths are not portable" };
  const root = fs.realpathSync(projectRoot);
  const candidate = path.resolve(root, reference.source);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { reason: "path is outside project root" };
  }
  if (isSensitivePath(relative)) return { reason: "sensitive files are never loaded automatically" };
  if (!fs.existsSync(candidate)) return { reason: "file not found" };
  if (!fs.statSync(candidate).isFile()) return { reason: "not a file" };
  const realCandidate = fs.realpathSync(candidate);
  const realRelative = path.relative(root, realCandidate);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    return { reason: "resolved path is outside project root" };
  }

  const fullContent = fs.readFileSync(realCandidate, "utf8");
  const content = reference.selector ? markdownSection(fullContent, reference.selector) : fullContent;
  if (content === null) return { reason: `heading not found: ${reference.selector}` };
  return {
    source: relative.split(path.sep).join("/"),
    content: content.trim(),
    sha256: createHash("sha256").update(fullContent).digest("hex"),
  };
}

function markdownSection(content: string, selector: string): string | null {
  const lines = content.split(/\r?\n/);
  const target = normalizeHeading(selector);
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index]!.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (match && normalizeHeading(match[2]!) === target) {
      start = index;
      level = match[1]!.length;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    const match = lines[index]!.match(/^(#{1,6})\s+/);
    if (match && match[1]!.length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/[`*_]/g, "").toLowerCase();
}

function isSensitivePath(relative: string): boolean {
  return relative
    .split(path.sep)
    .some((part) => /^(\.env(?:\..*)?|\.npmrc|\.netrc|credentials?(?:\..*)?|secrets?(?:\..*)?|id_rsa|.+\.(?:pem|key|p12))$/i.test(part));
}

function displayReference(reference: ContextReference): string {
  return `${reference.source}${reference.selector ? `#${reference.selector}` : ""}`;
}
