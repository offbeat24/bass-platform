import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composeInstructions } from "../src/compose/composer.js";
import { selectTaskContext } from "../src/compose/context.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("selective task context", () => {
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
