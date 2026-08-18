#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const pluginCommands = new Set(["setup", "create", "init", "upgrade"]);
const installedPluginVersion = pluginVersion();
const version = pluginCommands.has(args[0])
  ? packageVersion(installedPluginVersion)
  : findVersion(process.cwd()) || packageVersion(installedPluginVersion);
if (!/^0\.5\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`BASS 0.5 cannot run project version ${version}. Run the 0.5 launcher with \`upgrade --check\` first.`);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath || findNpmExecPath();
if (!npmExecPath) {
  console.error("Unable to locate npm-cli.js. Run with a standard Node.js/npm installation or set npm_execpath.");
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  [npmExecPath, "exec", "--yes", `--package=@offbeat24/bass@${version}`, "--", "bass", ...args],
  { cwd: process.cwd(), stdio: "inherit" },
);
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

function findNpmExecPath() {
  const bin = path.dirname(process.execPath);
  const candidates = [
    path.join(bin, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(bin, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(bin, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function packageVersion(version) {
  return version.split("+", 1)[0];
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
