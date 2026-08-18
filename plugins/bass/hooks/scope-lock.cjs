const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", run);
process.stdin.on("error", () => process.exit(0));
setTimeout(run, 1000).unref();

let finished = false;
function run() {
  if (finished) return;
  finished = true;
  try {
    const payload = input ? JSON.parse(input.replace(/^\uFEFF/, "")) : {};
    const root = findRoot(payload.cwd || process.cwd());
    if (!root) return;
    const task = activeTask(root);
    if (!task) return;
    const changed = gitLines(root, ["status", "--porcelain=v1"])
      .map((line) => line.slice(3).split(" -> ").pop())
      .filter(Boolean);
    const forbidden = section(task, "Forbidden scope");
    const allowed = section(task, "Allowed scope");
    const violations = changed.filter((file) => matchesAny(file, forbidden) || (allowed.length > 0 && !matchesAny(file, allowed)));
    if (violations.length === 0) return;
    const diff = gitLines(root, ["diff", "--no-ext-diff", "--binary"]).join("\n") + changed.join("\n");
    const fingerprint = crypto.createHash("sha256").update(diff).digest("hex");
    const cache = path.join(root, ".bass", "cache", "scope-warning.txt");
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    const lock = `${cache}.lock`;
    let lockHandle;
    try {
      lockHandle = fs.openSync(lock, "wx");
    } catch (error) {
      if (error && error.code === "EEXIST") return;
      throw error;
    }
    const temporary = `${cache}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      if (fs.existsSync(cache) && fs.readFileSync(cache, "utf8") === fingerprint) return;
      fs.writeFileSync(temporary, fingerprint, "utf8");
      fs.renameSync(temporary, cache);
      output(`BASS scope lock warning: ${violations.slice(0, 5).join(", ")}. Do not expand scope; revert or obtain an explicit scope decision.`);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      fs.closeSync(lockHandle);
      fs.unlinkSync(lock);
    }
  } catch (_) {}
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

function activeTask(root) {
  for (const dir of [path.join(root, ".bass", "tasks"), path.join(root, "tasks")]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort().reverse()) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      if (/^status:\s*(ACTIVE|IMPLEMENTING|VERIFYING|CRITIQUING)\s*$/m.test(content)) return content;
    }
  }
  return null;
}

function section(content, name) {
  const match = content.match(new RegExp(`^##\\s+${name}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "mi"));
  if (!match) return [];
  return match[1].split(/[\n,]/).map((line) => line.replace(/^[-*]\s*/, "").trim().replace(/^\.\//, "").replace(/\/$/, "")).filter(Boolean);
}

function matchesAny(file, scopes) {
  const normalized = file.replace(/\\/g, "/");
  return scopes.some((scope) => normalized === scope || normalized.startsWith(`${scope}/`) || (scope.endsWith("*") && normalized.startsWith(scope.slice(0, -1))));
}

function gitLines(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 3000 });
  return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function output(message) {
  if (process.env.PLUGIN_DATA) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }));
  } else process.stdout.write(message);
}
