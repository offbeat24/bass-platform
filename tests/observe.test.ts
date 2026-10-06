import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";
import { startObserver, sanitizePreview } from "../src/observe/index.js";
import { makeTempProject, writeTask } from "./helpers.js";

const root = path.resolve(import.meta.dirname, "..");
const bridge = path.join(root, "plugins", "bass", "hooks", "observer-event.cjs");
const projects: string[] = [];
const observers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const observer of observers.splice(0)) await observer.close();
  for (const project of projects.splice(0)) fs.rmSync(project, { recursive: true, force: true });
});

describe("local observer", () => {
  it("redacts likely secrets, omits prompt flags, and caps previews", () => {
    const preview = sanitizePreview("OPENAI_API_KEY=secret123 Bearer abc.def --prompt 'private words' " + "x".repeat(500), 100);
    expect(preview).not.toContain("secret123");
    expect(preview).not.toContain("abc.def");
    expect(preview).not.toContain("private words");
    expect(preview.length).toBeLessThanOrEqual(100);
  });

  it("shows BASS history and live Codex/Claude lifecycle while keeping previews transient", async () => {
    const project = makeTempProject({});
    projects.push(project);
    writeTask(project, "BASS-056", { status: "DONE" });
    writeTask(project, "BASS-058", { status: "DONE" });
    writeTask(project, "BASS-057", { status: "ACTIVE", loop: { max_attempts: 3, max_turns: 12, max_minutes: 60 } });
    const eventFile = path.join(project, ".bass", "events.jsonl");
    fs.mkdirSync(path.dirname(eventFile), { recursive: true });
    const now = Date.now();
    const events = [
      { schema_version: 1, at: new Date(now - 80_000).toISOString(), task_id: "BASS-057", kind: "task.started", summary: "legacy event" },
      { schema_version: 2, at: new Date(now - 70_000).toISOString(), task_id: "BASS-058", kind: "task.started", name: "loop-budget-resume", summary: "approved time window" },
      { schema_version: 3, at: new Date(now - 60_000).toISOString(), task_id: "BASS-056", kind: "semantic.completed", status: "pass", summary: "semantic evaluation passed" },
      { schema_version: 2, at: new Date(now - 50_000).toISOString(), task_id: "BASS-057", attempt: 1, kind: "attempt.started", status: "running", summary: "attempt started" },
      { schema_version: 2, at: new Date(now - 10_000).toISOString(), task_id: "BASS-057", kind: "task.started", name: "loop-budget-resume", summary: "approved new window" },
    ];
    fs.writeFileSync(eventFile, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
    const config = loadConfig({ projectRoot: project });
    const observer = await startObserver(project, config);
    observers.push(observer);
    const descriptorPath = path.join(project, ".bass", "observer-runtime.json");
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
    if (process.platform !== "win32") expect(fs.statSync(descriptorPath).mode & 0o777).toBe(0o600);

    await sendHook(project, { hook_event_name: "PreToolUse", turn_id: "turn-c", tool_use_id: "call-c", tool_name: "Bash", tool_input: { command: "npm test observer-only-preview-12345" } });
    await sendHook(project, { hook_event_name: "PostToolUse", turn_id: "turn-c", tool_use_id: "call-c", tool_name: "Bash", tool_input: { command: "npm test observer-only-preview-12345" }, tool_response: "PASS OPENAI_API_KEY=leak123", duration_ms: 900 });
    await sendHook(project, { hook_event_name: "PreToolUse", session_id: "session-claude", tool_use_id: "call-f", tool_name: "Bash", tool_input: { command: "npm test" } });
    await sendHook(project, { hook_event_name: "PostToolUseFailure", session_id: "session-claude", tool_use_id: "call-f", tool_name: "Bash", tool_input: { command: "npm test" }, error: "Exit code 1", duration_ms: 1200 });
    await sendHook(project, { hook_event_name: "PreToolUse", turn_id: "turn-live", tool_use_id: "call-live", tool_name: "Bash", tool_input: { command: "npm test current-step-preview-67890" } });

    const response = await fetch(`${observer.url}api/state`);
    const state = await response.json() as any;
    expect(state.active_task.id).toBe("BASS-057");
    expect(state.tasks.find((item: any) => item.id === "BASS-057").last_activity).toBe(events[4].at);
    expect(state.budget.current_attempt).toBe(1);
    expect(state.budget.attempts_remaining).toBe(2);
    expect(state.budget.remaining_ms).toBeLessThan(3_600_000);
    expect(state.budget.remaining_ms).toBeGreaterThan(3_500_000);
    expect(state.history.map((event: any) => event.output_preview).join(" ")).not.toContain("leak123");
    expect(state.history.some((event: any) => event.name.includes("BASS-056") && event.name.includes("Semantic 평가 완료"))).toBe(true);
    expect(state.history.some((event: any) => event.name.includes("BASS-058") && event.name.includes("시간 예산 승인 재개"))).toBe(true);
    expect(state.history.some((event: any) => event.host === "codex" && event.status === "success")).toBe(true);
    expect(state.history.some((event: any) => event.host === "claude" && event.status === "failure")).toBe(true);

    const detail56 = await (await fetch(`${observer.url}api/state?task=BASS-056`)).json() as any;
    expect(detail56.selected_task.id).toBe("BASS-056");
    expect(detail56.current_step).toBeNull();
    expect(detail56.task_history.every((event: any) => event.task_id === "BASS-056")).toBe(true);
    expect(detail56.task_history[0].kind).toBe("semantic.completed");
    const detail58 = await (await fetch(`${observer.url}api/state?task=BASS-058`)).json() as any;
    expect(detail58.task_history).toHaveLength(1);
    expect(detail58.task_history[0].name).toContain("시간 예산 승인 재개");
    const detail57 = await (await fetch(`${observer.url}api/state?task=BASS-057`)).json() as any;
    expect(detail57.task_history.map((event: any) => Date.parse(event.at))).toEqual(
      [...detail57.task_history].map((event: any) => Date.parse(event.at)).sort((a: number, b: number) => a - b),
    );
    expect(detail57.task_history.some((event: any) => event.source === "tool" && event.host === "codex" && event.status === "success")).toBe(true);
    expect(detail57.task_history.some((event: any) => event.source === "tool" && event.host === "claude" && event.status === "failure")).toBe(true);
    expect(detail57.current_step.source).toBe("tool");
    expect(detail57.current_step.status).toBe("running");
    expect(detail57.current_step.input_preview).toContain("current-step-preview-67890");
    expect((await fetch(`${observer.url}api/state?task=UNKNOWN`)).status).toBe(404);

    const script = await (await fetch(`${observer.url}app.js`)).text();
    const styles = await (await fetch(`${observer.url}style.css`)).text();
    expect(script).toContain("setInterval(refresh,1000)");
    expect(script).toContain("진행 과정 보기");
    expect(script).toContain("task_history");
    expect(script).toContain("for(let i=data.task_history.length-1;i>=0;i--)");
    expect(script).toContain('row.dataset.sequence=String(i+1).padStart(2,"0")');
    expect(script).toContain("textContent");
    expect(script).not.toContain("innerHTML");
    for (const kind of ["start", "attempt", "tool", "validation", "evidence", "review", "result"]) {
      expect(styles).toContain(`.step[data-kind="${kind}"]`);
    }
    expect(script).toContain('key:"validation",symbol:"✓",label:"검증"');
    expect(script).toContain('key:"tool",symbol:"⌘",label:"도구 실행"');
    expect(script).toContain("taskGroup");
    expect(script).toContain("last_activity");
    expect(script).toContain("aria-pressed");
    expect(script).toContain('a.title.localeCompare(b.title,"ko")');
    expect(script).toContain('a.id.localeCompare(b.id,undefined,{numeric:true})');
    expect(script).toContain("enterView($(\"task-detail\"))");
    expect(styles).toContain("prefers-reduced-motion:reduce");
    expect(styles).toContain("@keyframes view-enter");
    const page = await (await fetch(observer.url)).text();
    expect(page).toContain("Codex 호스팅 도구");
    for (const group of ["all", "active", "waiting", "attention", "done", "cancelled"]) {
      expect(page).toContain(`data-filter="${group}"`);
    }
    for (const sort of ["recent", "status", "id", "title"]) {
      expect(page).toContain(`value="${sort}"`);
    }
    expect(page).toContain("id=\"task-detail\"");
    expect(page.indexOf("id=\"current-step-panel\"")).toBeLessThan(page.indexOf("id=\"task-timeline\""));
    expect(page).toContain("전체 작업");
    const style = await (await fetch(`${observer.url}style.css`)).text();
    expect(style).toContain(".step:before{content:attr(data-sequence)");
    expect(style).toContain(".current-step-panel[data-kind=\"tool\"]");
    expect(script).toContain("renderCurrentStep(data.current_step)");

    await observer.close();
    const persisted = filesUnder(path.join(project, ".bass")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(persisted).not.toContain("observer-only-preview-12345");
    expect(persisted).not.toContain("leak123");
    expect(fs.existsSync(descriptorPath)).toBe(false);
    observers.splice(observers.indexOf(observer), 1);
  });

  it("rejects invalid tokens, foreign hosts, and oversized payloads", async () => {
    const project = makeTempProject({});
    projects.push(project);
    const observer = await startObserver(project, loadConfig({ projectRoot: project }));
    observers.push(observer);
    const descriptor = JSON.parse(fs.readFileSync(path.join(project, ".bass", "observer-runtime.json"), "utf8"));
    const payload = JSON.stringify({ host: "codex", phase: "start", id: "x", name: "Bash" });
    expect((await fetch(`${observer.url}_tool`, { method: "POST", headers: { authorization: "Bearer invalid" }, body: payload })).status).toBe(401);
    expect(await getWithHost(observer.url, "attacker.invalid")).toBe(403);
    expect((await fetch(`${observer.url}_tool`, { method: "POST", headers: { authorization: `Bearer ${descriptor.token}` }, body: "x".repeat(9_000) })).status).toBe(413);
    expect(new URL(observer.url).hostname).toBe("127.0.0.1");
  });

  it("lets the hook exit successfully when no observer is running", async () => {
    const project = makeTempProject({});
    projects.push(project);
    const result = await runBridge(project, { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "echo ok" } });
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(project, ".bass", "observer-runtime.json"))).toBe(false);
  });
});

function sendHook(project: string, payload: Record<string, unknown>): Promise<{ code: number | null; output: string }> {
  return runBridge(project, { cwd: project, ...payload });
}

function runBridge(project: string, payload: Record<string, unknown>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bridge], { cwd: project, env: { ...process.env, PLUGIN_ROOT: "" } });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

function getWithHost(url: string, host: string): Promise<number> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port: Number(target.port), path: "/api/state", headers: { host } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
  });
}
