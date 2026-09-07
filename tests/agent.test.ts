import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentGuide } from "../src/agent/guide.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";
import { recordRiskApproval } from "../src/task/approvalRecord.js";

describe("agent guide", () => {
  it.each(["common", "cli", "server", "web", "game", "nan2026"])("%s read-only tasks do not acquire implementation or design work", (profile) => {
    const root = makeTempProject({ profiles: [profile] });
    const task = parseTaskFile(writeTask(root, "GUIDE-1", { taskType: "explore", config: { changed_surfaces: ["docs"] } }));
    const guide = buildAgentGuide(root, loadConfig({ projectRoot: root }), task);
    expect(guide.task?.suggested_next_actions).toEqual(["Inspect the requested evidence and report findings; do not start implementation or finalize a task for a read-only request."]);
    expect(fs.existsSync(path.join(root, ".bass", "events.jsonl"))).toBe(false);
  });

  it("web non-UI work does not require filling DESIGN.md; UI work still does", () => {
    for (const profile of ["common", "web"]) {
      const root = makeTempProject({ profiles: [profile] });
      const config = loadConfig({ projectRoot: root });
      const docs = parseTaskFile(writeTask(root, "GUIDE-2", { config: { changed_surfaces: ["docs"] } }));
      const ui = parseTaskFile(writeTask(root, "GUIDE-3", { config: { changed_surfaces: ["ui"] } }));
      expect(buildAgentGuide(root, config, docs).task?.suggested_next_actions.join(" ")).not.toContain("DESIGN.md");
      const uiGuide = buildAgentGuide(root, config, ui);
      expect(uiGuide.project.design_spec).toBe("missing");
      expect(uiGuide.task?.suggested_next_actions.join(" ")).toContain("Create DESIGN.md");
    }
  });

  it.each(["pending", "approved", "rejected"] as const)("guide honors %s approvals rather than restarting the same decision", (decision) => {
    const root = makeTempProject({ profiles: ["server"] });
    const task = parseTaskFile(writeTask(root, "GUIDE-4", { riskReasons: ["touches-auth"] }));
    if (decision !== "pending") recordRiskApproval({ projectRoot: root, taskId: "GUIDE-4", ruleId: "auth-and-permissions", decision, approver: "user", reason: "Explicit test decision" });
    const guide = buildAgentGuide(root, loadConfig({ projectRoot: root }), task);
    const actions = guide.task!.suggested_next_actions.join(" ");
    if (decision === "pending") expect(guide.task!.unresolved_human_decisions).toEqual(["auth-and-permissions"]);
    else {
      expect(guide.task!.unresolved_human_decisions).toEqual([]);
      expect(actions).not.toContain("Present one decision packet");
      if (decision === "approved") expect(actions).toContain("move to ACTIVE");
      else {
        expect(actions).toContain("Do not proceed with rejected policy actions: auth-and-permissions");
        expect(actions).not.toContain("move to ACTIVE");
      }
    }
  });

  it("자연어 사용자 계약과 위험 비례 실행 깊이를 제공", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const task = parseTaskFile(writeTask(root, "T-300", { riskLevel: "low" }));
    const guide = buildAgentGuide(root, loadConfig({ projectRoot: root }), task);
    expect(guide.contract.user_interface).toBe("natural-language");
    expect(guide.contract.cli_operator).toBe("ai-agent");
    expect(guide.task?.workflow_depth).toBe("fast");
    expect(guide.execution_plan.depth).toBe("fast");
    expect(guide.execution_plan.verificationLevels).toEqual([1]);
    expect(guide.execution_plan.maxReworkLoops).toBe(0);
    expect(guide.execution_plan.loop.maxAttempts).toBe(1);
    expect(guide.operating_rules.join(" ")).toContain("never ask the user to run commands");
    expect(guide.operating_rules.join(" ")).toContain("avoid a second source of truth");
    expect(guide.operating_rules.join(" ")).toContain("task attempt start/finish");
    expect(guide.operating_rules.join(" ")).toContain("repeated failure without new evidence");
  });

  it("빈 DESIGN.md 템플릿을 준비 완료로 오인하지 않는다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    fs.writeFileSync(
      path.join(root, "DESIGN.md"),
      "# Product design identity\n\n## Purpose\n\n<!-- fill this -->\n\n## Interaction states\n",
      "utf8",
    );
    const guide = buildAgentGuide(root, loadConfig({ projectRoot: root }));
    expect(guide.project.design_spec).toBe("template");
  });
});
