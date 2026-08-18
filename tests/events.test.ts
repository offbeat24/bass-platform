import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { loadConfig } from "../src/config/loader.js";
import { appendEvent, finishAttempt, readEvents, startAttempt } from "../src/task/events.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { makeTempProject, writeTask } from "./helpers.js";

describe("BASS event log", () => {
  it("기존 schema v1과 신규 schema v2 이벤트를 함께 읽는다", () => {
    const root = makeTempProject({});
    const file = path.join(root, ".bass", "events.jsonl");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      schema_version: 1,
      at: "2026-07-21T00:00:00.000Z",
      task_id: "EVENT-110",
      kind: "task.started",
      status: "running",
      summary: "legacy event",
    })}\n`, "utf8");
    appendEvent(root, { task_id: "EVENT-110", kind: "evidence.recorded", status: "pass", summary: "v2 event" });
    expect(readEvents(root).events.map((event) => event.schema_version)).toEqual([1, 2]);
  });

  it("유효 이벤트를 읽고 잘린 마지막 줄은 경고 후 무시한다", () => {
    const root = makeTempProject({});
    appendEvent(root, { task_id: "EVENT-101", kind: "task.started", status: "running", summary: "started" });
    fs.appendFileSync(path.join(root, ".bass", "events.jsonl"), '{"schema_version":1', "utf8");
    const result = readEvents(root);
    expect(result.events).toHaveLength(1);
    expect(result.warnings).toEqual(["truncated final event line 2 ignored"]);
  });

  it("이벤트 summary의 일반적인 비밀 값은 저장 전에 마스킹한다", () => {
    const root = makeTempProject({});
    const event = appendEvent(root, {
      task_id: "EVENT-109",
      kind: "evidence.recorded",
      status: "pass",
      summary: "API_KEY=secret-value authorization: Bearer-token",
    });
    expect(event.summary).toBe("API_KEY=***masked*** authorization: ***masked***");
    expect(fs.readFileSync(path.join(root, ".bass", "events.jsonl"), "utf8")).not.toContain("secret-value");
  });

  it("열린 시도 start는 멱등하고 Fast 실패는 시도 예산에서 NEEDS_EXPERT로 전환한다", () => {
    const { root, task, plan } = activeTask("EVENT-102", "low");
    expect(startAttempt({ projectRoot: root, task, plan }).changed).toBe(true);
    expect(readEvents(root).events.find((event) => event.kind === "attempt.started")?.plan_fingerprint).toBe(plan.planFingerprint);
    expect(startAttempt({ projectRoot: root, task, plan })).toMatchObject({ changed: false, attempt: 1 });
    const result = finishAttempt({ projectRoot: root, task, plan, result: "fail", summary: "test failed", turns: 2 });
    expect(result).toMatchObject({ blocked: true, reason: "attempt budget exhausted" });
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("NEEDS_EXPERT");
  });

  it("같은 실패가 새 evidence 없이 반복되면 NEEDS_DECISION으로 전환한다", () => {
    const { root, task, plan } = activeTask("EVENT-103", "medium");
    startAttempt({ projectRoot: root, task, plan });
    finishAttempt({ projectRoot: root, task, plan, result: "fail", summary: "same", failureFingerprint: "same-failure" });
    startAttempt({ projectRoot: root, task: parseTaskFile(task.filePath), plan });
    const result = finishAttempt({ projectRoot: root, task: parseTaskFile(task.filePath), plan, result: "fail", summary: "same", failureFingerprint: "same-failure" });
    expect(result.reason).toBe("same failure repeated without new evidence");
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("NEEDS_DECISION");
  });

  it("evidence 이벤트는 동일 실패 연속성을 끊는다", () => {
    const { root, task, plan } = activeTask("EVENT-104", "medium", { max_attempts: 3 });
    startAttempt({ projectRoot: root, task, plan });
    finishAttempt({ projectRoot: root, task, plan, result: "fail", summary: "same", failureFingerprint: "same-failure" });
    appendEvent(root, { task_id: task.frontmatter.id, kind: "evidence.recorded", status: "pass", summary: "new diagnostic evidence" });
    startAttempt({ projectRoot: root, task: parseTaskFile(task.filePath), plan });
    const result = finishAttempt({ projectRoot: root, task: parseTaskFile(task.filePath), plan, result: "fail", summary: "same", failureFingerprint: "same-failure" });
    expect(result.blocked).toBe(false);
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("ACTIVE");
  });

  it("자동 evaluator log는 새 진단 evidence로 보지 않아 동일 실패를 차단한다", () => {
    const { root, task, plan } = activeTask("EVENT-108", "medium", { max_attempts: 3 });
    startAttempt({ projectRoot: root, task, plan });
    finishAttempt({ projectRoot: root, task, plan, result: "fail", summary: "same", failureFingerprint: "same-failure" });
    startAttempt({ projectRoot: root, task: parseTaskFile(task.filePath), plan });
    appendEvent(root, {
      task_id: task.frontmatter.id,
      attempt: 2,
      kind: "evidence.recorded",
      status: "pass",
      name: "evaluation-log:test",
      summary: "routine evaluator output recorded",
    });
    const result = finishAttempt({
      projectRoot: root,
      task: parseTaskFile(task.filePath),
      plan,
      result: "fail",
      summary: "same",
      failureFingerprint: "same-failure",
    });
    expect(result.reason).toBe("same failure repeated without new evidence");
  });

  it("보고된 누적 턴이 상한을 넘으면 추가 루프를 차단한다", () => {
    const { root, task, plan } = activeTask("EVENT-105", "medium", { max_turns: 3 });
    startAttempt({ projectRoot: root, task, plan });
    const result = finishAttempt({ projectRoot: root, task, plan, result: "pass", summary: "done", turns: 4 });
    expect(result.reason).toBe("turn budget exceeded: 4/3");
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("NEEDS_DECISION");
  });

  it("무진전 횟수 상한에 도달하면 NEEDS_DECISION으로 전환한다", () => {
    const { root, task, plan } = activeTask("EVENT-106", "medium", { no_progress_limit: 1 });
    startAttempt({ projectRoot: root, task, plan });
    const result = finishAttempt({ projectRoot: root, task, plan, result: "no-progress", summary: "no new evidence" });
    expect(result.reason).toBe("no progress limit reached: 1");
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("NEEDS_DECISION");
  });

  it("첫 시도 시작부터 경과한 시간이 상한을 넘으면 추가 실행을 차단한다", () => {
    const { root, task, plan } = activeTask("EVENT-107", "medium", { max_minutes: 1 });
    startAttempt({ projectRoot: root, task, plan, now: new Date("2026-07-21T00:00:00Z") });
    const result = finishAttempt({
      projectRoot: root,
      task,
      plan,
      result: "pass",
      summary: "finished too late",
      now: new Date("2026-07-21T00:02:00Z"),
    });
    expect(result.reason).toBe("loop time budget exhausted");
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("NEEDS_DECISION");
  });
});

function activeTask(
  id: string,
  riskLevel: string,
  loop: Parameters<typeof writeTask>[2]["loop"] = {},
) {
  const root = makeTempProject({});
  const task = parseTaskFile(writeTask(root, id, { status: "ACTIVE", riskLevel, loop }));
  const plan = buildExecutionPlan(loadConfig({ projectRoot: root }), task);
  return { root, task, plan };
}
