import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { LoadedConfig } from "../config/loader.js";
import { buildExecutionPlan } from "../execution/planner.js";
import { LOOP_BUDGET_RESUME_EVENT, readEvents, type BassEvent } from "../task/events.js";
import { listTasks, type TaskFile } from "../task/taskFile.js";
import { buildProjectStatus } from "../task/status.js";

const MAX_BODY = 8_192;
const MAX_TOOLS = 160;
const MAX_HISTORY = 120;
const runtimeName = "observer-runtime.json";

export interface ToolEvent {
  id: string;
  host: "codex" | "claude";
  name: string;
  status: "running" | "success" | "failure";
  started_at: string;
  at: string;
  input_preview: string;
  output_preview: string;
  task_id?: string;
  duration_ms?: number;
}

interface ObserverHistoryEvent {
  source: "bass" | "tool";
  at: string;
  host: string;
  task_id: string;
  kind: string;
  name: string;
  status: string;
  attempt?: number;
  call_id?: string;
  capability_call?: string;
  input_preview: string;
  output_preview: string;
  started_at?: string;
  duration_ms?: number;
}

export function sanitizePreview(value: unknown, limit = 220): string {
  let text = typeof value === "string" ? value : String(value ?? "");
  text = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[\w-]*(password|passwd|token|secret|api[_-]?key|authorization|cookie|private[_-]?key|access[_-]?key)[\w-]*\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|AIza[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/(--?(?:prompt|message|system-prompt|input)\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1[OMITTED]")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function basename(value: string): string {
  return path.basename(value.replace(/\\/g, "/"));
}

function inputPreview(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const fields = input as Record<string, unknown>;
  const pieces: string[] = [];
  for (const key of ["command", "cmd"]) {
    if (typeof fields[key] === "string") pieces.push(sanitizePreview(fields[key], 180));
  }
  for (const key of ["file_path", "path", "filename"]) {
    if (typeof fields[key] === "string") pieces.push(basename(fields[key] as string));
  }
  if (typeof fields.url === "string") {
    try {
      const url = new URL(fields.url);
      pieces.push(`${url.origin}${url.pathname}`);
    } catch { /* malformed URLs are omitted */ }
  }
  return sanitizePreview(pieces.filter(Boolean).join(" · "), 220);
}

function safeOutputPreview(value: unknown, toolName: string, input: unknown): string {
  if (/read|glob|grep|search|fetch|browser|web|file/i.test(toolName)) return "";
  const args = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const command = String(args.command ?? args.cmd ?? "");
  const safeCommand = /^(?:git (?:status|branch|rev-parse|log)\b|(?:npm|pnpm|yarn|bun) (?:test|run (?:test|typecheck|build|lint)\b)|(?:npx )?tsc\b|vitest\b|pytest\b|cargo test\b|go test\b|swift test\b)/i.test(command.trim());
  if (toolName.toLowerCase() === "bash" && !safeCommand) return "";
  if (typeof value === "string") return sanitizePreview(value, 180);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const result = value as Record<string, unknown>;
    if (typeof result.exit_code === "number") return `exit code ${result.exit_code}`;
    if (typeof result.status === "string" && result.status.length < 40) return sanitizePreview(result.status, 80);
  }
  return "";
}

interface RuntimeDescriptor { pid: number; port: number; token: string; }

export interface ObserverHandle {
  url: string;
  close(): Promise<void>;
}

export async function startObserver(
  projectRoot: string,
  config: LoadedConfig,
  options: { port?: number; openBrowser?: boolean } = {},
): Promise<ObserverHandle> {
  const bassDir = path.join(projectRoot, ".bass");
  fs.mkdirSync(bassDir, { recursive: true });
  const descriptorPath = path.join(bassDir, runtimeName);
  const lockPath = `${descriptorPath}.lock`;
  const lock = acquireStartLock(lockPath);
  try { fs.writeFileSync(lock, String(process.pid)); }
  catch (error) { fs.closeSync(lock); fs.rmSync(lockPath, { force: true }); throw error; }

  let descriptorWritten = false;
  const token = randomBytes(32).toString("hex");
  const tools = new Map<string, ToolEvent>();
  const server = http.createServer((req, res) => {
    void handleRequest(req, res).catch(() => reply(res, 500, "internal error"));
  });
  let closePromise: Promise<void> | null = null;
  let url = "";

  try {
    const existing = readDescriptor(descriptorPath);
    if (existing && await observerResponds(existing)) {
      throw new Error(`BASS observer is already running at http://127.0.0.1:${existing.port}/`);
    }
    if (fs.existsSync(descriptorPath)) fs.unlinkSync(descriptorPath);

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port ?? 0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    const port = (server.address() as AddressInfo).port;
    url = `http://127.0.0.1:${port}/`;
    const descriptor: RuntimeDescriptor = { pid: process.pid, port, token };
    const temporary = `${descriptorPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(descriptor), { mode: 0o600 });
      fs.renameSync(temporary, descriptorPath);
    } finally { fs.rmSync(temporary, { force: true }); }
    try { fs.chmodSync(descriptorPath, 0o600); } catch { /* Windows ACLs replace POSIX modes */ }
    descriptorWritten = true;
  } catch (error) {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  } finally {
    fs.closeSync(lock);
    fs.rmSync(lockPath, { force: true });
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const remote = req.socket.remoteAddress;
    if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") return reply(res, 403, "loopback access only");
    const port = (server.address() as AddressInfo).port;
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 403, "invalid host");
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (req.method === "GET" && url.pathname === "/") return reply(res, 200, PAGE, "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/app.js") return reply(res, 200, SCRIPT, "text/javascript; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/style.css") return reply(res, 200, STYLE + PHASE_STYLE + TASK_CONTROLS_STYLE + CURRENT_STEP_STYLE, "text/css; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/api/state") {
      const taskId = url.searchParams.get("task") ?? undefined;
      const state = snapshot(projectRoot, config, tools, taskId);
      if (taskId && !state.selected_task) return reply(res, 404, "task not found");
      return reply(res, 200, JSON.stringify(state), "application/json; charset=utf-8");
    }
    if (req.method === "POST" && url.pathname === "/_tool") {
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${port}`) return reply(res, 403, "invalid origin");
      const supplied = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
      const expected = Buffer.from(token);
      const actual = Buffer.from(supplied);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return reply(res, 401, "unauthorized");
      const body = await readBody(req);
      if (body === null) return reply(res, 413, "request body too large");
      let event: unknown;
      try { event = JSON.parse(body); } catch { return reply(res, 400, "invalid JSON"); }
      const activeTask = buildProjectStatus(projectRoot, config).tasks
        .filter((item) => item.status === "ACTIVE")
        .sort((a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? ""))[0];
      const accepted = acceptToolEvent(event, tools, activeTask?.id);
      return reply(res, accepted ? 202 : 400, accepted ? "accepted" : "invalid event");
    }
    reply(res, 404, "not found");
  }

  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closePromise = new Promise<void>((resolve) => server.close(() => resolve())).then(() => {
      if (descriptorWritten && readDescriptor(descriptorPath)?.token === token) fs.rmSync(descriptorPath, { force: true });
    });
    return closePromise;
  };

  if (options.openBrowser) openBrowser(url);
  return { url, close };
}

