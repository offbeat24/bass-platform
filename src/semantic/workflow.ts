import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LoadedConfig } from "../config/loader.js";
import { readSafeProjectText } from "../compose/context.js";
import type { TaskFile } from "../task/taskFile.js";
import { askSemantic, semanticCost, semanticStore, SEMANTIC_POLICY_VERSION, type SemanticQuestion } from "./client.js";
import { appendEvent } from "../task/events.js";

const findingSchema = z.object({ id: z.string(), subject: z.string(), status: z.enum(["pass", "problem", "uncertain"]), confidence: z.number().min(0).max(1), source: z.string() });
type Finding = z.infer<typeof findingSchema>;
const referenceSchema = z.object({ source: z.string(), selector: z.string().optional(), line: z.number().int().positive().optional(), quote: z.string().optional(), sha256: z.string() });
const stageSchema = z.object({
  stage: z.enum(["prepare", "verify"]), input_hash: z.string(), model: z.string(),
  status: z.enum(["pass", "needs-work", "error"]), findings: z.array(findingSchema),
  references: z.array(referenceSchema).default([]), recommendation: z.object({ kind: z.string(), surface: z.string() }).optional(),
  context_decisions: z.array(referenceSchema.extend({ score: z.number().optional(), selected: z.boolean(), reason: z.string() })).optional(),
  detail: z.string().optional(),
});
export type SemanticStage = z.infer<typeof stageSchema>;
const resolutionSchema = z.object({ finding_id: z.string(), input_hash: z.string(), reason: z.string().min(1), approver: z.string().min(1), at: z.string() });

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function taskStore(projectRoot: string, taskId: string): string { return path.join(semanticStore(projectRoot), taskId); }
function stagePath(projectRoot: string, taskId: string, stage: "prepare" | "verify"): string { return path.join(taskStore(projectRoot, taskId), `${stage}.json`); }
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
function taskInput(task: TaskFile, config: LoadedConfig): string {
  const { status: _status, ...frontmatter } = task.frontmatter;
  return digest({ policy: SEMANTIC_POLICY_VERSION, frontmatter, sections: [...task.sections], semantic: config.bassYaml.semantic, context: config.bassYaml.context });
}
function paragraphs(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}
function verdict(answer: { choice: string; confidence: number }, subject: string, source: string): Finding {
  const status = answer.confidence < 0.8 ? "uncertain" : answer.choice === "pass" ? "pass" : answer.choice === "problem" ? "problem" : "uncertain";
  return { id: digest({ source, subject }).slice(0, 16), subject, source, status, confidence: answer.confidence };
}
export function choice(instructions: string): SemanticQuestion {
  return { type: "choice", instructions, criteria: {
    pass: "The stated condition is clearly satisfied by the supplied text.",
    problem: "The stated condition is clearly violated by the supplied text.",
    uncertain: "The supplied text cannot establish either conclusion.",
  } };
}
export function specificationQuestions(acceptance: string[]): Record<string, SemanticQuestion> {
  const questions: Record<string, SemanticQuestion> = {
    conflict: choice("Are the shipping and excluded descriptions compatible? Return problem for a direct contradiction."),
    task_kind: { type: "choice", instructions: "Which task kind best describes the requested work?", criteria: { explore: null, delete: null, fix: null, feature: null, refactor: null, release: null } },
    surface: { type: "choice", instructions: "Which main project surface does this task affect?", criteria: { ui: null, data: null, game: null, release: null, docs: null, other: null } },
  };
  for (let index = 0; index < acceptance.length; index++) {
    questions[`observable_${index}`] = choice(`Is acceptance[${index}] observable or measurable? Return problem if it is only a vague aspiration.`);
    questions[`covered_${index}`] = choice(`Does verification cover acceptance[${index}]? Return problem if there is no concrete matching check.`);
  }
  return questions;
}
export function contextQuestions(count: number): Record<string, SemanticQuestion> {
  return Object.fromEntries(Array.from({ length: count }, (_item, index) => [`candidate_${index}`, {
    type: "score", instructions: `How relevant is candidates[${index}] to completing this task?`, criteria: ["Unrelated", "Tangential", "Directly useful"],
  } as SemanticQuestion]));
}
export function evidenceQuestion(): SemanticQuestion {
  return { type: "choice", instructions: "Does the quoted evidence and its surrounding source support the exact claim?", criteria: {
    supports: "The source directly supports the claim.", contradicts: "The source opposes the claim.", insufficient: "The source does not establish the claim.",
  } };
}
function isEnabled(config: LoadedConfig): boolean { return config.bassYaml.semantic.mode === "enforce"; }

