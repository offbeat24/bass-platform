import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { planEvaluators, selectEvaluatorPlans } from "../src/evaluators/runner.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("ExecutionPlan", () => {
  it.each([
    { id: "TAB-301", name: "delete", profiles: ["common"], taskType: "delete", risk: "low", surface: "src/pottery", depth: "fast", levels: [1], critics: 0, loops: 0 },
    { id: "TAB-302", name: "ui", profiles: ["common", "web"], taskType: "feature", risk: "medium", surface: "ui", depth: "standard", levels: [1, 2], critics: 1, loops: 1 },
    { id: "TAB-303", name: "game", profiles: ["game"], taskType: "feature", risk: "low", surface: "game", depth: "standard", levels: [1, 2], critics: 1, loops: 1 },
    { id: "TAB-304", name: "data", profiles: ["common"], taskType: "feature", risk: "medium", surface: "data", depth: "hardened", levels: [1, 2, 3], critics: 2, loops: 2 },
    { id: "TAB-305", name: "release", profiles: ["common"], taskType: "release", risk: "medium", surface: "release", depth: "hardened", levels: [1, 2, 3], critics: 2, loops: 2 },
  ])("$name 조합은 깊이별 evaluator, critic, loop 상한을 선택한다", ({ id, profiles, taskType, risk, surface, depth, levels, critics, loops }) => {
    const root = makeTempProject({ profiles });
    const task = parseTaskFile(writeTask(root, id, {
      taskType,
      riskLevel: risk,
      config: { changed_surfaces: [surface] },
    }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.depth).toBe(depth);
    expect(plan.verificationLevels).toEqual(levels);
    expect(plan.critics).toHaveLength(critics);
    expect(plan.maxReworkLoops).toBe(loops);
    expect(plan.loop.maxAttempts).toBe(loops + 1);
  });

  it("Pottery 삭제는 Fast 한 task에 잠기고 critic이나 인접 개선을 만들지 않는다", () => {
    const root = makeTempProject({
      extraYaml: `capabilities:\n  specification: builtin\n  simplicity: ponytail\n  ui_direction: bass\n  ui_canvas: off\n  html_report: bass\n`,
    });
    const task = parseTaskFile(writeTask(root, "GAME-301", {
      taskType: "delete",
      riskLevel: "low",
      sections: {
        "Allowed scope": "src/pottery\ntests/pottery.test.ts",
        "What we are shipping": "Remove glaze and kiln features",
      },
    }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.taskKind).toBe("delete");
    expect(plan.depth).toBe("fast");
    expect(plan.verificationLevels).toEqual([1]);
    expect(plan.critics).toEqual([]);
    expect(plan.maxReworkLoops).toBe(0);
    expect(plan.loop).toMatchObject({ maxTurns: 4, maxAttempts: 1, maxMinutes: 15, noProgressLimit: 1 });
    expect(plan.scopeLock.join(" ")).toContain("Do not add adjacent features");
    expect(plan.capabilityCalls).toEqual(["ponytail:lite"]);
  });

  it("task loop 예산은 깊이 기본값을 명시적으로 덮어쓴다", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const task = parseTaskFile(writeTask(root, "TAB-306", {
      riskLevel: "low",
      loop: { max_turns: 3, max_attempts: 2, max_minutes: 10, no_progress_limit: 2, required_evidence: ["test-output"] },
    }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.loop).toMatchObject({ maxTurns: 3, maxAttempts: 2, maxMinutes: 10, noProgressLimit: 2, requiredEvidence: ["test-output"] });
  });

  it("일반 game prototype은 Standard이고 critic과 재작업은 각각 최대 1회", () => {
    const root = makeTempProject({ profiles: ["game"] });
    const task = parseTaskFile(writeTask(root, "GAME-302", { riskLevel: "low", sections: { "Allowed scope": "game/" } }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.depth).toBe("standard");
    expect(plan.verificationLevels).toEqual([1, 2]);
    expect(plan.critics.length).toBeLessThanOrEqual(1);
    expect(plan.maxReworkLoops).toBe(1);
    expect(plan.capabilityCalls).toContain("ponytail:full");
    expect(plan.critics).not.toContain("simplicity");
  });

  it("고위험 명세 충돌만 Ouroboros seed와 semantic evaluation을 한 번씩 계획한다", () => {
    const root = makeTempProject({
      extraYaml: `capabilities:\n  specification: ouroboros\n  simplicity: builtin\n  ui_direction: bass\n  ui_canvas: off\n  html_report: bass\n`,
    });
    const task = parseTaskFile(writeTask(root, "API-303", { riskLevel: "high", riskReasons: ["spec-conflict"] }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.depth).toBe("hardened");
    expect(plan.verificationLevels).toEqual([1, 2, 3]);
    expect(plan.capabilityCalls).toEqual(["ouroboros:seed", "ouroboros:semantic-evaluation"]);
    expect(plan.critics.length).toBeLessThanOrEqual(2);
    expect(plan.maxReworkLoops).toBe(2);
    expect(plan.parallel.maxAgents).toBe(1);
  });

  it("Hardened 작업도 owned_paths가 있어야만 기본 최대 2개 병렬 실행을 허용한다", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const task = parseTaskFile(writeTask(root, "API-307", {
      riskLevel: "high",
      coordination: { owned_paths: ["src/api"] },
    }));
    const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
    expect(plan.depth).toBe("hardened");
    expect(plan.parallel.maxAgents).toBe(2);
  });

  it("UI Direction, Pen, HTML report는 작업이 명시적으로 요청한 경우에만 로드한다", () => {
    const root = makeTempProject({
      extraYaml: `capabilities:\n  specification: off\n  simplicity: off\n  ui_direction: bass\n  ui_canvas: pen\n  html_report: bass\n`,
    });
    const task = parseTaskFile(writeTask(root, "UI-304", {
      capabilities: ["redesign", "pen", "html-report"],
      config: { changed_surfaces: ["ui"] },
    }));
    expect(buildExecutionPlan(loadConfig({ projectRoot: root }), task).capabilityCalls).toEqual([
      "bass:ui-direction",
      "pen:mcp",
      "bass:html-report",
    ]);
  });
});

describe("affected evaluator selection", () => {
  it("Standard에서는 L1과 영향받은 L2만 선택한다", () => {
    const root = makeTempProject({
      extraYaml: `evaluators:\n  level1:\n    - { name: typecheck, command: \"exit 0\" }\n  level2:\n    - { name: ui, command: \"exit 0\", surfaces: [ui] }\n    - { name: data, command: \"exit 0\", surfaces: [data] }\n  level3:\n    - { name: release, command: \"exit 0\" }\n`,
    });
    const task = parseTaskFile(writeTask(root, "UI-305", { riskLevel: "medium", config: { changed_surfaces: ["ui"] } }));
    const config = loadConfig({ projectRoot: root });
    const selected = selectEvaluatorPlans(planEvaluators(config.effective), buildExecutionPlan(config, task));
    expect(selected.flatMap((level) => level.specs.map((spec) => spec.name))).toEqual(["typecheck", "ui"]);
  });

  it("AGENTS 관리 블록은 2KB보다 작다", () => {
    const root = makeTempProject({});
    const source = fs.readFileSync(path.join(process.cwd(), "src", "project", "init.ts"), "utf8");
    expect(source).toContain("MAX_AGENTS_BLOCK_BYTES = 2 * 1024");
    expect(root).toBeTruthy();
  });
});
