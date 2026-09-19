const fs = require("node:fs");
const path = require("node:path");

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
    let root = path.resolve(payload.cwd || process.cwd());
    while (!fs.existsSync(path.join(root, "bass.yaml"))) {
      const parent = path.dirname(root);
      if (parent === root) return;
      root = parent;
    }
    const message = "BASS project: follow AGENTS.md. For implementation use bass-work with the task guide; for read-only questions inspect only relevant evidence.";
    const output = process.env.PLUGIN_DATA
      ? { systemMessage: "BASS:READY", hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message } }
      : message;
    process.stdout.write(typeof output === "string" ? output : JSON.stringify(output));
  } catch (_) {
    // An optional routing hint must not break host session startup.
  }
}
