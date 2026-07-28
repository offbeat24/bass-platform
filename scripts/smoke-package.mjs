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
  run(bassBin, ["init", "--name", "package-smoke", "--profiles", "common,cli"], demo);
  const explanation = run(bassBin, ["config", "explain"], demo);
  assert.match(explanation, /profiles: common, cli/);

  const createdProject = path.join(consumer, "created-project");
  run(
    bassBin,
    ["create", createdProject, "--profiles", "common,web", "--design"],
    consumer,
  );
  const createdBassBin = path.join(createdProject, "node_modules", ".bin", "bass");
  assert.ok(fs.existsSync(path.join(createdProject, "tools", `bass-platform-${packageJson.version}.tgz`)));
  assert.equal(run(createdBassBin, ["--version"], createdProject), packageJson.version);
  assert.match(run(createdBassBin, ["doctor"], createdProject), /\[PASS\]/);
  assert.match(
    JSON.parse(fs.readFileSync(path.join(createdProject, "package.json"), "utf8")).devDependencies[
      "bass-platform"
    ],
    /^file:tools\/bass-platform-/,
  );

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
