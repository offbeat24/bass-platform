import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bass-package-smoke-"));
const npmCache = path.join(tempRoot, "npm-cache");

function run(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, npm_config_cache: npmCache },
  }).trim();
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", tempRoot]));
  const tarball = path.join(tempRoot, packed[0].filename);
  const packedPaths = packed[0].files.map((file) => file.path);
  assert.ok(packedPaths.includes("dist/cli/main.js"));
  assert.ok(packedPaths.includes("templates/task.md"));
  assert.ok(packedPaths.includes("templates/runtime.yaml"));
  for (const excludedPrefix of ["src/", "tests/", "examples/", "scripts/", "tasks/"]) {
    assert.equal(packedPaths.some((file) => file.startsWith(excludedPrefix)), false);
  }
  const dependencyTarballs = Object.keys(packageJson.dependencies).map((dependency) => {
    const dependencyPack = JSON.parse(
      run("npm", [
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        tempRoot,
        path.join(root, "node_modules", dependency),
      ]),
    );
    return path.join(tempRoot, dependencyPack[0].filename);
  });
  const consumer = path.join(tempRoot, "consumer");
  const demo = path.join(consumer, "demo");
  fs.mkdirSync(demo, { recursive: true });
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true }), "utf8");

  run(
    "npm",
    ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", tarball, ...dependencyTarballs],
    consumer,
  );
  const bassBin = path.join(consumer, "node_modules", ".bin", "bass");

  assert.equal(run(bassBin, ["--version"], consumer), packageJson.version);
  run(bassBin, ["init", "--name", "package-smoke", "--preset", "nan2026"], demo);
  const explanation = run(bassBin, ["config", "explain"], demo);
  assert.match(explanation, /profiles: common, nan2026/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(demo, ".bass", "nan2026-manifest.json"), "utf8")).bassVersion,
    packageJson.version,
  );
  const agentGuide = run(bassBin, ["agent", "guide"], demo);
  assert.match(agentGuide, /concept\/runtime selection/);
  assert.match(agentGuide, /adoption into an existing repository as one proportional task/);
  assert.match(
    fs.readFileSync(path.join(demo, "AGENTS.md"), "utf8"),
    /기존 프로젝트의 지침·검증·디자인·이력을 원천으로 보존/,
  );
  assert.match(run(bassBin, ["nan", "trace", "validate"], demo), /trace PASS/);
  assert.match(run(bassBin, ["nan", "protect", "verify"], demo), /\[pass\]/);

  const existingProject = path.join(consumer, "existing-project");
  fs.mkdirSync(existingProject, { recursive: true });
  fs.writeFileSync(path.join(existingProject, "AGENTS.md"), "# Existing project rules\n", "utf8");
  const existingInit = run(
    bassBin,
    ["init", "--name", "existing-project", "--profiles", "common"],
    existingProject,
  );
  assert.match(existingInit, /integration required: preserve skipped files/);
  assert.equal(
    fs.readFileSync(path.join(existingProject, "AGENTS.md"), "utf8"),
    "# Existing project rules\n",
  );

  const createdProject = path.join(consumer, "created-project");
  run(
    bassBin,
    ["create", createdProject, "--design"],
    consumer,
  );
  const createdBassBin = path.join(createdProject, "node_modules", ".bin", "bass");
  assert.ok(fs.existsSync(path.join(createdProject, "tools", `bass-platform-${packageJson.version}.tgz`)));
  assert.equal(run(createdBassBin, ["--version"], createdProject), packageJson.version);
  assert.match(run(createdBassBin, ["config", "explain"], createdProject), /profiles: common, web/);
  assert.match(run(createdBassBin, ["doctor"], createdProject), /\[PASS\]/);
  assert.match(run(createdBassBin, ["agent", "guide"], createdProject), /design spec: template/);
  assert.match(
    fs.readFileSync(path.join(createdProject, "AGENTS.md"), "utf8"),
    /기존 프로젝트의 지침·검증·디자인·이력을 원천으로 보존/,
  );
  assert.equal(fs.existsSync(path.join(createdProject, "nan2026.yaml")), false);
  assert.match(
    JSON.parse(fs.readFileSync(path.join(createdProject, "package.json"), "utf8")).devDependencies[
      "bass-platform"
    ],
    /^file:tools\/bass-platform-/,
  );

  const nanCreatedProject = path.join(consumer, "nan-created-project");
  run(
    bassBin,
    ["create", nanCreatedProject, "--preset", "nan2026", "--design", "--no-install"],
    consumer,
  );
  assert.ok(fs.existsSync(path.join(nanCreatedProject, "nan2026.yaml")));
  assert.match(run(bassBin, ["nan", "protect", "verify"], nanCreatedProject), /\[pass\]/);
  assert.match(run(bassBin, ["agent", "guide"], nanCreatedProject), /concept\/runtime selection/);

  const configFile = path.join(demo, "bass.yaml");
  const config = fs.readFileSync(configFile, "utf8").replace(
    `version: ${packageJson.version}`,
    "version: 999.0.0",
  );
  fs.writeFileSync(configFile, config, "utf8");
  const mismatch = spawnSync(bassBin, ["config", "explain"], { cwd: demo, encoding: "utf8" });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /BASS version mismatch: project requires 999\.0\.0/);

  console.log(`package smoke PASS: ${packageJson.name}@${packageJson.version}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