function acceptToolEvent(value: unknown, tools: Map<string, ToolEvent>, taskId?: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (!(["codex", "claude"] as unknown[]).includes(input.host)
    || !(["start", "finish"] as unknown[]).includes(input.phase)
    || typeof input.id !== "string" || input.id.length > 128
    || typeof input.name !== "string" || input.name.length < 1 || input.name.length > 100
    || (input.phase === "finish" && !(["success", "failure"] as unknown[]).includes(input.status))) return false;

  const id = `${input.host}:${input.id}`;
  const previous = tools.get(id);
  const at = typeof input.at === "string" && Number.isFinite(Date.parse(input.at)) ? new Date(input.at).toISOString() : new Date().toISOString();
  const start = input.phase === "start";
  // Async hooks can arrive out of order; a late start must not erase a terminal result.
  if (start && previous && previous.status !== "running") return true;
  const event: ToolEvent = {
    id,
    host: input.host as ToolEvent["host"],
    name: sanitizePreview(input.name, 100),
    status: start ? "running" : input.status as "success" | "failure",
    started_at: previous?.started_at ?? at,
    at: start && previous ? previous.at : at,
    ...(previous?.task_id ?? taskId ? { task_id: previous?.task_id ?? taskId } : {}),
    input_preview: inputPreview(input.input ?? previous?.input_preview),
    output_preview: start ? previous?.output_preview ?? "" : safeOutputPreview(input.output, String(input.name), input.input),
    ...(typeof input.duration_ms === "number" && Number.isFinite(input.duration_ms)
      ? { duration_ms: Math.max(0, Math.min(input.duration_ms, 86_400_000)) }
      : previous?.duration_ms !== undefined ? { duration_ms: previous.duration_ms } : {}),
  };
  if (!previous && tools.size >= MAX_TOOLS) tools.delete(tools.keys().next().value!);
  tools.set(id, event);
  return true;
}

function snapshot(projectRoot: string, config: LoadedConfig, tools: Map<string, ToolEvent>, selectedTaskId?: string) {
  const status = buildProjectStatus(projectRoot, config);
  const eventRead = readEvents(projectRoot);
  const bassTimeline: ObserverHistoryEvent[] = eventRead.events.map((event) => ({
    source: "bass",
    at: event.at,
    host: "BASS",
    task_id: event.task_id,
    kind: event.kind,
    name: `${event.task_id} · ${bassEventName(event)}`,
    status: event.status ?? "info",
    attempt: event.attempt,
    call_id: event.call_id,
    capability_call: event.capability_call,
    input_preview: event.name ? sanitizePreview(event.name, 100) : "",
    output_preview: sanitizePreview(event.summary, 240),
  }));
  const task = status.tasks
    .filter((item) => item.status === "ACTIVE")
    .sort((a, b) => (b.last_activity ?? "").localeCompare(a.last_activity ?? ""))[0];
  const taskFiles = listTasks(projectRoot);
  const taskFile = task ? taskFiles.find((item) => item.frontmatter.id === task.id) : undefined;
  const selectedTask = selectedTaskId ? status.tasks.find((item) => item.id === selectedTaskId) ?? null : null;
  const selectedFile = selectedTask ? taskFiles.find((item) => item.frontmatter.id === selectedTask.id) : undefined;
  const budget = task && taskFile ? budgetFor(task, taskFile, config, eventRead.events) : null;
  const selectedBudget = selectedTask && selectedFile ? budgetFor(selectedTask, selectedFile, config, eventRead.events) : null;
  const taskHistory = selectedTask ? [] as ObserverHistoryEvent[] : [];
  if (selectedTask) {
    taskHistory.push(...bassTimeline.filter((event) => event.task_id === selectedTask.id));
    for (const event of tools.values()) {
      if (event.task_id === selectedTask.id) taskHistory.push({ ...event, source: "tool", kind: "tool.event", task_id: selectedTask.id });
    }
  }
  taskHistory.sort((a, b) => a.at.localeCompare(b.at));
  return {
    project: status.project,
    generated_at: status.generated_at,
    active_task: task ?? null,
    budget,
    selected_task: selectedTask,
    selected_budget: selectedBudget,
    current_step: selectedTask ? currentStep(selectedTask, taskHistory) : null,
    task_history: taskHistory.slice(-MAX_HISTORY),
    tasks: status.tasks.map((item) => ({
      ...item,
      blocked_reason: item.blocked_reason ? sanitizePreview(item.blocked_reason, 220) : null,
      evaluations: item.evaluations.map((evaluation) => ({ name: sanitizePreview(evaluation.name, 100), status: evaluation.status })),
    })),
    issues: status.issues.map((item) => sanitizePreview(item, 220)),
    warnings: status.warnings.map((item) => sanitizePreview(item, 220)),
    history: [...bassTimeline, ...tools.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_HISTORY),
  };
}

