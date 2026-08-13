import { describe, expect, it } from "vitest";
import { parseTaskFile } from "../src/task/taskFile.js";
import { buildTaskGraph } from "../src/task/taskGraph.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("task graph", () => {
  it("완료된 의존성 다음 작업만 ready로 표시한다", () => {
    const root = makeTempProject({});
    const a = parseTaskFile(writeTask(root, "GRAPH-101", { status: "DONE", coordination: { owned_paths: ["src/a"] } }));
    const b = parseTaskFile(writeTask(root, "GRAPH-102", { coordination: { depends_on: ["GRAPH-101"], owned_paths: ["src/b"] } }));
    const c = parseTaskFile(writeTask(root, "GRAPH-103", { coordination: { depends_on: ["GRAPH-102"], owned_paths: ["src/c"] } }));
    const graph = buildTaskGraph([a, b, c]);
    expect(graph.valid).toBe(true);
    expect(graph.ready).toEqual(["GRAPH-102"]);
    expect(graph.nodes.find((node) => node.id === "GRAPH-103")?.blockedBy).toEqual(["GRAPH-102"]);
  });

  it("없는 dependency와 parent를 오류로 표시한다", () => {
    const root = makeTempProject({});
    const task = parseTaskFile(writeTask(root, "GRAPH-104", {
      coordination: { parent_task: "GRAPH-999", depends_on: ["GRAPH-998"] },
    }));
    const graph = buildTaskGraph([task]);
    expect(graph.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(["missing-dependency", "missing-parent"]));
    expect(graph.ready).toEqual([]);
  });

  it("순환 의존성을 차단한다", () => {
    const root = makeTempProject({});
    const a = parseTaskFile(writeTask(root, "GRAPH-105", { coordination: { depends_on: ["GRAPH-106"] } }));
    const b = parseTaskFile(writeTask(root, "GRAPH-106", { coordination: { depends_on: ["GRAPH-105"] } }));
    const graph = buildTaskGraph([a, b]);
    expect(graph.issues.some((issue) => issue.kind === "cycle")).toBe(true);
    expect(graph.ready).toEqual([]);
  });

  it("독립 작업의 겹친 owned path는 차단하고 명시적 의존성은 허용한다", () => {
    const root = makeTempProject({});
    const a = parseTaskFile(writeTask(root, "GRAPH-107", { coordination: { owned_paths: ["src/app"] } }));
    const conflicting = parseTaskFile(writeTask(root, "GRAPH-108", { coordination: { owned_paths: ["src/app/ui"] } }));
    expect(buildTaskGraph([a, conflicting]).issues.some((issue) => issue.kind === "path-conflict")).toBe(true);

    const ordered = parseTaskFile(writeTask(root, "GRAPH-109", {
      coordination: { depends_on: ["GRAPH-107"], owned_paths: ["src/app/ui"] },
    }));
    expect(buildTaskGraph([a, ordered]).issues.some((issue) => issue.kind === "path-conflict")).toBe(false);
  });
});
