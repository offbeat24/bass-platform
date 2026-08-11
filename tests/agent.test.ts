import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentGuide } from "../src/agent/guide.js";
import { loadConfig } from "../src/config/loader.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("agent guide", () => {
  it("자연어 사용자 계약과 위험 비례 실행 깊이를 제공", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const task = parseTaskFile(writeTask(root, "T-300", { riskLevel: "low" }));
    const guide = buildAgentGuide(root, loadConfig({ projectRoot: root }), task);
    expect(guide.contract.user_interface).toBe("natural-language");
    expect(guide.contract.cli_operator).toBe("ai-agent");
    expect(guide.task?.workflow_depth).toBe("fast");
    expect(guide.execution_plan.depth).toBe("fast");
    expect(guide.execution_plan.verificationLevels).toEqual([1]);
    expect(guide.execution_plan.maxReworkLoops).toBe(1);
    expect(guide.operating_rules.join(" ")).toContain("never ask the user to run commands");
    expect(guide.operating_rules.join(" ")).toContain("avoid a second source of truth");
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