function currentStep(
  task: ReturnType<typeof buildProjectStatus>["tasks"][number],
  history: ObserverHistoryEvent[],
): ObserverHistoryEvent | null {
  const attempt = task.current_attempt;
  if (task.status !== "ACTIVE" || attempt === null) return null;
  const attemptEvents = history.filter((event) => event.source === "bass" && event.attempt === attempt);
  const started = attemptEvents.find((event) => event.kind === "attempt.started");
  if (!started || attemptEvents.some((event) => event.kind === "attempt.completed")) return null;
  const runningTool = [...history].reverse().find((event) => event.source === "tool" && event.status === "running");
  if (runningTool) return runningTool;
  const completedCalls = new Set(attemptEvents.filter((event) => event.kind === "capability.completed").map((event) => event.call_id));
  const runningCapability = [...attemptEvents].reverse().find((event) =>
    event.kind === "capability.started" && event.call_id && !completedCalls.has(event.call_id));
  return runningCapability ?? { ...started, name: `시도 ${attempt} 진행 중` };
}

function budgetFor(task: NonNullable<ReturnType<typeof buildProjectStatus>["tasks"][number]>, file: TaskFile, config: LoadedConfig, events: BassEvent[]) {
  const taskEvents = events.filter((event) => event.task_id === task.id);
  const plan = buildExecutionPlan(config, file);
  const started = taskEvents.filter((event) => event.kind === "attempt.started");
  const completed = taskEvents.filter((event) => event.kind === "attempt.completed");
  const firstAttempt = started[0];
  const lastResume = [...taskEvents].reverse().find((event) => event.kind === "task.started" && event.name === LOOP_BUDGET_RESUME_EVENT);
  const anchor = firstAttempt && lastResume && Date.parse(lastResume.at) >= Date.parse(firstAttempt.at) ? lastResume : firstAttempt;
  const elapsedMs = anchor ? Math.max(0, Date.now() - Date.parse(anchor.at)) : null;
  const turnsUsed = completed.reduce((total, event) => total + (event.turns ?? 0), 0);
  return {
    task_id: task.id,
    current_attempt: task.current_attempt,
    attempts_used: started.length,
    max_attempts: plan.loop.maxAttempts,
    attempts_remaining: Math.max(0, plan.loop.maxAttempts - started.length),
    turns_used: turnsUsed,
    max_turns: plan.loop.maxTurns,
    turns_remaining: Math.max(0, plan.loop.maxTurns - turnsUsed),
    elapsed_ms: elapsedMs,
    remaining_ms: elapsedMs === null ? null : Math.max(0, plan.loop.maxMinutes * 60_000 - elapsedMs),
  };
}

function bassEventName(event: BassEvent): string {
  if (event.kind === "task.started" && event.name === LOOP_BUDGET_RESUME_EVENT) return "시간 예산 승인 재개";
  const labels: Record<string, string> = {
    "task.started": "작업 시작", "attempt.started": "시도 시작", "attempt.completed": "시도 완료",
    "capability.started": "외부 capability 시작", "capability.completed": "외부 capability 완료",
    "evaluation.completed": "검증 완료", "critic.completed": "리뷰 완료", "evidence.recorded": "증거 기록",
    "task.blocked": "작업 차단", "task.completed": "작업 완료", "semantic.completed": "Semantic 평가 완료",
    "semantic.resolved": "Semantic 판단 해결",
  };
  return labels[event.kind] ?? event.kind;
}

function readDescriptor(file: string): RuntimeDescriptor | null {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RuntimeDescriptor>;
    return Number.isInteger(value.port) && (value.port ?? 0) > 0 && typeof value.token === "string"
      && Number.isInteger(value.pid) ? value as RuntimeDescriptor : null;
  } catch { return null; }
}

function acquireStartLock(file: string): number {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return fs.openSync(file, "wx", 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let pid: number;
      try { pid = Number(fs.readFileSync(file, "utf8")); }
      catch { throw new Error("An observer start is already in progress; retry after it finishes"); }
      if (!Number.isInteger(pid) || pid < 1) throw new Error("An observer start is already in progress; retry after it finishes");
      try {
        process.kill(pid, 0);
        throw new Error("An observer start is already in progress; retry after it finishes");
      } catch (probeError) {
        if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError;
        fs.rmSync(file, { force: true });
      }
    }
  }
  throw new Error("An observer start is already in progress; retry after it finishes");
}

