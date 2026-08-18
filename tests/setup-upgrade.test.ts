import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyAdapterAssignments, setupProject } from "../src/project/setup.js";
import { upgradeProject } from "../src/project/upgrade.js";
import { loadConfig } from "../src/config/loader.js";
import { inspectCapabilities, inspectProviders } from "../src/project/capabilities.js";
import { listTasks } from "../src/task/taskFile.js";
import { BASS_VERSION } from "../src/version.js";

function temp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "bass-03-")); }

function fakePlugin(home: string, host: "codex" | "claude", marketplace: string, plugin: string): void {
  const manifest = host === "codex" ? ".codex-plugin" : ".claude-plugin";
  const dir = path.join(home, `.${host}`, "plugins", "cache", marketplace, plugin, "1.0.0", manifest);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.json"), JSON.stringify({ name: plugin, version: "1.0.0" }), "utf8");
}

describe("bass setup", () => {
  it("외부 harness provider는 명시적 adapter assignment로만 선택한다", () => {
    expect(applyAdapterAssignments([
      "runner=prime-agent",
      "context_provider=graft",
      "workspace_executor=omc",
      "collaboration_provider=buzz",
    ])).toMatchObject({
      runner: "prime-agent",
      context_provider: "graft",
      workspace_executor: "omc",
      collaboration_provider: "buzz",
    });
    expect(() => applyAdapterAssignments(["runner=unknown"])).toThrow(/Invalid adapter/);
  });

  it("Python 저장소를 보존하고 package.json 없이 연결한다", () => {
    const root = temp();
    fs.writeFileSync(path.join(root, "pyproject.toml"), "[project]\nname='demo'\n", "utf8");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Team rules\n\nKeep Python 3.12.\n", "utf8");
    const result = setupProject({
      projectRoot: root,
      name: "python-demo",
      adapters: { primary: "codex", compatibility: [] },
      capabilities: { specification: "builtin", simplicity: "builtin", ui_direction: "off", ui_canvas: "off", html_report: "off" },
    });
    expect(result.mode).toBe("init");
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "pyproject.toml"), "utf8")).toContain("python-demo".replace("python-demo", "demo"));
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("Keep Python 3.12");
    expect(agents.split("bass:managed:start")).toHaveLength(2);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".cursor", "rules", "bass.mdc"))).toBe(false);
  });

  it("빈 폴더 create와 기존 폴더 init을 같은 API로 처리한다", () => {
    const root = path.join(temp(), "new-project");
    expect(setupProject({ projectRoot: root }).mode).toBe("create");
    expect(fs.existsSync(path.join(root, "bass.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".bass", "tasks"))).toBe(true);
    const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(gitignore).toContain(".bass/local.yaml");
    expect(gitignore).toContain("!.bass/evidence/**/*.log");
    const repeated = setupProject({ projectRoot: root });
    expect(repeated.initialized.created).toEqual([]);
    expect(repeated.initialized.updated).toEqual([]);
    expect(repeated.initialized.conflicts).toEqual([]);
  });

  it("구버전 bass.yaml은 setup에서 덮지 않고 upgrade 대상으로 중지한다", () => {
    const root = temp();
    const legacy = "bass:\n  version: 0.2.1\n  profiles: [common]\nproject:\n  name: legacy\n";
    fs.writeFileSync(path.join(root, "bass.yaml"), legacy, "utf8");
    const result = setupProject({ projectRoot: root });
    expect(result.initialized.conflicts).toContain("bass.yaml");
    expect(fs.readFileSync(path.join(root, "bass.yaml"), "utf8")).toBe(legacy);
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(false);
  });
});

describe("legacy upgrade", () => {
  function fixture(): string {
    const root = temp();
    fs.writeFileSync(path.join(root, "bass.yaml"), `bass:\n  version: 0.2.1\n  profiles: [common]\nproject:\n  name: legacy\n`, "utf8");
    fs.writeFileSync(path.join(root, "AGENTS.md"), "# Team-owned rule\n\nNever rewrite this.\n", "utf8");
    fs.mkdirSync(path.join(root, "tasks"));
    fs.writeFileSync(path.join(root, "tasks", "OLD-1.md"), `---\nid: OLD-1\ntitle: Legacy\nstatus: IMPLEMENTING\ntype: fix\nrisk: { level: low, reasons: [] }\nhuman: { owner: user, reviewer_required: true }\n---\n\n## Problem\nlegacy\n`, "utf8");
    return root;
  }

  it("--check는 읽기 전용이고 --apply는 사용자 파일과 이전 task를 보존하며 멱등이다", () => {
    const root = fixture();
    const beforeYaml = fs.readFileSync(path.join(root, "bass.yaml"), "utf8");
    const check = upgradeProject(root, false);
    expect(check.applied).toBe(false);
    expect(fs.readFileSync(path.join(root, "bass.yaml"), "utf8")).toBe(beforeYaml);
    upgradeProject(root, true);
    expect(loadConfig({ projectRoot: root }).bassYaml.bass.version).toBe(BASS_VERSION);
    expect(loadConfig({ projectRoot: root }).bassYaml.context.max_chars).toBe(12_000);
    for (const artifact of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
      expect(fs.existsSync(path.join(root, artifact))).toBe(true);
    }
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("Never rewrite this");
    expect(listTasks(root)[0]?.frontmatter.status).toBe("ACTIVE");
    const after = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const repeated = upgradeProject(root, true);
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe(after);
    expect(repeated.changes).toEqual([]);
  });

  it("0.3 설정을 보존하면서 최신 loop와 provider 기본값만 보강한다", () => {
    const root = temp();
    fs.writeFileSync(path.join(root, "bass.yaml"), `bass:\n  version: 0.3.0\n  profiles: [common]\nproject:\n  name: v03\nexecution:\n  depth: fast\n  verification: all\nadapters:\n  primary: claude\n  compatibility: [codex]\n`, "utf8");
    upgradeProject(root, true);
    const config = loadConfig({ projectRoot: root }).bassYaml;
    expect(config.execution).toMatchObject({
      depth: "fast",
      verification: "all",
      loop: { no_progress_limit: 1 },
      parallel: { max_agents: 2 },
    });
    expect(config.adapters).toMatchObject({
      primary: "claude",
      compatibility: ["codex"],
      runner: "host",
      context_provider: "bass",
      workspace_executor: "host",
      collaboration_provider: "events",
    });
  });
});

describe("capability doctor states", () => {
  it("actual plugin, builtin, off, missing, unauthenticated를 구분한다", () => {
    const root = temp();
    setupProject({
      projectRoot: root,
      capabilities: { specification: "ouroboros", simplicity: "ponytail", ui_direction: "bass", ui_canvas: "pen", html_report: "off" },
    });
    const config = loadConfig({ projectRoot: root }).bassYaml;
    const fakeHome = temp();
    fakePlugin(fakeHome, "codex", "test-market", "ponytail");
    fakePlugin(fakeHome, "codex", "test-market", "pen");
    const states = inspectCapabilities(config, { homeDir: fakeHome, commandAvailable: () => false, active: new Set(["ponytail"]), authenticated: new Set() });
    expect(states.find((item) => item.selected === "ouroboros")?.state).toBe("missing");
    expect(states.find((item) => item.selected === "ponytail")?.state).toBe("actual-plugin");
    expect(states.find((item) => item.selected === "bass")?.state).toBe("builtin");
    expect(states.find((item) => item.selected === "pen")?.state).toBe("unauthenticated");
    expect(states.find((item) => item.selected === "off")?.state).toBe("off");
  });

  it("Prime Agent와 workspace/collaboration provider의 실제 설치·활성을 따로 검사한다", () => {
    const root = temp();
    setupProject({
      projectRoot: root,
      adapters: applyAdapterAssignments([
        "runner=prime-agent",
        "context_provider=graft",
        "workspace_executor=omc",
        "collaboration_provider=buzz",
      ]),
      capabilities: { specification: "builtin", simplicity: "builtin", ui_direction: "off", ui_canvas: "off", html_report: "off" },
    });
    const config = loadConfig({ projectRoot: root }).bassYaml;
    const installed = new Set(["prime-agent", "graft", "omc"]);
    const states = inspectProviders(config, {
      host: "claude",
      commandAvailable: (command) => installed.has(command),
      active: new Set(["prime-agent", "omc"]),
    });
    expect(states.find((item) => item.capability === "runner")).toMatchObject({ state: "actual-plugin", sessionActive: true });
    expect(states.find((item) => item.capability === "context_provider")).toMatchObject({ state: "actual-plugin", sessionActive: false });
    expect(states.find((item) => item.capability === "workspace_executor")).toMatchObject({ state: "actual-plugin", sessionActive: true });
    expect(states.find((item) => item.capability === "collaboration_provider")?.state).toBe("missing");
  });

  it("호스트 캐시를 분리하고 지원하지 않는 provider를 대체하지 않는다", () => {
    const root = temp();
    setupProject({
      projectRoot: root,
      adapters: applyAdapterAssignments(["workspace_executor=omc"]),
      capabilities: { specification: "builtin", simplicity: "ponytail", ui_direction: "off", ui_canvas: "off", html_report: "off" },
    });
    const config = loadConfig({ projectRoot: root }).bassYaml;
    const fakeHome = temp();
    fakePlugin(fakeHome, "codex", "test-market", "ponytail");
    fakePlugin(fakeHome, "claude", "test-market", "oh-my-claudecode");
    const common = { homeDir: fakeHome, commandAvailable: () => false, active: new Set(["ponytail", "omc"]) };

    const codex = inspectProviders(config, { ...common, host: "codex" });
    const claude = inspectProviders(config, { ...common, host: "claude" });
    expect(codex.find((item) => item.selected === "ponytail")).toMatchObject({ host: "codex", state: "actual-plugin" });
    expect(claude.find((item) => item.selected === "ponytail")).toMatchObject({ host: "claude", state: "missing" });
    expect(codex.find((item) => item.selected === "omc")).toMatchObject({ host: "codex", state: "unsupported" });
    expect(claude.find((item) => item.selected === "omc")).toMatchObject({ host: "claude", state: "actual-plugin" });
  });
});
