import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { claimCapability, completeCapability } from "../src/task/capability.js";
import { finishAttempt, startAttempt } from "../src/task/events.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("external capability invocation", () => {
  it("claim, uncertain, complete, reuse와 충돌을 call_id 하나로 직렬화한다", () => {
    const fixture = capabilityFixture("CAP-401");
    startAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan });

    const first = claimCapability({ ...fixture.options, host: "codex", inspection: fixture.inspection });
    expect(first).toMatchObject({ action: "run", attempt: 1 });
    const duplicate = claimCapability({ ...fixture.options, host: "claude", inspection: fixture.inspection });
    expect(duplicate).toMatchObject({ action: "uncertain", callId: first.callId });

    const completed = completeCapability({
      ...fixture.options,
      host: "codex",
      status: "pass",
      summary: "provider result accepted",
    });
    expect(completed.changed).toBe(true);
    finishAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan, result: "pass", summary: "done" });
    expect(completeCapability({
      ...fixture.options,
      host: "codex",
      status: "pass",
      summary: "provider result accepted",
    }).changed).toBe(false);
    expect(claimCapability({ ...fixture.options, host: "claude", inspection: fixture.inspection })).toMatchObject({
      action: "reuse",
      callId: first.callId,
    });
    expect(() => completeCapability({
      ...fixture.options,
      host: "codex",
      status: "fail",
      summary: "different result",
    })).toThrow("Conflicting completion");
  });

  it("새 attempt에서만 같은 capability를 의도적으로 다시 호출한다", () => {
    const fixture = capabilityFixture("CAP-402");
    startAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan });
    const first = claimCapability({ ...fixture.options, host: "codex", inspection: fixture.inspection });
    completeCapability({ ...fixture.options, host: "codex", status: "fail", summary: "first attempt failed" });
    finishAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan, result: "fail", summary: "retry" });
    const currentTask = parseTaskFile(fixture.task.filePath);
    startAttempt({ projectRoot: fixture.root, task: currentTask, plan: fixture.plan });
    const second = claimCapability({
      ...fixture.options,
      task: currentTask,
      host: "codex",
      inspection: fixture.inspection,
    });

    expect(second).toMatchObject({ action: "run", attempt: 2 });
    expect(second.callId).not.toBe(first.callId);
  });

  it("동일 complete는 attempt 종료와 evidence 정리 뒤에도 no-op이다", () => {
    const fixture = capabilityFixture("CAP-405");
    const evidenceDir = path.join(fixture.root, ".bass", "evidence", "CAP-405");
    const evidence = path.join(evidenceDir, "provider.log");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(evidence, "passed", "utf8");
    startAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan });
    claimCapability({ ...fixture.options, host: "codex", inspection: fixture.inspection });
    completeCapability({
      ...fixture.options,
      host: "codex",
      status: "pass",
      summary: "evidence recorded",
      evidence: ".bass/evidence/CAP-405/provider.log",
    });
    finishAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan, result: "pass", summary: "done" });
    fs.unlinkSync(evidence);

    expect(completeCapability({
      ...fixture.options,
      host: "codex",
      status: "pass",
      summary: "evidence recorded",
      evidence: ".bass/evidence/CAP-405/provider.log",
    }).changed).toBe(false);
  });

  it("현재 계획에 없거나 builtin인 호출은 claim하지 않는다", () => {
    const fixture = capabilityFixture("CAP-403");
    startAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan });
    expect(() => claimCapability({
      ...fixture.options,
      capabilityCall: "ouroboros:seed",
      host: "codex",
      inspection: fixture.inspection,
    })).toThrow("not in the current ExecutionPlan");
    const builtinPlan = { ...fixture.plan, capabilityCalls: ["bass:html-report"] };
    expect(() => claimCapability({
      ...fixture.options,
      plan: builtinPlan,
      capabilityCall: "bass:html-report",
      host: "codex",
      inspection: fixture.inspection,
    })).toThrow("builtin or unknown");
  });

  it("열린 attempt의 plan fingerprint가 바뀌면 같은 호출을 다시 만들지 않는다", () => {
    const fixture = capabilityFixture("CAP-404");
    startAttempt({ projectRoot: fixture.root, task: fixture.task, plan: fixture.plan });
    claimCapability({ ...fixture.options, host: "codex", inspection: fixture.inspection });
    const changedPlan = { ...fixture.plan, planFingerprint: "f".repeat(64) };
    expect(() => claimCapability({
      ...fixture.options,
      plan: changedPlan,
      host: "codex",
      inspection: fixture.inspection,
    })).toThrow("different ExecutionPlan");
    expect(() => startAttempt({
      projectRoot: fixture.root,
      task: fixture.task,
      plan: changedPlan,
    })).toThrow("different ExecutionPlan");
    expect(() => finishAttempt({
      projectRoot: fixture.root,
      task: fixture.task,
      plan: changedPlan,
      result: "fail",
      summary: "wrong plan",
    })).toThrow("different ExecutionPlan");
  });
});

function capabilityFixture(id: string) {
  const root = makeTempProject({});
  const task = parseTaskFile(writeTask(root, id, { status: "ACTIVE", riskLevel: "medium" }));
  const config = loadConfig({ projectRoot: root });
  const plan = buildExecutionPlan(config, task);
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "bass-capability-"));
  return {
    root,
    task,
    plan,
    inspection: { homeDir: fakeHome, commandAvailable: (command: string) => command === "ponytail", active: new Set(["ponytail"]) },
    options: {
      projectRoot: root,
      task,
      plan,
      config: config.bassYaml,
      capabilityCall: "ponytail:full",
    },
  };
}
