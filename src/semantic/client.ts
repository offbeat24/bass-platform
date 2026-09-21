import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { BassYaml } from "../project/bassYaml.js";

export type SemanticQuestion = {
  type: "choice" | "score" | "noul";
  instructions: string;
  criteria?: Record<string, string | null> | string[];
};

const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), choice: z.string(), probabilities: z.record(z.string(), z.number()), confidence: z.number().min(0).max(1) }),
  z.object({ type: z.literal("score"), score: z.number().finite().nonnegative(), probabilities: z.record(z.string(), z.number()), confidence: z.number().min(0).max(1) }),
  z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
]);
const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
});
export type SemanticResponse = z.infer<typeof responseSchema>;

const MAX_REQUEST_TOKENS = 64_000;
export const SEMANTIC_POLICY_VERSION = 2;
const API_URL = "https://api.typesafe.ai/v1/systemone";

export interface SemanticRequest {
  state: unknown;
  questions: Record<string, SemanticQuestion>;
}

export function semanticStore(projectRoot: string): string {
  return path.join(projectRoot, ".bass", "semantic");
}

export function requestId(request: SemanticRequest, model: string): string {
  return createHash("sha256").update(JSON.stringify({ policy: SEMANTIC_POLICY_VERSION, model, ...request })).digest("hex");
}

async function withLock<T>(file: string, action: () => Promise<T>): Promise<T> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.mkdirSync(file);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline) throw new Error("semantic request is already in progress");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  try { return await action(); } finally { fs.rmdirSync(file); }
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

async function withRequestSlot<T>(projectRoot: string, action: () => Promise<T>): Promise<T> {
  const directory = path.join(semanticStore(projectRoot), "slots");
  fs.mkdirSync(directory, { recursive: true });
  const deadline = Date.now() + 10_000;
  let slot: string | undefined;
  while (!slot) {
    for (let index = 0; index < 4; index++) {
      const candidate = path.join(directory, `${index}.lock`);
      try { fs.mkdirSync(candidate); slot = candidate; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (slot) break;
    if (Date.now() >= deadline) throw new Error("semantic request concurrency limit exceeded");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  try { return await action(); } finally { fs.rmdirSync(slot); }
}

export interface Ledger { reservedUsd: number; spentUsd: number; }
function ledgerFile(projectRoot: string): string { return path.join(semanticStore(projectRoot), "usage.json"); }
function readLedger(projectRoot: string): Ledger {
  const file = ledgerFile(projectRoot);
  if (!fs.existsSync(file)) return { reservedUsd: 0, spentUsd: 0 };
  return z.object({ reservedUsd: z.number().nonnegative(), spentUsd: z.number().nonnegative() }).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}
async function reserve(projectRoot: string, maxUsd: number, reserveUsd: number): Promise<void> {
  await withLock(path.join(semanticStore(projectRoot), "ledger.lock"), async () => {
    const ledger = readLedger(projectRoot);
    if (ledger.spentUsd + ledger.reservedUsd + reserveUsd > maxUsd + 1e-12) throw new Error("semantic API budget exhausted");
    ledger.reservedUsd += reserveUsd;
    atomicJson(ledgerFile(projectRoot), ledger);
  });
}
async function settle(projectRoot: string, chargedUsd: number, reserveUsd: number): Promise<void> {
  await withLock(path.join(semanticStore(projectRoot), "ledger.lock"), async () => {
    const ledger = readLedger(projectRoot);
    ledger.reservedUsd = Math.max(0, ledger.reservedUsd - reserveUsd);
    ledger.spentUsd += chargedUsd;
    atomicJson(ledgerFile(projectRoot), ledger);
  });
}

export function semanticCost(projectRoot: string) { return readLedger(projectRoot); }

function validateResponse(value: unknown, request: SemanticRequest, model: string): SemanticResponse {
  const response = responseSchema.parse(value);
  if (!/^(jev-latest|jev-preview)$/.test(model) && response.model !== model)
    throw new Error(`TypeSafe model changed: expected ${model}, received ${response.model}`);
  for (const [name, question] of Object.entries(request.questions)) {
    const answer = response.answers[name];
    if (!answer || answer.type !== question.type) throw new Error(`invalid TypeSafe answer: ${name}`);
    if (answer.type === "choice" && question.criteria && !Array.isArray(question.criteria)
      && !Object.hasOwn(question.criteria, answer.choice)) throw new Error(`unexpected TypeSafe choice: ${name}`);
    if (answer.type === "score" && (!Array.isArray(question.criteria) || answer.score > question.criteria.length - 1))
      throw new Error(`unexpected TypeSafe score: ${name}`);
  }
  return response;
}

/** One host-neutral request; completed answers are reused by both Codex and Claude. */
export async function askSemantic(
  projectRoot: string,
  config: BassYaml["semantic"],
  request: SemanticRequest,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ id: string; response: SemanticResponse; reused: boolean }> {
  if (config.mode !== "enforce") throw new Error("semantic mode is off");
  if (config.model !== "jev-1.13.0" && config.input_usd_per_million === undefined) throw new Error("configure input_usd_per_million for this model");
  const id = requestId(request, config.model);
  const cacheFile = path.join(semanticStore(projectRoot), "cache", `${id}.json`);
  return withLock(`${cacheFile}.lock`, async () => {
    if (fs.existsSync(cacheFile)) return { id, response: validateResponse(JSON.parse(fs.readFileSync(cacheFile, "utf8")), request, config.model), reused: true };
    const key = process.env["TYPESAFE_API_KEY"];
    if (!key) throw new Error("TYPESAFE_API_KEY is required for semantic mode");
    const body = JSON.stringify({ state: request.state, questions: request.questions, model: config.model });
    if (Buffer.byteLength(body) > 100_000) throw new Error("semantic request exceeds local input limit");
    const fetcher = options.fetchImpl ?? fetch;
    const pricePerInputToken = (config.input_usd_per_million ?? 0.042) / 1_000_000;
    const reserveUsd = MAX_REQUEST_TOKENS * pricePerInputToken;
    return withRequestSlot(projectRoot, async () => {
    const deadline = Date.now() + 10_000;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("semantic request deadline exceeded");
      await reserve(projectRoot, config.max_usd, reserveUsd);
      let chargedUsd = reserveUsd;
      try {
        const http = await fetcher(API_URL, {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        });
        if (http.status === 429 && attempt === 0) {
          // A rejected request may still be metered; keep the reservation conservative.
          const retry = Number(http.headers.get("retry-after") ?? "0");
          if (retry > 0 && retry <= 2 && retry * 1_000 < deadline - Date.now())
            await new Promise((resolve) => setTimeout(resolve, retry * 1_000));
          continue;
        }
        if (!http.ok) throw new Error(`TypeSafe HTTP ${http.status}`);
        const response = validateResponse(await http.json(), request, config.model);
        chargedUsd = response.usage.input_tokens * pricePerInputToken;
        if (chargedUsd > reserveUsd) throw new Error("TypeSafe reported usage above reserved maximum");
        atomicJson(cacheFile, response);
        return { id, response, reused: false };
      } finally {
        await settle(projectRoot, chargedUsd, reserveUsd);
      }
    }
    throw new Error("TypeSafe rate limit persists after one retry");
    });
  });
}
