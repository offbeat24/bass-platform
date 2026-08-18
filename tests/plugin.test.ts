import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { BASS_VERSION } from "../src/version.js";

const root = path.resolve(import.meta.dirname, "..");
const plugin = path.join(root, "plugins", "bass");

describe("team plugin", () => {
  it("CLI, Codex plugin, Claude plugin, 두 marketplace 버전이 0.5.0으로 일치한다", () => {
    const codex = JSON.parse(fs.readFileSync(path.join(plugin, ".codex-plugin", "plugin.json"), "utf8"));
    const claude = JSON.parse(fs.readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8"));
    const claudeMarket = JSON.parse(fs.readFileSync(path.join(root, ".claude-plugin", "marketplace.json"), "utf8"));
    const codexMarket = JSON.parse(fs.readFileSync(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
    expect(codex.version).toBe(BASS_VERSION);
    expect(claude.version).toBe(BASS_VERSION);
    expect(codex.skills).toBe(claude.skills);
    expect(codex.hooks).toBe("./hooks/hooks.json");
    expect(claude).not.toHaveProperty("hooks");
    expect(claudeMarket.plugins[0].version).toBe(BASS_VERSION);
    expect(codexMarket.version).toBe(BASS_VERSION);
    expect(codexMarket.plugins[0].version).toBe(BASS_VERSION);
    expect(codexMarket.plugins[0].source.path).toBe("./plugins/bass");
  });

  it("SessionStart 컨텍스트는 600자 미만이다", () => {
    const hook = path.join(plugin, "hooks", "session-start.cjs");
    const result = spawnSync(process.execPath, [hook], { encoding: "utf8", env: { ...process.env, PLUGIN_DATA: os.tmpdir() } });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.additionalContext.length).toBeLessThanOrEqual(600);
    const plainEnv = { ...process.env };
    delete plainEnv["PLUGIN_DATA"];
    const plain = spawnSync(process.execPath, [hook], { encoding: "utf8", env: plainEnv });
    expect(output.hookSpecificOutput.additionalContext).toBe(plain.stdout);
  });

  it("PostToolUse는 Bash를 포함해 변경 도구를 같은 scope 훅으로 검사한다", () => {
    const hooks = JSON.parse(fs.readFileSync(path.join(plugin, "hooks", "hooks.json"), "utf8"));
    expect(hooks.hooks.PostToolUse[0].matcher.split("|")).toContain("Bash");
  });

  it("launcher는 Codex cachebuster metadata를 npm package 버전에서 제외한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bass-launcher-"));
    const scripts = path.join(dir, "scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.mkdirSync(path.join(dir, ".codex-plugin"));
    fs.copyFileSync(path.join(plugin, "scripts", "bass-launcher.cjs"), path.join(scripts, "bass-launcher.cjs"));
    fs.writeFileSync(path.join(dir, ".codex-plugin", "plugin.json"), JSON.stringify({ version: "0.5.0+codex.test" }), "utf8");
    const fakeNpm = path.join(dir, "fake-npm.cjs");
    fs.writeFileSync(fakeNpm, "console.log(JSON.stringify(process.argv.slice(2)));\n", "utf8");

    const result = spawnSync(process.execPath, [path.join(scripts, "bass-launcher.cjs"), "setup", dir], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, npm_execpath: fakeNpm },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toContain("--package=@offbeat24/bass@0.5.0");
  });

  it("같은 diff의 scope 위반은 한 번만 경고한다", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "bass-hook-"));
    fs.writeFileSync(path.join(project, "bass.yaml"), `bass:\n  version: ${BASS_VERSION}\n`, "utf8");
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
    expect(fs.readdirSync(path.join(project, ".bass", "cache"))).toEqual(["scope-warning.txt"]);
  });

  it("HTML report는 run record에서 고정 asset으로 생성한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bass-report-"));
    const record = path.join(dir, "record.json");
    const output = path.join(dir, "report.html");
    fs.writeFileSync(record, JSON.stringify({ task_id: "R-1", summary_of_changes: "Done <safe>", why: "Needed", files_changed: ["src/a.ts"], verification: { evaluations_run: [{ name: "test", level: 1, status: "pass" }] }, known_limitations: [] }), "utf8");
    const result = spawnSync(process.execPath, [path.join(plugin, "skills", "bass-html-report", "scripts", "render-report.cjs"), record, output], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const html = fs.readFileSync(output, "utf8");
    const secondOutput = path.join(dir, "report-second.html");
    expect(spawnSync(process.execPath, [path.join(plugin, "skills", "bass-html-report", "scripts", "render-report.cjs"), record, secondOutput], { encoding: "utf8" }).status).toBe(0);
    expect(fs.readFileSync(secondOutput)).toEqual(fs.readFileSync(output));
    expect(html).toContain("Done &lt;safe&gt;");
    expect(html).toContain("@media(max-width:700px)");
  });
});
