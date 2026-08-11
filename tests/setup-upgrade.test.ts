import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setupProject } from "../src/project/setup.js";
import { upgradeProject } from "../src/project/upgrade.js";
import { loadConfig } from "../src/config/loader.js";
import { inspectCapabilities } from "../src/project/capabilities.js";
import { listTasks } from "../src/task/taskFile.js";
import { BASS_VERSION } from "../src/version.js";

function temp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "bass-03-")); }

describe("bass setup", () => {
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
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(".bass/local.yaml");
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

describe("0.2 upgrade", () => {
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
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("Never rewrite this");
    expect(listTasks(root)[0]?.frontmatter.status).toBe("ACTIVE");
    const after = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    upgradeProject(root, true);
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe(after);
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
    fs.mkdirSync(path.join(fakeHome, ".codex", "plugins", "cache", "ponytail"), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, ".codex", "plugins", "cache", "pen"), { recursive: true });
    const states = inspectCapabilities(config, { homeDir: fakeHome, commandAvailable: () => false, active: new Set(["ponytail"]), authenticated: new Set() });
    expect(states.find((item) => item.selected === "ouroboros")?.state).toBe("missing");
    expect(states.find((item) => item.selected === "ponytail")?.state).toBe("actual-plugin");
    expect(states.find((item) => item.selected === "bass")?.state).toBe("builtin");
    expect(states.find((item) => item.selected === "pen")?.state).toBe("unauthenticated");
    expect(states.find((item) => item.selected === "off")?.state).toBe("off");
  });
});
