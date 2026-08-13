import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initProject, doctor } from "../src/project/init.js";
import { createProject } from "../src/project/create.js";
import { loadConfig } from "../src/config/loader.js";
import { composeInstructions } from "../src/compose/composer.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { writeTask } from "./helpers.js";
import { BASS_VERSION } from "../src/version.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bass-init-"));
}

describe("bass create (새 프로젝트 자동 연결)", () => {
  it("새 폴더를 만들면서 BASS 설정을 자동 초기화한다", () => {
    const parent = tempDir();
    const projectRoot = path.join(parent, "new-project");
    const result = createProject({
      destination: projectRoot,
      name: "new-project",
      profiles: ["common", "web"],
      owner: "user",
      withDesign: true,
      install: false,
    });

    expect(result.projectRoot).toBe(projectRoot);
    expect(result.packageInstalled).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "bass.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "PRODUCT.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "TECH.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "DESIGN.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, ".bass", "events.jsonl"))).toBe(true);
  });

  it("내용이 있는 폴더는 보존하고 bass init 사용을 안내한다", () => {
    const projectRoot = tempDir();
    fs.writeFileSync(path.join(projectRoot, "keep.txt"), "keep", "utf8");

    expect(() =>
      createProject({
        destination: projectRoot,
        name: "existing",
        profiles: ["common"],
        owner: "user",
        withDesign: false,
        install: false,
      }),
    ).toThrow(/Use `bass setup`/);
    expect(fs.readFileSync(path.join(projectRoot, "keep.txt"), "utf8")).toBe("keep");
  });
});

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
    expect(result.created).toContain("PRODUCT.md");
    expect(result.created).toContain("TECH.md");
    expect(result.created).toContain("DESIGN.md");

    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("bass:managed:start");
    expect(Buffer.byteLength(agents, "utf8")).toBeLessThan(2048);

    // 생성된 bass.yaml 은 유효해야 한다
    const config = loadConfig({ projectRoot: root });
    expect(config.bassYaml.project.name).toBe("demo");
    expect(config.effective["design_profile"]).toBe(true);
    expect(config.bassYaml.bass.version).toBe(BASS_VERSION);
    expect(config.bassYaml.adapters).toMatchObject({
      runner: "host",
      context_provider: "bass",
      workspace_executor: "host",
      collaboration_provider: "events",
    });
    expect(agents).toContain(BASS_VERSION);
    expect(agents).toContain("smallest accepted change");
  });

  it("기존 AGENTS.md는 보존하고 관리 블록만 추가한다", () => {
    const root = tempDir();
    fs.writeFileSync(path.join(root, "AGENTS.md"), "custom", "utf8");
    const result = initProject({
      projectRoot: root,
      name: "demo",
      profiles: ["common"],
      owner: "user",
      withDesign: false,
    });
    expect(result.updated).toContain("AGENTS.md");
    const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    expect(agents).toContain("custom");
    expect(agents).toContain("bass:managed:start");
  });

  it("기존 제품·기술·디자인 명세는 덮어쓰지 않는다", () => {
    const root = tempDir();
    for (const relative of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
      fs.writeFileSync(path.join(root, relative), `${relative} custom`, "utf8");
    }
    const result = initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    expect(result.skipped).toEqual(expect.arrayContaining(["PRODUCT.md", "TECH.md", "DESIGN.md"]));
    for (const relative of ["PRODUCT.md", "TECH.md", "DESIGN.md"]) {
      expect(fs.readFileSync(path.join(root, relative), "utf8")).toBe(`${relative} custom`);
    }
  });

  it("기존 Claude/Cursor 지침도 보존하고 BASS 관리 블록만 추가한다", () => {
    const root = tempDir();
    fs.mkdirSync(path.join(root, ".cursor", "rules"), { recursive: true });
    fs.writeFileSync(path.join(root, "CLAUDE.md"), "# Team Claude rule\n", "utf8");
    fs.writeFileSync(path.join(root, ".cursor", "rules", "bass.mdc"), "---\nalwaysApply: true\n---\n\nTeam Cursor rule\n", "utf8");
    initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toContain("Team Claude rule");
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toContain("bass:managed:start");
    expect(fs.readFileSync(path.join(root, ".cursor", "rules", "bass.mdc"), "utf8")).toContain("Team Cursor rule");
    expect(fs.readFileSync(path.join(root, ".cursor", "rules", "bass.mdc"), "utf8")).toContain("bass:managed:start");
  });

  it("깨진 관리 marker는 사용자 파일을 덮지 않고 conflict로 중지한다", () => {
    const root = tempDir();
    const original = "# Team rule\n\n<!-- bass:managed:start -->\nunfinished\n";
    fs.writeFileSync(path.join(root, "AGENTS.md"), original, "utf8");
    const result = initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    expect(result.conflicts).toContain("AGENTS.md");
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toBe(original);
    expect(fs.existsSync(path.join(root, "bass.yaml"))).toBe(false);
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
    expect(checks.find((c) => c.id === "adapter-claude")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "agents-managed-block")?.status).toBe("fail");
  });

  it("design_profile 활성인데 DESIGN.md 없으면 실패", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common", "web"], owner: "user", withDesign: false });
    fs.rmSync(path.join(root, "DESIGN.md"));
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
    expect(composed).toContain("Call an external provider only when `capabilityCalls` names it");
    expect(composed).toContain("Ponytail은 승인된 범위에만 적용한다");
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

  it("Ouroboros 상세 규칙은 discovery 역할에만 필요할 때 조합한다", () => {
    const root = tempDir();
    initProject({ projectRoot: root, name: "demo", profiles: ["common"], owner: "user", withDesign: false });
    const config = loadConfig({ projectRoot: root });
    const discovery = composeInstructions({ projectRoot: root, config, role: "discovery" });
    const worker = composeInstructions({ projectRoot: root, config, role: "worker" });
    expect(discovery).toContain("Ouroboros interview/seed");
    expect(worker).not.toContain("Ouroboros interview/seed");
  });
});