export function readStage(projectRoot: string, taskId: string, stage: "prepare" | "verify"): SemanticStage | null {
  const file = stagePath(projectRoot, taskId, stage);
  if (!fs.existsSync(file)) return null;
  const result = stageSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  return result.success ? result.data : null;
}
export function stageHash(stage: SemanticStage): string { return digest(stage); }
function resolutions(projectRoot: string, taskId: string) {
  const file = path.join(taskStore(projectRoot, taskId), "resolutions.json");
  if (!fs.existsSync(file)) return [];
  return z.array(resolutionSchema).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}
function unresolved(projectRoot: string, taskId: string, stage: SemanticStage): Finding[] {
  const decided = resolutions(projectRoot, taskId);
  return stage.findings.filter((item) => item.status !== "pass" && !decided.some((r) => r.finding_id === item.id && r.input_hash === stage.input_hash));
}
export function resolveFinding(projectRoot: string, task: TaskFile, config: LoadedConfig, findingId: string, reason: string, approver: string): void {
  const taskId = task.frontmatter.id;
  const stage = (["prepare", "verify"] as const).map((name) => readStage(projectRoot, taskId, name))
    .find((candidate) => candidate?.findings.some((finding) => finding.id === findingId));
  if (!stage) throw new Error(`semantic finding not found: ${findingId}`);
  const current = expectedInputHash(projectRoot, task, config, stage.stage);
  if (stage.input_hash !== current) throw new Error("semantic input changed; rerun judgment before resolving");
  if (stage.findings.find((finding) => finding.id === findingId)?.status === "pass") throw new Error("passing finding needs no resolution");
  const file = path.join(taskStore(projectRoot, taskId), "resolutions.json");
  const prior = resolutions(projectRoot, taskId);
  if (prior.some((r) => r.finding_id === findingId && r.input_hash === stage.input_hash)) throw new Error("finding already resolved");
  writeJson(file, [...prior, { finding_id: findingId, input_hash: stage.input_hash, reason, approver, at: new Date().toISOString() }]);
  appendEvent(projectRoot, { task_id: taskId, kind: "semantic.resolved", status: "pass", summary: `semantic finding ${findingId} resolved by ${approver}` });
}

