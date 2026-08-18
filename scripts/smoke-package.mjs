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

function run(command, args, cwd = root, extraEnv = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_cache: npmCache, ...extraEnv },
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
    "plugins/bass/skills/bass-shape/SKILL.md",
    "templates/PRODUCT.md",
    "templates/TECH.md",
    "templates/spec.md",
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
  const bassCli = path.join(host, "node_modules", packageJson.name, packageJson.bin.bass);
  const runBass = (args, cwd = host, extraEnv = {}) => run(process.execPath, [bassCli, ...args], cwd, extraEnv);
  assert.equal(runBass(["--version"]), packageJson.version);

  const nodeRepo = path.join(tempRoot, "node-web");
  fs.mkdirSync(nodeRepo);
  const nodePackage = JSON.stringify({ name: "node-web", private: true, scripts: { test: "node --test" } }, null, 2);
  fs.writeFileSync(path.join(nodeRepo, "package.json"), nodePackage, "utf8");
  runBass(setupArgs(nodeRepo, "common,web"));
  const repeatedSetup = runBass(setupArgs(nodeRepo, "common,web"));
  assert.doesNotMatch(repeatedSetup, /^(?:created|updated):/m);
  assert.equal(fs.readFileSync(path.join(nodeRepo, "package.json"), "utf8"), nodePackage);
  assert.ok(fs.existsSync(path.join(nodeRepo, "bass.yaml")));
  for (const artifact of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
    assert.ok(fs.existsSync(path.join(nodeRepo, artifact)), `missing product artifact: ${artifact}`);
  }
  runBass(["task", "new", "PKG-1", "--title", "Package task"], nodeRepo);
  const graph = JSON.parse(runBass(["task", "graph", "--json"], nodeRepo));
  assert.deepEqual(graph.ready, ["PKG-1"]);
  runBass(["task", "transition", "PKG-1", "ACTIVE"], nodeRepo);
  runBass(["task", "attempt", "start", "PKG-1"], nodeRepo);
  runBass(["task", "attempt", "finish", "PKG-1", "--result", "pass", "--summary", "package flow passed", "--turns", "1"], nodeRepo);
  const status = JSON.parse(runBass(["status", "--json"], nodeRepo));
  assert.equal(status.tasks[0].attempts, 1);
  assert.equal(status.tasks[0].current_attempt, null);

  const pythonRepo = path.join(tempRoot, "python-repo");
  fs.mkdirSync(pythonRepo);
  fs.writeFileSync(path.join(pythonRepo, "pyproject.toml"), "[project]\nname='demo'\n", "utf8");
  runBass(setupArgs(pythonRepo));
  assert.equal(fs.existsSync(path.join(pythonRepo, "package.json")), false);

  const unityRepo = path.join(tempRoot, "unity-repo");
  fs.mkdirSync(path.join(unityRepo, "Assets"), { recursive: true });
  runBass(setupArgs(unityRepo, "common,game"));
  runBass(["runtime", "scaffold", "unity", "--destination", "prototype", "--targets", "macos", "--confirm"], unityRepo);
  assert.equal(fs.existsSync(path.join(unityRepo, "package.json")), false);
  assert.equal(fs.existsSync(path.join(unityRepo, "prototype", "package.json")), false);

  const legacy = path.join(tempRoot, "legacy");
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, "bass.yaml"), "bass:\n  version: 0.2.1\n  profiles: [common]\nproject:\n  name: legacy\n", "utf8");
  fs.writeFileSync(path.join(legacy, "AGENTS.md"), "# Keep me\n", "utf8");
  const before = fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8");
  assert.match(runBass(["upgrade", "--check"], legacy), /No files changed/);
  assert.equal(fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8"), before);
  runBass(["upgrade", "--apply"], legacy);
  assert.match(fs.readFileSync(path.join(legacy, "bass.yaml"), "utf8"), new RegExp(`version: ${packageJson.version}`));
  assert.match(fs.readFileSync(path.join(legacy, "AGENTS.md"), "utf8"), /# Keep me/);
  assert.match(runBass(["upgrade", "--apply"], legacy), /No changes required/);

  const providerRepo = path.join(tempRoot, "provider-repo");
  fs.mkdirSync(providerRepo);
  runBass(["setup", providerRepo, "--non-interactive", "--capability", "simplicity=ponytail"], host);
  const fakeHome = path.join(tempRoot, "provider-home");
  for (const agentHost of ["codex", "claude"]) {
    const manifest = agentHost === "codex" ? ".codex-plugin" : ".claude-plugin";
    const pluginManifest = path.join(fakeHome, `.${agentHost}`, "plugins", "cache", "test-market", "ponytail", "1.0.0", manifest);
    fs.mkdirSync(pluginManifest, { recursive: true });
    fs.writeFileSync(path.join(pluginManifest, "plugin.json"), JSON.stringify({ name: "ponytail", version: "1.0.0" }), "utf8");
  }
  const providerEnv = {
    HOME: fakeHome,
    USERPROFILE: fakeHome,
    PATH: "",
    BASS_CODEX_ACTIVE_CAPABILITIES: "ponytail",
    BASS_CLAUDE_ACTIVE_CAPABILITIES: "ponytail",
  };
  assert.match(runBass(["doctor", "--capabilities", "--host", "all"], providerRepo, providerEnv), /\[CODEX\]\[ACTUAL-PLUGIN\]/);
  runBass(["task", "new", "PKG-2", "--title", "External provider task"], providerRepo, providerEnv);
  runBass(["task", "transition", "PKG-2", "ACTIVE"], providerRepo, providerEnv);
  runBass(["task", "attempt", "start", "PKG-2"], providerRepo, providerEnv);
  const claimed = JSON.parse(runBass([
    "capability", "claim", "PKG-2", "ponytail:full", "--host", "codex", "--json",
  ], providerRepo, providerEnv));
  assert.equal(claimed.action, "run");
  runBass([
    "capability", "complete", "PKG-2", "ponytail:full", "--host", "codex",
    "--status", "pass", "--summary", "package provider flow passed",
  ], providerRepo, providerEnv);
  const reused = JSON.parse(runBass([
    "capability", "claim", "PKG-2", "ponytail:full", "--host", "claude", "--json",
  ], providerRepo, providerEnv));
  assert.equal(reused.action, "reuse");
  assert.equal(reused.callId, claimed.callId);
  fs.rmSync(path.join(fakeHome, ".claude"), { recursive: true, force: true });
  const missingHost = spawnSync(process.execPath, [bassCli, "doctor", "--capabilities", "--host", "all"], {
    cwd: providerRepo,
    encoding: "utf8",
    env: { ...process.env, ...providerEnv },
  });
  assert.notEqual(missingHost.status, 0);
  assert.match(missingHost.stdout, /\[CLAUDE\]\[MISSING\]/);

  const mismatch = fs.readFileSync(path.join(nodeRepo, "bass.yaml"), "utf8").replace(`version: ${packageJson.version}`, "version: 999.0.0");
  fs.writeFileSync(path.join(nodeRepo, "bass.yaml"), mismatch, "utf8");
  const failed = spawnSync(process.execPath, [bassCli, "config", "explain"], { cwd: nodeRepo, encoding: "utf8" });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /Install @offbeat24\/bass@999\.0\.0/);

  console.log(`package smoke PASS: ${packageJson.name}@${packageJson.version}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
