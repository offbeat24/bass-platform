import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeInstructions } from "../src/compose/composer.js";
import { selectTaskContext } from "../src/compose/context.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { recordRiskApproval } from "../src/task/approvalRecord.js";

describe("task-scoped instruction composition", () => {
  it.each(["common", "cli", "server", "web", "game", "nan2026"])("%s routes discovery checklists and critics by role and plan", (profile) => {
    const root = makeTempProject({ profiles: [profile] });
    const task = parseTaskFile(writeTask(root, "ROUTE-1", { config: { changed_surfaces: ["docs"] } }));
    const config = loadConfig({ projectRoot: root });
    const plan = buildExecutionPlan(config, task);
    for (const role of ["worker", "evaluator"]) {
      const composed = composeInstructions({ projectRoot: root, config, task, role });
      expect(composed).not.toContain("discovery checklist:");
      expect(composed).not.toContain("configured critics:");
      expect(composed).toContain(`planned critics: ${plan.critics.join(", ") || "none"}`);
      expect(composed).not.toContain("Before UI implementation");
    }
    const discovery = composeInstructions({ projectRoot: root, config, role: "discovery" });
    expect(discovery).toContain("discovery checklist:");
    for (const item of config.effective["discovery_checklist"] as string[]) expect(discovery).toContain(item);
    expect(discovery).not.toContain("planned critics:");
    if (profile === "server") expect(discovery).not.toContain("반응형과 접근성 구현 수준");
    if (profile === "cli") expect(discovery).not.toContain("API 계약과 버전 정책");
  });

  it("UI work and explicit design reviews retain design context even outside the web profile", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const config = loadConfig({ projectRoot: root });
    const task = parseTaskFile(writeTask(root, "ROUTE-2", { config: { changed_surfaces: ["ui"] } }));
    expect(composeInstructions({ projectRoot: root, config, task, role: "worker" })).toContain("Before UI implementation");
    fs.writeFileSync(path.join(root, "DESIGN.md"), "# Design\n\n## Purpose\n\nReadable\n");
    expect(composeInstructions({ projectRoot: root, config, task, role: "worker" })).toContain("Use the relevant DESIGN.md sections");
    expect(composeInstructions({ projectRoot: root, config, critic: "design" })).toContain("Use the relevant DESIGN.md sections");
  });

  it.each(["pending", "approved", "rejected"] as const)("composed approval guidance honors %s policy state", (decision) => {
    const root = makeTempProject({ profiles: ["server"] });
    const task = parseTaskFile(writeTask(root, "ROUTE-3", { riskReasons: ["touches-auth"] }));
    if (decision !== "pending") recordRiskApproval({ projectRoot: root, taskId: "ROUTE-3", ruleId: "auth-and-permissions", decision, approver: "user", reason: "Explicit test decision" });
    const composed = composeInstructions({ projectRoot: root, config: loadConfig({ projectRoot: root }), task, role: "worker" });
    expect(composed).toContain(`auth-and-permissions: ${decision};`);
    if (decision === "approved") {
      expect(composed).toContain("approved; do not ask again");
      expect(composed).not.toContain("pending; obtain");
    }
    if (decision === "rejected") expect(composed).toContain("rejected; do not proceed");
  });
});