interface Candidate { source: string; selector?: string; content: string; sha256: string; }
function candidatePaths(projectRoot: string, config: LoadedConfig): string[] {
  const allowed = ["PRODUCT.md", "TECH.md", "DESIGN.md", ...config.bassYaml.semantic.document_paths];
  const paths = new Set<string>();
  for (const entry of allowed) {
    const relative = entry.replace(/\\/g, "/");
    if (path.isAbsolute(relative) || relative.startsWith("../") || relative.includes("/../")) continue;
    const absolute = path.resolve(projectRoot, relative);
    if (!fs.existsSync(absolute)) continue;
    if (fs.statSync(absolute).isFile() && relative.endsWith(".md")) paths.add(relative);
    if (fs.statSync(absolute).isDirectory()) {
      const relativeReal = path.relative(fs.realpathSync(projectRoot), fs.realpathSync(absolute));
      if (!relativeReal || relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) continue;
      for (const file of fs.readdirSync(absolute).filter((name) => name.endsWith(".md")).slice(0, 100)) paths.add(`${relative}/${file}`);
    }
  }
  const specs = path.join(projectRoot, "specs");
  if (fs.existsSync(specs) && fs.statSync(specs).isDirectory()) {
    const relativeReal = path.relative(fs.realpathSync(projectRoot), fs.realpathSync(specs));
    if (relativeReal.startsWith("..") || path.isAbsolute(relativeReal)) return [...paths].sort().slice(0, 200);
    for (const file of fs.readdirSync(specs).filter((name) => name.endsWith(".md")).slice(0, 100)) paths.add(`specs/${file}`);
  }
  return [...paths].sort().slice(0, 200);
}
function candidates(projectRoot: string, config: LoadedConfig): Candidate[] {
  const found: Candidate[] = [];
  for (const source of candidatePaths(projectRoot, config)) {
    const safe = readSafeProjectText(projectRoot, source);
    if ("reason" in safe) continue;
    const headings = [...safe.content.matchAll(/^#{1,3}\s+(.+?)\s*$/gm)].map((match) => match[1]!.trim());
    if (headings.length === 0) found.push({ source, content: safe.content.slice(0, 1500), sha256: safe.sha256 });
    for (const selector of headings.slice(0, 30)) {
      const section = readSafeProjectText(projectRoot, source, selector);
      if (!("reason" in section)) found.push({ source, selector, content: section.content.slice(0, 1500), sha256: section.sha256 });
    }
  }
  return found;
}
function shortlist(task: TaskFile, options: Candidate[]): Candidate[] {
  const query = [task.sections.get("What we are shipping"), task.sections.get("Acceptance criteria")].join(" ").toLowerCase();
  const words = new Set(query.match(/[\p{L}\p{N}_-]{3,}/gu) ?? []);
  return options.map((item) => ({ item, score: [...words].filter((word) => item.content.toLowerCase().includes(word)).length }))
    .sort((a, b) => b.score - a.score || `${a.item.source}#${a.item.selector ?? ""}`.localeCompare(`${b.item.source}#${b.item.selector ?? ""}`))
    .slice(0, 20).map(({ item }) => item);
}

export async function prepareSemantic(projectRoot: string, config: LoadedConfig, task: TaskFile, dryRun = false): Promise<SemanticStage | { dry_run: true; sources: string[]; max_calls: number }> {
  if (!isEnabled(config)) throw new Error("semantic mode is off");
  const baseHash = taskInput(task, config);
  const relevant = shortlist(task, candidates(projectRoot, config));
  const inputHash = digest({ baseHash, references: relevant.map(({ source, selector, sha256 }) => ({ source, selector, sha256 })) });
  if (dryRun) return { dry_run: true, sources: [task.filePath, ...relevant.map((c) => `${c.source}${c.selector ? `#${c.selector}` : ""}`)], max_calls: relevant.length ? 2 : 1 };
  const acceptance = paragraphs(task.sections.get("Acceptance criteria") ?? "");
  const state = {
    shipping: task.sections.get("What we are shipping") ?? "",
    excluded: task.sections.get("What we are not shipping") ?? "",
    acceptance, verification: task.sections.get("Verification") ?? "",
    allowed_scope: task.sections.get("Allowed scope") ?? "",
  };
  const questions = specificationQuestions(acceptance);
  try {
    const first = await askSemantic(projectRoot, config.bassYaml.semantic, { state, questions });
    const answer = first.response.answers;
    const findings = [verdict(answer["conflict"] as { choice: string; confidence: number }, "Shipping and excluded scope do not conflict", "What we are shipping / What we are not shipping")];
    acceptance.forEach((criterion, index) => {
      findings.push(verdict(answer[`observable_${index}`] as { choice: string; confidence: number }, criterion, `Acceptance criteria:${index + 1}`));
      findings.push(verdict(answer[`covered_${index}`] as { choice: string; confidence: number }, criterion, `Verification:${index + 1}`));
    });
    const references: Candidate[] = [];
    let contextDecisions: NonNullable<SemanticStage["context_decisions"]> = [];
    let contextDetail: string | undefined;
    if (relevant.length) try {
      const ranking = await askSemantic(projectRoot, config.bassYaml.semantic, {
        state: { task: state.shipping, acceptance, candidates: relevant.map((c) => ({ source: c.source, heading: c.selector ?? "", text: c.content })) },
        questions: contextQuestions(relevant.length),
      });
      const scores = relevant.map((item, index) => ({ item, score: (ranking.response.answers[`candidate_${index}`] as { score: number }).score }));
      references.push(...scores.sort((a, b) => b.score - a.score).filter((candidate) => candidate.score >= 1.5).slice(0, 5).map((candidate) => candidate.item));
      contextDecisions = scores.map(({ item, score }) => ({ source: item.source, ...(item.selector ? { selector: item.selector } : {}),
        sha256: item.sha256, score, selected: references.includes(item),
        reason: references.includes(item) ? "selected within top five and relevance threshold" : score < 1.5 ? "below relevance threshold" : "outside top five" }));
    } catch (error) {
      contextDetail = `semantic context ranking unavailable; using existing context: ${error instanceof Error ? error.message : String(error)}`;
      contextDecisions = relevant.map((item) => ({ source: item.source, ...(item.selector ? { selector: item.selector } : {}),
        sha256: item.sha256, selected: false, reason: "ranking unavailable; existing context rules apply" }));
    }
    const stage: SemanticStage = { stage: "prepare", input_hash: inputHash, model: first.response.model,
      status: findings.every((item) => item.status === "pass") ? "pass" : "needs-work", findings,
      references: references.map(({ source, selector, sha256 }) => ({ source, ...(selector ? { selector } : {}), sha256 })),
      context_decisions: contextDecisions,
      recommendation: { kind: (answer["task_kind"] as { choice: string }).choice, surface: (answer["surface"] as { choice: string }).choice },
      ...(contextDetail ? { detail: contextDetail } : {}),
    };
    writeJson(stagePath(projectRoot, task.frontmatter.id, "prepare"), stage);
    appendEvent(projectRoot, { task_id: task.frontmatter.id, kind: "semantic.completed", status: stage.status === "pass" ? "pass" : "fail", summary: `semantic prepare ${stage.status}` });
    return stage;
  } catch (error) {
    const stage: SemanticStage = { stage: "prepare", input_hash: inputHash, model: config.bassYaml.semantic.model,
      status: "error", findings: [], references: [], detail: error instanceof Error ? error.message : String(error) };
    writeJson(stagePath(projectRoot, task.frontmatter.id, "prepare"), stage);
    appendEvent(projectRoot, { task_id: task.frontmatter.id, kind: "semantic.completed", status: "error", summary: "semantic prepare failed" });
    return stage;
  }
}

const claimSchema = z.object({ criterion: z.string().min(1), claim: z.string().min(1), evidence: z.object({ path: z.string().min(1), quote: z.string().min(1) }) });
const claimsSchema = z.object({ claims: z.array(claimSchema).min(1) });
function claimFile(projectRoot: string, taskId: string): string { return path.join(taskStore(projectRoot, taskId), "claims.json"); }
function inspectClaims(projectRoot: string, task: TaskFile) {
  const file = claimFile(projectRoot, task.frontmatter.id);
  if (!fs.existsSync(file)) throw new Error(`claim manifest missing: ${file}`);
  const claims = claimsSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))).claims;
  const acceptance = paragraphs(task.sections.get("Acceptance criteria") ?? "");
  for (const criterion of acceptance) if (!claims.some((claim) => claim.criterion === criterion)) throw new Error(`acceptance claim missing: ${criterion}`);
  return claims.map((claim) => {
    if (!acceptance.includes(claim.criterion)) throw new Error(`criterion is not in task: ${claim.criterion}`);
    const source = claim.evidence.path.replace(/\\/g, "/");
    if (!source.startsWith(`.bass/evidence/${task.frontmatter.id}/`)) throw new Error(`evidence must belong to task: ${source}`);
    const safe = readSafeProjectText(projectRoot, source);
    if ("reason" in safe) throw new Error(`invalid evidence ${source}: ${safe.reason}`);
    const offset = safe.content.indexOf(claim.evidence.quote);
    if (offset < 0) throw new Error(`quote not found in evidence: ${source}`);
    const line = safe.content.slice(0, offset).split("\n").length;
    const start = Math.max(0, offset - 1_000);
    const end = Math.min(safe.content.length, offset + claim.evidence.quote.length + 1_000);
    return { ...claim, text: safe.content.slice(start, end), line, sha256: safe.sha256 };
  });
}

function expectedInputHash(projectRoot: string, task: TaskFile, config: LoadedConfig, stage: "prepare" | "verify"): string {
  return stage === "prepare"
    ? digest({ baseHash: taskInput(task, config), references: shortlist(task, candidates(projectRoot, config)).map(({ source, selector, sha256 }) => ({ source, selector, sha256 })) })
    : digest({ task: taskInput(task, config), claims: inspectClaims(projectRoot, task) });
}

export async function verifySemantic(projectRoot: string, config: LoadedConfig, task: TaskFile, dryRun = false): Promise<SemanticStage | { dry_run: true; sources: string[]; max_calls: number }> {
  if (!isEnabled(config)) throw new Error("semantic mode is off");
  const claims = inspectClaims(projectRoot, task);
  const inputHash = digest({ task: taskInput(task, config), claims });
  if (dryRun) return { dry_run: true, sources: claims.map((claim) => claim.evidence.path), max_calls: claims.length };
  try {
    const findings: Finding[] = [];
    for (const [index, claim] of claims.entries()) {
      const evaluated = await askSemantic(projectRoot, config.bassYaml.semantic, {
        state: { criterion: claim.criterion, claim: claim.claim, quote: claim.evidence.quote, source: claim.text },
        questions: { relation: evidenceQuestion() },
      });
      const answer = evaluated.response.answers["relation"] as { choice: string; confidence: number };
      findings.push({ id: digest({ inputHash, index }).slice(0, 16), subject: claim.claim, source: claim.evidence.path,
        status: answer.confidence < 0.8 ? "uncertain" : answer.choice === "supports" ? "pass" : "problem", confidence: answer.confidence });
    }
    const stage: SemanticStage = { stage: "verify", input_hash: inputHash, model: config.bassYaml.semantic.model,
      status: findings.every((item) => item.status === "pass") ? "pass" : "needs-work", findings,
      references: claims.map((claim) => ({ source: claim.evidence.path, line: claim.line, quote: claim.evidence.quote, sha256: claim.sha256 })) };
    writeJson(stagePath(projectRoot, task.frontmatter.id, "verify"), stage);
    appendEvent(projectRoot, { task_id: task.frontmatter.id, kind: "semantic.completed", status: stage.status === "pass" ? "pass" : "fail", summary: `semantic verify ${stage.status}` });
    return stage;
  } catch (error) {
    const stage: SemanticStage = { stage: "verify", input_hash: inputHash, model: config.bassYaml.semantic.model,
      status: "error", findings: [], references: [], detail: error instanceof Error ? error.message : String(error) };
    writeJson(stagePath(projectRoot, task.frontmatter.id, "verify"), stage);
    appendEvent(projectRoot, { task_id: task.frontmatter.id, kind: "semantic.completed", status: "error", summary: "semantic verify failed" });
    return stage;
  }
}

export function semanticGate(projectRoot: string, task: TaskFile, config: LoadedConfig, name: "prepare" | "verify") {
  if (!isEnabled(config)) return { status: "pass" as const, detail: "semantic mode off" };
  const stage = readStage(projectRoot, task.frontmatter.id, name);
  if (!stage) return { status: "fail" as const, detail: `run bass semantic ${name} ${task.frontmatter.id}` };
  let expected: string;
  try {
    expected = expectedInputHash(projectRoot, task, config, name);
  } catch (error) { return { status: "fail" as const, detail: String(error) }; }
  if (stage.input_hash !== expected) return { status: "fail" as const, detail: "semantic input changed; rerun judgment" };
  if (stage.status === "error") return { status: "fail" as const, detail: stage.detail ?? "semantic request failed" };
  const open = unresolved(projectRoot, task.frontmatter.id, stage);
  return open.length ? { status: "fail" as const, detail: `semantic findings need work: ${open.map((item) => item.id).join(", ")}` }
    : { status: "pass" as const, detail: "semantic judgments and resolutions current" };
}

export function semanticReport(projectRoot: string, taskId: string) {
  const prepare = readStage(projectRoot, taskId, "prepare");
  const verify = readStage(projectRoot, taskId, "verify");
  return { prepare, prepare_hash: prepare ? stageHash(prepare) : null,
    verify, verify_hash: verify ? stageHash(verify) : null,
    resolutions: resolutions(projectRoot, taskId), usage: semanticCost(projectRoot) };
}

export function preparedReferences(projectRoot: string, config: LoadedConfig, task: TaskFile) {
  if (!isEnabled(config) || semanticGate(projectRoot, task, config, "prepare").status !== "pass") return [];
  return readStage(projectRoot, task.frontmatter.id, "prepare")?.references ?? [];
}
