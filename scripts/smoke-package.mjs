import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bass-package-smoke-"));
const npmCache = path.join(tempRoot, "npm-cache");
const npmCli = process.env.npm_execpath;

assert.ok(npmCli, "smoke:package must run through npm so npm_execpath is available");

function run(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_cache: npmCache },
  }).trim();
}

function runNpm(args, cwd = root) {
  return run(process.execPath, [npmCli, ...args], cwd);
}

function setupArgs(target, profiles = "common") {
  return ["setup", target, "--non-interactive", "--profiles", profiles, "--capability", "simplicity=builtin"];
}

try {
  const packed = JSON.parse(runNpm(["pack", "--json", "--pack-destination", tempRoot]));
  const tarball = path.join(tempRoot, packed[0].filename);
  const packedPaths = packed[0].files.map((file) => file.path);
  for (const required of [
    "dist/cli/main.js",
    "profiles/game.yaml",
    "plugins/bass/.codex-plugin/plugin.json",
    "plugins/bass/.claude-plugin/plugin.json",
    "plugins/bass/hooks/hooks.json",
  ]) assert.ok(packedPaths.includes(required), `missing package file: ${required}`);
  for (const excludedPrefix of ["src/", "tests/", "examples/", "tasks/"]) {
    assert.equal(packedPaths.some((file) => file.startsWith(excludedPrefix)), false);
  }

  const dependencyTarballs = Object.keys(packageJson.dependencies).map((dependency) => {
    const dependencyPack = JSON.parse(runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", tempRoot, path.join(root, "node_modules", dependency)]));
    return path.join(tempRoot, dependencyPack[0].filename);
  });
  const host = path.join(tempRoot, "host");
  fs.mkdirSync(host);
  fs.writeFileSync(path.join(host, "package.json"), JSON.stringify({ private: true }), "utf8");
  runNpm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball, ...dependencyTarballs], host);
  const bass = path.join(host, "node_modules", ".bin", process.platform === "win32" ? "bass.cmd" : "bass");
  assert.equal(run(bass, ["--version"], host), packageJson.version);

  const nodeRepo = path.join(tempRoot, "node-web");
  fs.mkdirSync(nodeRepo);
  const nodePackage = JSON.stringify({ name: "node-web", private: true, scripts: { test: "node --test" } }, null, 2);
  fs.writeFileSync(path.join(nodeRepo, "package.json"), nodePackage, "utf8");
  run(bass, setupArgs(nodeRepo, "common,web"), host);
  assert.equal(fs.readFileSync(path.join(nodeRepo, "package.json"), "utf8"), nodePackage);
  assert.ok(fs.existsSync(path.join(nodeRepo, "bass.yaml")));

  const pythonRepo = path.join(tempRoot, "python-repo");
  fs.mkdirSync(pythonRepo);
  fs.writeFileSync(path.join(pythonRepo, "pyproject.toml"), "[project]\nname='demo'\n", "utf8");
  run(bass, setupArgs(pythonRepo), host);
  assert.equal(fs.existsSync(path.join(pythonRepo, "package.json")), false);

  const unityRepo = path.join(tempRoot, "unity-repo");
  fs.mkdirSync(path.join(unityRepo, "Assets"), { recursive: true });
  run(bass, setupArgs(unityRepo, "common,game"), host);
  run(bass, ["runtime", "scaffold", "unity", "--destination", "prototype", "--targets", "macos", "--confirm"], unityRepo);
  assert.equal(fs.existsSync(path.join(unityRepo, "package.json")), false);
  assert.equal(fs.existsSync(path.join(unityRepo, "prototype", "package.json")), false);

  const legacy = path.join(tempRoot, "legacy");
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, "bass.yaml"), "bass:\n  version: 0.2.1\n  profiles: [common]\nproject:\n  name: legacy\n", "utf8");
  fs.writeFileSync(path.join(legacy, "AGENTS.md"), "# Keep me\n", "utf8");
  const before = fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8");
  assert.match(run(bass, ["upgrade", "--check"], legacy), /No files changed/);
  assert.equal(fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8"), before);
  run(bass, ["upgrade", "--apply"], legacy);
  assert.match(fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8"), new RegExp(`version: ${packageJson.version}`));
  assert.match(fs.readFileSync(path.join(legacy, "AGENTS.md"), "utf8"), /# Keep me/);

  const mismatch = fs.readFileSync(path.join(nodeRepo, "bass.yaml"), "utf8").replace(`version: ${packageJson.version}`, "version: 999.0.0");
  fs.writeFileSync(path.join(nodeRepo, "bass.yaml"), mismatch, "utf8");
  const failed = spawnSync(bass, ["config", "explain"], { cwd: nodeRepo, encoding: "utf8" });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Install @offbeat24\/bass@999\.0\.0/);

  console.log(`package smoke PASS: ${packageJson.name}@${packageJson.version}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
