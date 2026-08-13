#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const version = findVersion(process.cwd()) || pluginVersion();
if (!/^0\.4\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid BASS 0.4 version: ${version}`);
  process.exit(1);
}
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["exec", "--yes", `--package=@offbeat24/bass@${version}`, "--", "bass", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});
if (result.error) {
  console.error(`Unable to launch @offbeat24/bass@${version}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);

function findVersion(start) {
  let current = path.resolve(start);
  while (true) {
    const file = path.join(current, "bass.yaml");
    if (fs.existsSync(file)) {
      const match = fs.readFileSync(file, "utf8").match(/^\s*version:\s*["']?([^\s"']+)/m);
      return match && match[1];
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function pluginVersion() {
  for (const file of [
    path.join(__dirname, "..", ".codex-plugin", "plugin.json"),
    path.join(__dirname, "..", ".claude-plugin", "plugin.json"),
  ]) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")).version;
  }
  throw new Error("BASS plugin manifest not found");
}
