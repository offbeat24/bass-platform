import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bass = path.join(root, "dist", "cli", "main.js");
const project = fs.mkdtempSync(path.join(os.tmpdir(), "bass-nan-smoke-"));

function run(args) {
  return execFileSync(process.execPath, [bass, ...args], {
    cwd: project,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

try {
  assert.equal(run(["--version"]), "0.1.1");
  run(["init", "--preset", "nan2026"]);
  assert.doesNotMatch(run(["init", "--preset", "nan2026"]), /conflict/);
  assert.match(run(["doctor"]), /\[PASS\]/);
  const first = run(["nan", "evidence", "report"]);
  const second = run(["nan", "evidence", "report"]);
  assert.equal(second, first);
  assert.match(run(["nan", "trace", "validate"]), /trace PASS/);
  assert.match(run(["nan", "runtime", "list"]), /pixi-web/);
  assert.match(run(["nan", "runtime", "recommend", "--concept", "CON-001"]), /Human approval is required/);
  assert.match(run(["nan", "runtime", "certify", "vanilla-web", "--targets", "web"]), /"certified"/);
  assert.match(run(["nan", "runtime", "apply", "vanilla-web", "--targets", "web", "--dest", "game"]), /"applied"/);
  assert.match(run(["nan", "runtime", "apply", "vanilla-web", "--targets", "web", "--dest", "game"]), /"unchanged"/);
  assert.match(run(["nan", "protect", "verify"]), /\[pass\]/);
  console.log("NAN smoke PASS: BASS 0.1.1 — NAN Edition");
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}