async function observerResponds(descriptor: RuntimeDescriptor): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "127.0.0.1", port: descriptor.port, path: "/", timeout: 350, headers: { host: `127.0.0.1:${descriptor.port}` } }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let oversized = false;
    req.on("data", (chunk: Buffer) => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_BODY) { oversized = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(oversized ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8"): void {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}

function openBrowser(url: string): void {
  const [command, args] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
      : ["xdg-open", [url]];
  try { const child = spawn(command, args, { detached: true, stdio: "ignore" }); child.on("error", () => {}); child.unref(); }
  catch { /* the printed URL remains available for manual opening */ }
}

const CURRENT_STEP_STYLE = '.current-step-panel{--phase:var(--phase-attempt);margin:0 0 12px;padding:15px;border:1px solid color-mix(in srgb,var(--phase) 38%,var(--line));border-left:3px solid var(--phase);border-radius:11px;background:color-mix(in srgb,var(--phase) 6%,var(--panel))}.current-step-panel[data-kind="start"]{--phase:var(--phase-start)}.current-step-panel[data-kind="attempt"]{--phase:var(--phase-attempt)}.current-step-panel[data-kind="tool"]{--phase:var(--phase-tool)}.current-step-panel[data-kind="validation"]{--phase:var(--phase-validation)}.current-step-panel[data-kind="evidence"]{--phase:var(--phase-evidence)}.current-step-panel[data-kind="review"]{--phase:var(--phase-review)}.current-step-panel[data-kind="result"]{--phase:var(--phase-result)}.current-step-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.current-step-head .eyebrow{margin:0;color:var(--phase)}.current-step-status{padding:3px 8px;border:1px solid color-mix(in srgb,var(--phase) 42%,transparent);border-radius:999px;color:var(--phase);font-size:10px;font-weight:700}.current-step-body{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:4px 12px;margin-top:8px}.current-step-copy{min-width:0}.current-step-title{font-size:14px;font-weight:650;overflow-wrap:anywhere}.current-step-phase{display:inline-flex;align-items:center;gap:5px;margin-top:4px;color:var(--phase);font-size:11px}.current-step-phase:before{content:attr(data-symbol)}.current-step-meta,.current-step-time{color:var(--muted);font-size:11px}.current-step-time{white-space:nowrap}.current-step-body .event-copy{grid-column:1/-1;margin-top:5px;color:var(--muted)}@media(max-width:700px){.current-step-panel{padding:13px}.current-step-body{grid-template-columns:minmax(0,1fr)}.current-step-time{grid-column:1}}';

const PAGE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BASS 관찰기</title><link rel="stylesheet" href="/style.css"><script defer src="/app.js"></script></head>
<body><header><div><p class="eyebrow">BASS · LOCAL OBSERVER</p><h1 id="project">연결 중…</h1></div><span class="connection"><i></i><span id="connection">로컬 서버 연결 중</span></span></header>
<main><div id="overview"><section class="hero"><div><p class="eyebrow">현재 작업</p><h2 id="active-title">불러오는 중…</h2><p id="active-meta" class="muted"></p><p id="blocked" class="blocked"></p></div><div class="budgets" id="budgets"></div></section>
<p class="notice">Codex 호스팅 도구(WebSearch 등)는 로컬 훅 범위 밖입니다. 대화 전문과 추론은 수집하지 않습니다.</p>
<section class="section"><div class="section-head"><div><p class="eyebrow">WORKFLOW</p><h2>작업 상태</h2></div><span id="updated" class="muted"></span></div><div class="task-controls"><div id="task-filters" class="task-filters" role="group" aria-label="작업 상태 필터"><button class="task-filter" data-filter="all" type="button" aria-pressed="true">전체 <span data-count="all">0</span></button><button class="task-filter" data-filter="active" type="button" aria-pressed="false">진행 중 <span data-count="active">0</span></button><button class="task-filter" data-filter="waiting" type="button" aria-pressed="false">대기 <span data-count="waiting">0</span></button><button class="task-filter" data-filter="attention" type="button" aria-pressed="false">확인 필요 <span data-count="attention">0</span></button><button class="task-filter" data-filter="done" type="button" aria-pressed="false">완료 <span data-count="done">0</span></button><button class="task-filter" data-filter="cancelled" type="button" aria-pressed="false">취소 <span data-count="cancelled">0</span></button></div><label class="task-sort">정렬<select id="task-sort"><option value="recent">최근 활동</option><option value="status">상태</option><option value="id">작업 ID</option><option value="title">이름</option></select></label></div><div id="tasks" class="tasks"></div><div id="issues"></div></section>
<section class="section"><div class="section-head"><div><p class="eyebrow">LIVE EVENTS</p><h2>시간순 흐름</h2></div><span class="muted">최근 이벤트부터</span></div><ol id="timeline" class="timeline"></ol></section></div>
<section id="task-detail" class="task-detail-view" hidden><button id="back" class="back" type="button">← 전체 작업</button><section class="hero"><div><p class="eyebrow">작업 상세</p><h2 id="detail-title"></h2><p id="detail-meta" class="muted"></p><p id="detail-reason" class="blocked"></p><p id="detail-summary" class="task-detail"></p></div><div class="budgets" id="detail-budgets"></div></section><section class="section"><div class="section-head"><div><p class="eyebrow">PROCESS</p><h2>단계별 진행</h2></div><span id="detail-count" class="muted"></span></div><section id="current-step-panel" class="current-step-panel" aria-labelledby="current-step-label" hidden><div class="current-step-head"><p id="current-step-label" class="eyebrow">지금 진행 중</p><span class="current-step-status">진행 중</span></div><div id="current-step-content" class="current-step-body"></div></section><ol id="task-timeline" class="steps"></ol></section></section>
<footer>로컬 읽기 전용 화면 · 도구 미리보기는 실행 중 메모리에만 보관</footer></main></body></html>`;

const PHASE_STYLE = ':root{--phase-start:#8ab6f5;--phase-attempt:#bda0ff;--phase-tool:#78c9bd;--phase-validation:#f0c27b;--phase-evidence:#8dc8e8;--phase-review:#e2a3c2;--phase-result:#a6d59e}.step{border-left:3px solid var(--phase,var(--line));transition:background-color .16s,border-color .16s,transform .16s}.step[data-kind="start"]{--phase:var(--phase-start)}.step[data-kind="attempt"]{--phase:var(--phase-attempt)}.step[data-kind="tool"]{--phase:var(--phase-tool)}.step[data-kind="validation"]{--phase:var(--phase-validation)}.step[data-kind="evidence"]{--phase:var(--phase-evidence)}.step[data-kind="review"]{--phase:var(--phase-review)}.step[data-kind="result"]{--phase:var(--phase-result)}.step-phase{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border:1px solid color-mix(in srgb,var(--phase) 36%,transparent);border-radius:999px;background:color-mix(in srgb,var(--phase) 12%,var(--panel));color:var(--phase);font-weight:650}.step-phase:before{content:attr(data-symbol);font-size:12px}.step:hover{transform:translateX(2px);border-color:color-mix(in srgb,var(--phase) 60%,var(--line));background:color-mix(in srgb,var(--phase) 4%,var(--panel))}.step[data-status="failure"] .event-sub,.step[data-status="fail"] .event-sub,.step[data-status="error"] .event-sub{color:var(--bad)}.step[data-status="running"] .event-sub{color:var(--warn)}.step[data-status="success"] .event-sub,.step[data-status="pass"] .event-sub{color:var(--accent)}body[data-connected="true"] .connection i{animation:live-pulse 2.2s ease-in-out infinite}body[data-connected="false"] .connection i{background:var(--bad)}.view-enter{animation:view-enter 180ms cubic-bezier(.2,.8,.2,1) both}@keyframes view-enter{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}@keyframes live-pulse{0%,100%{box-shadow:0 0 0 0 rgb(141 198 192 / 0);opacity:.72}50%{box-shadow:0 0 0 4px rgb(141 198 192 / .14);opacity:1}}@media(prefers-reduced-motion:reduce){.task,.step{transition:none!important}.view-enter{animation:none!important}.connection i{animation:none!important}html{scroll-behavior:auto!important}}';
const TASK_CONTROLS_STYLE = '.task-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px}.task-filters{display:flex;gap:6px;flex-wrap:wrap}.task-filter{padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--muted);font:inherit;font-size:12px;cursor:pointer;transition:background-color .14s,border-color .14s,color .14s}.task-filter span{margin-left:4px;font-variant-numeric:tabular-nums;opacity:.75}.task-filter[aria-pressed="true"]{color:var(--text);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.task-filter[data-filter="active"][aria-pressed="true"]{border-color:var(--phase-tool);background:color-mix(in srgb,var(--phase-tool) 12%,var(--panel))}.task-filter[data-filter="waiting"][aria-pressed="true"]{border-color:var(--phase-start);background:color-mix(in srgb,var(--phase-start) 12%,var(--panel))}.task-filter[data-filter="attention"][aria-pressed="true"]{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 12%,var(--panel))}.task-filter[data-filter="done"][aria-pressed="true"]{border-color:var(--phase-result);background:color-mix(in srgb,var(--phase-result) 12%,var(--panel))}.task-filter[data-filter="cancelled"][aria-pressed="true"]{border-color:#71808e;background:color-mix(in srgb,#71808e 12%,var(--panel))}.task-filter:focus-visible,.task-sort select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.task-sort{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}.task-sort select{padding:7px 28px 7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);font:inherit;font-size:12px}@media(max-width:700px){.task-controls{align-items:stretch}.task-sort{width:100%;justify-content:space-between}.task-sort select{flex:1;min-width:0;max-width:none}}';

const STYLE = `:root{color-scheme:dark;--bg:#101923;--panel:#182431;--line:#2b3a49;--text:#e9eff4;--muted:#9aabba;--accent:#8dc6c0;--warn:#f0c27b;--bad:#ef9388}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}header,main{width:min(1120px,calc(100% - 40px));margin:auto}header{display:flex;align-items:center;justify-content:space-between;padding:26px 0 22px;border-bottom:1px solid var(--line)}h1,h2,p{margin:0}h1{font-size:22px;font-weight:620}h2{font-size:18px;font-weight:600}.eyebrow{color:var(--accent);font-size:10px;letter-spacing:.16em;font-weight:700;margin-bottom:8px}.connection{font-size:12px;color:var(--muted);white-space:nowrap}.connection i{display:inline-block;width:8px;height:8px;margin-right:7px;border-radius:50%;background:var(--accent)}main{padding:24px 0 44px}.hero{display:grid;grid-template-columns:minmax(240px,1fr) minmax(320px,1.2fr);gap:28px;padding:23px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.hero h2{font-size:23px}.muted{color:var(--muted);font-size:12px}.blocked{color:var(--bad);margin-top:8px}.budgets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:stretch}.metric{padding:14px;border:1px solid var(--line);border-radius:10px}.metric strong{display:block;font-size:19px;font-weight:600}.metric span{color:var(--muted);font-size:11px}.notice{margin:14px 0 0;padding:11px 14px;border-left:2px solid #667b8d;color:var(--muted);font-size:12px}.section{margin-top:32px}.section-head{display:flex;align-items:end;justify-content:space-between;margin-bottom:14px}.section-head .eyebrow{margin-bottom:4px}.tasks{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.task,.event{border:1px solid var(--line);border-radius:10px;background:var(--panel)}.task{appearance:none;display:block;width:100%;padding:15px;text-align:left;color:inherit;font:inherit;cursor:pointer;transition:border-color .14s,transform .14s}.task:hover,.task:focus-visible{border-color:var(--accent);transform:translateY(-1px)}.task:focus-visible,.back:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.task-top{display:flex;justify-content:space-between;gap:12px}.task h3{font-size:14px;margin:0 0 3px}.badge{font-size:10px;color:var(--accent);white-space:nowrap}.task-detail{margin-top:10px;color:var(--muted);font-size:12px}.task-detail span+span:before{content:" · ";color:#637687}.task-reason{margin-top:8px;color:var(--warn);font-size:12px;overflow-wrap:anywhere}.back{margin:0 0 14px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);font:inherit;font-size:13px;cursor:pointer}.steps{list-style:none;padding:0;margin:0;display:grid;gap:9px}.step{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:start;gap:12px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.step:before{content:attr(data-sequence);color:var(--accent);font-size:12px;font-weight:700}.step-body{min-width:0}.step-heading{display:flex;justify-content:space-between;gap:10px}.step-phase{font-size:10px;color:var(--accent);white-space:nowrap}.step .event-copy{grid-column:2 / -1}.step time{font-size:11px;color:var(--muted);white-space:nowrap}.timeline{list-style:none;padding:0;margin:0;display:grid;gap:9px}.event{display:grid;grid-template-columns:102px minmax(100px,160px) minmax(120px,1fr);gap:14px;padding:13px 15px;align-items:start}.event time{color:var(--muted);font-size:11px;padding-top:2px}.event-title{font-size:13px;font-weight:600}.event-sub{font-size:11px;color:var(--muted);margin-top:3px}.event-copy{font-size:12px;overflow-wrap:anywhere}.event-copy p+p{margin-top:5px}.event[data-status="failure"],.event[data-status="fail"],.event[data-status="error"]{border-left:2px solid var(--bad)}.event[data-status="running"]{border-left:2px solid var(--warn)}.event[data-status="success"],.event[data-status="pass"]{border-left:2px solid var(--accent)}.empty{padding:18px;color:var(--muted);text-align:center;border:1px dashed var(--line);border-radius:10px;font-size:13px}#issues{margin-top:10px;color:var(--warn);font-size:12px}footer{border-top:1px solid var(--line);margin-top:32px;padding-top:14px;color:var(--muted);font-size:11px}@media(max-width:700px){header,main{width:min(100% - 26px,600px)}header{align-items:flex-start;gap:12px}.connection{font-size:10px}.hero{grid-template-columns:1fr;gap:18px;padding:17px}.budgets{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.metric{padding:10px 8px}.metric strong{font-size:16px}.metric span{font-size:10px}.event{grid-template-columns:1fr;gap:4px}.step{grid-template-columns:28px minmax(0,1fr);gap:8px}.step time{grid-column:2;grid-row:2}.step .event-copy{grid-column:2}.section-head{align-items:start;gap:12px}.section-head>.muted{max-width:140px;text-align:right}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

const SCRIPT = `const $=id=>document.getElementById(id);
const text=(node,value)=>{node.textContent=value??""};
const time=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?"시간 미상":date.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit"})};
const labels={ACTIVE:"진행 중",CAPTURED:"정의 중",REVIEW:"검토 대기",DONE:"완료",BLOCKED:"차단",NEEDS_DECISION:"결정 필요",NEEDS_EXPERT:"전문가 필요",FAILED:"실패",CANCELLED:"취소",ROLLED_BACK:"롤백"};
let selectedTaskId=null, taskFilter="all", taskSort="recent", latestTasks=[];
function metric(label,value){const div=document.createElement("div");div.className="metric";const strong=document.createElement("strong");strong.textContent=value;const span=document.createElement("span");span.textContent=label;div.append(strong,span);return div}
function phase(item){
  if(item.source==="tool"||item.kind?.startsWith("capability."))return {key:"tool",symbol:"⌘",label:"도구 실행"};
  if(item.kind==="task.started"){const resumed=item.name==="loop-budget-resume";return {key:"start",symbol:resumed?"↻":"▶",label:resumed?"재개":"시작"}}
  if(item.kind?.startsWith("attempt."))return {key:"attempt",symbol:"⟳",label:"시도"};
  if(item.kind?.startsWith("evaluation.")||item.kind?.startsWith("semantic."))return {key:"validation",symbol:"✓",label:"검증"};
  if(item.kind==="evidence.recorded")return {key:"evidence",symbol:"◇",label:"증거"};
  if(item.kind==="critic.completed"||item.kind?.startsWith("review."))return {key:"review",symbol:"◎",label:"리뷰"};
  return {key:"result",symbol:"◆",label:"결과"};
}
function eventCopy(item,row){const copy=document.createElement("div");copy.className="event-copy";for(const value of [item.input_preview,item.output_preview])if(value){const p=document.createElement("p");p.textContent=value;copy.append(p)}if(copy.childNodes.length)row.append(copy)}
function renderTaskDetail(data){
  const item=data.selected_task;if(!item)return;
  text($("detail-title"),item.id+" · "+item.title);
  text($("detail-meta"),(labels[item.status]||item.status)+" · 시도 "+(item.current_attempt??item.attempts)+" / "+item.max_attempts);
  text($("detail-reason"),item.blocked_reason||"");
  text($("detail-summary"),"증거 "+item.evidence+" · "+(item.evaluations.length?item.evaluations.map(x=>x.name+":"+x.status).join(", "):"평가 기록 없음")+" · 비용 "+(item.usage.estimated_cost??"unknown"));
  const metrics=$("detail-budgets");metrics.replaceChildren();
  if(item.status==="ACTIVE"&&data.selected_budget){const b=data.selected_budget;metrics.append(metric("남은 시도",b.attempts_remaining+" / "+b.max_attempts),metric("남은 턴 · 완료 기록",b.turns_remaining+" / "+b.max_turns),metric("남은 시간",b.remaining_ms===null?"기록 없음":Math.ceil(b.remaining_ms/60000)+"분"))}
  else metrics.append(metric("시도 기록",item.attempts+" / "+item.max_attempts),metric("검증",item.evaluations.length+"건"),metric("증거",String(item.evidence)));
  renderCurrentStep(data.current_step);
  const list=$("task-timeline");list.replaceChildren();text($("detail-count"),data.task_history.length+"개 기록");
  if(!data.task_history.length){const empty=document.createElement("li");empty.className="empty";empty.textContent="이 작업에 기록된 진행 단계가 없습니다.";list.append(empty)}
  for(let i=data.task_history.length-1;i>=0;i--){
    const event=data.task_history[i];
    const row=document.createElement("li");row.className="step";row.dataset.status=event.status;row.dataset.sequence=String(i+1).padStart(2,"0");
    const category=phase(event);row.dataset.kind=category.key;
    const body=document.createElement("div");body.className="step-body";
    const heading=document.createElement("div");heading.className="step-heading";
    const title=document.createElement("p");title.className="event-title";title.textContent=event.name;
    const kind=document.createElement("span");kind.className="step-phase";kind.dataset.symbol=category.symbol;kind.textContent=category.label;
    heading.append(title,kind);
    const sub=document.createElement("p");sub.className="event-sub";sub.textContent=event.source==="bass"?"BASS · "+event.status:event.host+" · "+event.status;
    body.append(heading,sub);
    const stamp=document.createElement("time");stamp.dateTime=event.at;stamp.textContent=time(event.at);
    row.append(body,stamp);eventCopy(event,row);list.append(row);
  }
}
function renderCurrentStep(event){
  const panel=$("current-step-panel"),content=$("current-step-content");content.replaceChildren();
  if(!event){panel.hidden=true;panel.removeAttribute("data-kind");return}
  const category=phase(event);panel.hidden=false;panel.dataset.kind=category.key;
  const copy=document.createElement("div");copy.className="current-step-copy";
  const title=document.createElement("p");title.className="current-step-title";
  title.textContent=event.source==="tool"?event.name+" 실행 중":event.kind==="capability.started"?(event.capability_call||event.name)+" 실행 중":event.name;
  const label=document.createElement("p");label.className="current-step-phase";label.dataset.symbol=category.symbol;label.textContent=category.label;
  const meta=document.createElement("p");meta.className="current-step-meta";meta.textContent=event.source==="tool"?event.host+" · 도구 실행 중":"BASS · "+(event.attempt?"시도 "+event.attempt:"현재 단계");
  copy.append(title,label,meta);
  const stamp=document.createElement("time");stamp.className="current-step-time";stamp.dateTime=event.at;stamp.textContent="시작 "+time(event.started_at||event.at);
  content.append(copy,stamp);eventCopy(event,content);
}
function taskGroup(status){
  if(status==="ACTIVE")return "active";
  if(status==="DONE")return "done";
  if(status==="CANCELLED")return "cancelled";
  if(status==="CAPTURED"||status==="REVIEW")return "waiting";
  return "attention";
}
function renderTasks(items){
  latestTasks=items;
  const counts={all:items.length,active:0,waiting:0,attention:0,done:0,cancelled:0};
  for(const item of items)counts[taskGroup(item.status)]++;
  for(const button of $("task-filters").querySelectorAll(".task-filter")){
    button.setAttribute("aria-pressed",String(button.dataset.filter===taskFilter));
    button.querySelector("[data-count]").textContent=String(counts[button.dataset.filter]);
  }
  const rank={active:0,waiting:1,attention:2,done:3,cancelled:4};
  const visible=items.filter(item=>taskFilter==="all"||taskGroup(item.status)===taskFilter);
  visible.sort((a,b)=>{
    let order=0;
    if(taskSort==="status")order=rank[taskGroup(a.status)]-rank[taskGroup(b.status)]||a.status.localeCompare(b.status);
    else if(taskSort==="id")order=a.id.localeCompare(b.id,undefined,{numeric:true});
    else if(taskSort==="title")order=a.title.localeCompare(b.title,"ko");
    else order=(b.last_activity??"").localeCompare(a.last_activity??"");
    return order||a.id.localeCompare(b.id,undefined,{numeric:true});
  });
  const tasks=$("tasks");tasks.replaceChildren();
  if(!visible.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=items.length?"선택한 상태의 작업이 없습니다.":"등록된 작업이 없습니다.";tasks.append(empty)}
  for(const item of visible){
    const card=document.createElement("button");card.className="task";card.type="button";card.setAttribute("aria-label",item.id+" "+item.title+" 진행 과정 보기");
    card.addEventListener("click",()=>{selectedTaskId=item.id;scrollToTop();refresh().then(()=>{enterView($("task-detail"));$("back").focus()})});
    const top=document.createElement("div");top.className="task-top";const heading=document.createElement("div");
    const title=document.createElement("h3");title.textContent=item.id+" · "+item.title;
    const meta=document.createElement("p");meta.className="muted";meta.textContent="시도 "+(item.current_attempt??item.attempts)+" / "+item.max_attempts;heading.append(title,meta);
    const badge=document.createElement("span");badge.className="badge";badge.textContent=labels[item.status]||item.status;top.append(heading,badge);card.append(top);
    const detail=document.createElement("p");detail.className="task-detail";const parts=["증거 "+item.evidence,"평가 "+(item.evaluations.length?item.evaluations.map(x=>x.name+":"+x.status).join(", "):"기록 없음"),"비용 "+(item.usage.estimated_cost??"unknown")];
    for(const part of parts){const span=document.createElement("span");span.textContent=part;detail.append(span)}card.append(detail);
    if(item.blocked_reason){const reason=document.createElement("p");reason.className="task-reason";reason.textContent=item.blocked_reason;card.append(reason)}tasks.append(card);
  }
}
$("task-filters").addEventListener("click",event=>{const button=event.target.closest("button[data-filter]");if(!button)return;taskFilter=button.dataset.filter;renderTasks(latestTasks)});
$("task-sort").addEventListener("change",()=>{taskSort=$("task-sort").value;renderTasks(latestTasks)});
function render(data){text($("project"),data.project);text($("updated"),"갱신 " + time(data.generated_at));
const active=data.active_task; text($("active-title"),active?active.id+" · "+active.title:"활성 작업 없음");text($("active-meta"),active?labels[active.status]||active.status:"현재 실행 중인 BASS 작업이 없습니다.");text($("blocked"),active?.blocked_reason||"");
const budget=$("budgets");budget.replaceChildren();if(data.budget){const b=data.budget;budget.append(metric("남은 시도",b.attempts_remaining+" / "+b.max_attempts),metric("남은 턴 · 완료 기록",b.turns_remaining+" / "+b.max_turns),metric("남은 시간",b.remaining_ms===null?"기록 없음":Math.ceil(b.remaining_ms/60000)+"분"))}else budget.append(metric("남은 시도","—"),metric("남은 턴","—"),metric("남은 시간","—"));
renderTasks(data.tasks);
const issues=$("issues");issues.replaceChildren();for(const issue of [...data.issues,...data.warnings]){const p=document.createElement("p");p.textContent=issue;issues.append(p)}
const timeline=$("timeline");timeline.replaceChildren();if(!data.history.length){const empty=document.createElement("li");empty.className="empty";empty.textContent="표시할 이벤트가 없습니다.";timeline.append(empty)}for(const item of data.history){const row=document.createElement("li");row.className="event";row.dataset.status=item.status;const stamp=document.createElement("time");stamp.dateTime=item.at;stamp.textContent=time(item.at);const heading=document.createElement("div");const title=document.createElement("p");title.className="event-title";title.textContent=item.name;const sub=document.createElement("p");sub.className="event-sub";sub.textContent=item.source==="bass"?"BASS · "+item.status:item.host+" · "+item.status;heading.append(title,sub);row.append(stamp,heading);eventCopy(item,row);timeline.append(row)}const showingDetail=Boolean(selectedTaskId&&data.selected_task);$("overview").hidden=showingDetail;$("task-detail").hidden=!showingDetail;if(showingDetail)renderTaskDetail(data)}
$("back").addEventListener("click",()=>{selectedTaskId=null;$("task-detail").hidden=true;$("overview").hidden=false;scrollToTop();refresh().then(()=>{enterView($("overview"));$("tasks").querySelector("button")?.focus()})});
function enterView(view){view.classList.remove("view-enter");void view.offsetWidth;view.classList.add("view-enter")}
function scrollToTop(){window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"})}
async function refresh(){try{const query=selectedTaskId?"?task="+encodeURIComponent(selectedTaskId):"";const response=await fetch("/api/state"+query,{cache:"no-store"});if(!response.ok)throw new Error("offline");render(await response.json());document.body.dataset.connected="true";text($("connection"),"로컬 서버 연결됨")}catch{document.body.dataset.connected="false";text($("connection"),"서버 연결 끊김");text($("active-title"),"관찰 서버와 연결할 수 없습니다.")}}
refresh();setInterval(refresh,1000);`;
