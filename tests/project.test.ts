import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, doctor } from "../src/project/init.js";
import { loadConfig } from "../src/config/loader.js";
import { composeInstructions } from "../src/compose/composer.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { writeTask } from "./helpers.js";
import { BASS_VERSION } from "../src/version.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bass-init-"));
}

describe("bass init (shim 생성)", () => {
  it("bass.yaml 과 세 에이전트 shim 을 생성한다", () => {
    const root = tempDir();
    const result = initProject({
      projectRoot: root,
      name: "demo",
      profiles: ["common", "web"],
      owner: "user",
      withDesign: true,
    });
    expect(result.created).toContain("bass.yaml");
    expect(result.created).toContain("AGENTS.md");
    expect(result.created).toContain(".cursor/rules/bass.mdc");
    expect(result.created).toContain("CLAUDE.md");
    expect(result.created).toContain("DESIGN.md");

    // shim 은 얇아야 하고 마커를 가진다
    for (const shim of ["AGENTS.md", ".cursor/rules/bass.mdc", "CLAUDE.md"]) {
      const content = fs.readFileSync(path.join(root, shim), "utf8");
      expect(content).toContain("bass-shim");
      expect(content.split("\n").length).toBeLessThan(60);
    }

    // 생성된 bass.yaml 은 유효해야 한다
    const config = loadConfig({ projectRoot: root });
    expect(config.bassYaml.project.name).toBe("demo");
    expect(config.effective["design_profile"]).toBe(true);
    expect(config.bassYaml.bass.version).toBe(BASS_VERSION);
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain(`v${BASS_VERSION}`);
  });

  it("기존 파일은 --force 없이 건너뛴다", () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "AGENTS.md"), "custom", "utf8");
    const result = initProject({
      projectRoot: root,
      name: "demo",
      profiles: ["common"],
      owner: "user",
      withDesign: false,
    });
    expect(result.skipped).toContain("AGENTS.md");
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe("custom");
  });
});

describe("bass doctor", () => {
  it("정상 init 후 모든 검사 통과", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common", "web"], owner: "user", withDesign: true });
    const config = loadConfig({ projectRoot: root });
    const checks = doctor(root, config.effective);
    expect(checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("shim 누락과 마커 없는 파일을 감지한다", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    fs.rmSync(path.join(root, "CLAUDE.md"));
    fs.writeFileSync(path.join(root, "AGENTS.md"), "규칙 전문 복사본...", "utf8");
    const config = loadConfig({ projectRoot: root });
    const checks = doctor(root, config.effective);
    expect(checks.find((c) => c.id === "shim-claude")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "shim-agents")?.status).toBe("warn");
  });

  it("design_profile 활성인데 DESIGN.md 없으면 실패", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common", "web"], owner: "user", withDesign: false });
    const config = loadConfig({ projectRoot: root });
    const checks = doctor(root, config.effective);
    expect(checks.find((c) => c.id === "design-md")?.status).toBe("fail");
  });
});

describe("bass compose (지침 조합)", () => {
  it("base + role + profile + project + policy + task 를 출처 주석과 함께 조합한다", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common", "web"], owner: "user", withDesign: true });
    const taskPath = writeTask(root, "T-001", { riskReasons: ["touches-auth"] });
    const config = loadConfig({ projectRoot: root });
    const composed = composeInstructions({
      projectRoot: root,
      config,
      role: "worker",
      task: parseTaskFile(taskPath),
    });
    expect(composed).toContain("section: base behavior");
    expect(composed).toContain("section: role: worker");
    expect(composed).toContain("section: project-type profile");
    expect(composed).toContain("section: task: T-001");
    expect(composed).toContain("auth-and-permissions");
    expect(composed).toContain("DESIGN.md");
    // 출처 추적
    expect(composed).toContain("source:");
  });

  it("존재하지 않는 role 은 명확한 오류", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    const config = loadConfig({ projectRoot: root });
    expect(() => composeInstructions({ projectRoot: root, config, role: "nonexistent" })).toThrow(
      /Prompt part not found/,
    );
  });
});
