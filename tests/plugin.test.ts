import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BASS_VERSION } from "../src/version.js";

const root = path.resolve(import.meta.dirname, "..");
const plugin = path.join(root, "plugins", "bass");

describe("team plugin", () => {
  it("CLI, Codex plugin, Claude plugin, 두 marketplace 버전이 0.3.0으로 일치한다", () => {
    const codex = JSON.parse(fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
    const claude = JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8"));
    const claudeMarket = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
    const codexMarket = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
    expect(codex.version).toBe(BASS_VERSION);
    expect(claude.version).toBe(BASS_VERSION);
    expect(claudeMarket.plugins[0].version).toBe(BASS_VERSION);
    expect(codexMarket.plugins[0].source.path).toBe("./plugins/bass");
  });

  it("SessionStart 컨텍스트는 600자 미만이다", () => {
    const result = spawnSync(process.execPath, [path.join(plugin, "hooks", "session-start.cjs")], { encoding: "utf8", env: { ...process.env, PLUGIN_DATA: os.tmpdir() } });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(600);
  });

  it("같은 diff의 scope 위반은 한 번만 경고한다", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "bass-hook-"));
    fs.writeFileSync(path.join(project, "bass.yaml"), "bass:\n  version: 0.3.0\n", "utf8");
    fs.mkdirSync(path.join(project, ".bass", "tasks"), { recursive: true });
    fs.writeFileSync(path.join(project, ".bass", "tasks", "T-1.md"), "---\nstatus: ACTIVE\n---\n\n## Allowed scope\n\nsrc/\n\n## Forbidden scope\n\ndocs/\n", "utf8");
    fs.mkdirSync(path.join(project, "docs"));
    fs.writeFileSync(path.join(project, "docs", "drift.md"), "drift", "utf8");
    spawnSync("git", ["init", "-q"], { cwd: project });
    const hook = path.join(plugin, "hooks", "scope-lock.cjs");
    const first = spawnSync(process.execPath, [hook], { cwd: project, input: JSON.stringify({ cwd: project }), encoding: "utf8" });
    const second = spawnSync(process.execPath, [hook], { cwd: project, input: JSON.stringify({ cwd: project }), encoding: "utf8" });
    expect(first.stdout).toContain("scope lock warning");
    expect(second.stdout).toBe("");
  });

  it("HTML report는 run record에서 고정 asset으로 생성한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bass-report-"));
    const record = path.join(dir, "record.json");
    const output = path.join(dir, "report.html");
    fs.writeFileSync(record, JSON.stringify({ task_id: "R-1", summary_of_changes: "Done <safe>", why: "Needed", files_changed: ["src/a.ts"], verification: { evaluations_run: [{ name: "test", level: 1, status: "pass" }] }, known_limitations: [] }), "utf8");
    const result = spawnSync(process.execPath, [path.join(plugin, "skills", "bass-html-report", "scripts", "render-report.cjs"), record, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const html = fs.readFileSync(output, "utf8");
    expect(html).toContain("Done &lt;safe&gt;");
    expect(html).toContain("@media(max-width:700px)");
  });
});