describe("selective task context", () => {
  it("web profile alone does not load DESIGN; explicit context and inferred UI scope still do", () => {
    const root = projectWithDocs();
    const select = (task: ReturnType<typeof parseTaskFile>) => selectTaskContext({ projectRoot: root, task, profiles: ["web"], maxChars: 12_000 });
    const docs = parseTaskFile(writeTask(root, "CTX-105", { sections: { "Allowed scope": "docs/" }, config: { changed_surfaces: ["docs"] } }));
    expect(select(docs).loaded.some((item) => item.source === "DESIGN.md")).toBe(false);
    const explicit = parseTaskFile(writeTask(root, "CTX-106", { sections: { "Allowed scope": "docs/", "Relevant context": "DESIGN.md#Purpose" } }));
    expect(select(explicit).loaded.find((item) => item.source === "DESIGN.md")?.origin).toBe("explicit");
    const ui = parseTaskFile(writeTask(root, "CTX-107", { sections: { "Allowed scope": "src/components/" } }));
    expect(select(ui).loaded.some((item) => item.source === "DESIGN.md" && item.origin === "automatic")).toBe(true);
  });

  it("명시한 heading과 작업 표면에 관련된 루트 명세만 선택한다", () => {
    const root = projectWithDocs();
    fs.writeFileSync(path.join(root, "README.md"), "# Readme\n\n## Run\n\nnpm test\n\n## Deploy\n\nmanual\n", "utf8");
    const task = parseTaskFile(writeTask(root, "CTX-101", {
      config: { changed_surfaces: ["ui"] },
      sections: { "Relevant context": "- README.md#Run" },
    }));
    const selected = selectTaskContext({ projectRoot: root, task, profiles: ["common", "web"], maxChars: 12_000 });
    expect(selected.loaded.map((item) => `${item.source}#${item.selector ?? ""}`)).toEqual([
      "README.md#Run",
      "PRODUCT.md#Product intent",
      "TECH.md#Stack",
      "TECH.md#Architecture",
      "DESIGN.md#Purpose",
      "DESIGN.md#Design principles",
    ]);
    expect(selected.loaded[0]!.content).toContain("npm test");
    expect(selected.loaded[0]!.content).not.toContain("manual");
    expect(selected.loaded.every((item) => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);
  });

  it("프로젝트 밖 경로와 비밀 파일을 로드하지 않는다", () => {
    const root = projectWithDocs();
    fs.writeFileSync(path.join(root, ".env"), "API_KEY=do-not-leak", "utf8");
    const task = parseTaskFile(writeTask(root, "CTX-102", {
      sections: { "Relevant context": "- ../outside.md\n- .env" },
    }));
    const selected = selectTaskContext({ projectRoot: root, task, profiles: ["common"], maxChars: 12_000 });
    expect(selected.omitted).toEqual(expect.arrayContaining([
      { source: "../outside.md", reason: "path is outside project root" },
      { source: ".env", reason: "sensitive files are never loaded automatically" },
    ]));
    expect(JSON.stringify(selected)).not.toContain("do-not-leak");
  });

  it("예산을 넘는 파일은 자르지 않고 생략 이유를 남긴다", () => {
    const root = projectWithDocs();
    fs.writeFileSync(path.join(root, "BIG.md"), "x".repeat(100), "utf8");
    const task = parseTaskFile(writeTask(root, "CTX-103", { sections: { "Relevant context": "BIG.md" } }));
    const selected = selectTaskContext({ projectRoot: root, task, profiles: ["common"], maxChars: 20 });
    expect(selected.totalChars).toBeLessThanOrEqual(20);
    expect(selected.loaded.every((item) => item.source !== "BIG.md")).toBe(true);
    expect(selected.omitted.some((item) => item.source === "BIG.md" && item.reason.includes("budget"))).toBe(true);
  });

  it("compose는 선택 내용과 checksum·생략 목록을 출처와 함께 출력한다", () => {
    const root = projectWithDocs();
    fs.writeFileSync(path.join(root, "README.md"), "# Readme\n\n## Run\n\nnpm test\n", "utf8");
    const taskPath = writeTask(root, "CTX-104", { sections: { "Relevant context": "README.md#Run" } });
    const composed = composeInstructions({
      projectRoot: root,
      config: loadConfig({ projectRoot: root }),
      role: "worker",
      task: parseTaskFile(taskPath),
    });
    expect(composed).toContain("section: context: README.md#Run");
    expect(composed).toContain("section: context manifest");
    expect(composed).toMatch(/sha256:[a-f0-9]{64}/);
    expect(composed.length).toBeLessThan(6_000);
  });
});

function projectWithDocs(): string {
  const root = makeTempProject({ profiles: ["common"] });
  fs.writeFileSync(path.join(root, "PRODUCT.md"), "# Product\n\n## Product intent\n\nIntent\n", "utf8");
  fs.writeFileSync(path.join(root, "TECH.md"), "# Tech\n\n## Stack\n\nTypeScript\n\n## Architecture\n\nCLI\n", "utf8");
  fs.writeFileSync(path.join(root, "DESIGN.md"), "# Design\n\n## Purpose\n\nClear\n\n## Design principles\n\nSimple\n", "utf8");
  return root;
}
