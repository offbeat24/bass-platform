const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_INPUT = 16_384;
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
  if (input.length > MAX_INPUT) process.exit(0);
});
process.stdin.on("end", send);
process.stdin.on("error", () => process.exit(0));
setTimeout(() => process.exit(0), 900).unref();

function send() {
  try {
    const payload = input ? JSON.parse(input.replace(/^\uFEFF/, "")) : {};
    const root = findRoot(payload.cwd || process.cwd());
    if (!root) return;
    const descriptor = JSON.parse(fs.readFileSync(path.join(root, ".bass", "observer-runtime.json"), "utf8"));
    if (!Number.isInteger(descriptor.port) || descriptor.port < 1 || descriptor.port > 65535
      || typeof descriptor.token !== "string" || descriptor.token.length !== 64) return;
    const eventName = payload.hook_event_name;
    if (!["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(eventName)) return;
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name.slice(0, 100) : "Tool";
    const toolInput = projectInput(payload.tool_input);
    const codex = Boolean(payload.turn_id || process.env.PLUGIN_ROOT);
    const phase = eventName === "PreToolUse" ? "start" : "finish";
    const status = eventName === "PostToolUseFailure" || (codex && isFailed(payload.tool_response)) ? "failure" : "success";
    const event = {
      host: codex ? "codex" : "claude",
      phase,
      id: typeof payload.tool_use_id === "string" ? payload.tool_use_id.slice(0, 128) : randomUUID(),
      name: toolName,
      at: new Date().toISOString(),
      input: toolInput,
      ...(phase === "finish" ? { status, output: outputPreview(payload.tool_response, toolName, toolInput) } : {}),
      ...(typeof payload.duration_ms === "number" ? { duration_ms: payload.duration_ms } : {}),
    };
    const body = Buffer.from(JSON.stringify(event));
    const request = http.request({
      hostname: "127.0.0.1",
      port: descriptor.port,
      path: "/_tool",
      method: "POST",
      agent: false,
      timeout: 500,
      headers: {
        host: `127.0.0.1:${descriptor.port}`,
        authorization: `Bearer ${descriptor.token}`,
        "content-type": "application/json",
        "content-length": body.length,
      },
    }, (response) => response.resume());
    request.on("error", () => {});
    request.on("timeout", () => request.destroy());
    request.end(body);
  } catch (_) {
    // The observer is optional; absent or stale state must not affect the tool call.
  }
}

function findRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "bass.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function clean(value, limit = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b[\w-]*(password|passwd|token|secret|api[_-]?key|authorization|cookie|private[_-]?key|access[_-]?key)[\w-]*\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[A-Z0-9]{12,}|AIza[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]")
    .replace(/(--?(?:prompt|message|system-prompt|input)\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi, "$1[OMITTED]")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}

function projectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result = {};
  for (const key of ["command", "cmd"]) if (typeof value[key] === "string") result[key] = clean(value[key]);
  for (const key of ["file_path", "path", "filename"]) {
    if (typeof value[key] === "string") result[key] = path.basename(value[key].replace(/\\/g, "/"));
  }
  if (typeof value.url === "string") {
    try { const url = new URL(value.url); result.url = `${url.origin}${url.pathname}`; } catch (_) {}
  }
  return result;
}

function isFailed(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.is_error === true || value.ok === false
    || (typeof value.exit_code === "number" && value.exit_code !== 0)
    || ["failed", "failure", "error"].includes(String(value.status).toLowerCase());
}

function outputPreview(value, toolName, toolInput) {
  if (/read|glob|grep|search|fetch|browser|web|file/i.test(toolName)) return "";
  const command = String(toolInput.command || toolInput.cmd || "").trim();
  const safeCommand = /^(?:git (?:status|branch|rev-parse|log)\b|(?:npm|pnpm|yarn|bun) (?:test|run (?:test|typecheck|build|lint)\b)|(?:npx )?tsc\b|vitest\b|pytest\b|cargo test\b|go test\b|swift test\b)/i.test(command);
  if (toolName.toLowerCase() === "bash" && !safeCommand) return "";
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (typeof value.exit_code === "number") return `exit code ${value.exit_code}`;
    if (typeof value.status === "string") return clean(value.status, 80);
  }
  return "";
}
