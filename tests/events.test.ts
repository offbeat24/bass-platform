import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExecutionPlan } from "../src/execution/planner.js";
import { loadConfig } from "../src/config/loader.js";
import { appendEvent, finishAttempt, LOOP_BUDGET_RESUME_EVENT, readEvents, resumeLoopBudget, startAttempt } from "../src/task/events.js";
import { parseTaskFile } from "../src/task/taskFile.js";
import { buildProjectStatus } from "../src/task/status.js";
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

  it("명시적 승인 재개는 시간 창만 갱신하고 기존 시도·턴 상한은 유지한다", () => {
    const { root, task, plan } = activeTask("EVENT-111", "medium", {
      max_minutes: 1,
      max_attempts: 3,
      max_turns: 2,
      no_progress_limit: 2,
    });
    startAttempt({ projectRoot: root, task, plan, now: new Date("2026-07-21T00:00:00Z") });
    const expired = finishAttempt({
      projectRoot: root,
      task,
      plan,
      result: "pass",
      summary: "attempt ended after its time window",
      turns: 1,
      now: new Date("2026-07-21T00:02:00Z"),
    });
    expect(expired.reason).toBe("loop time budget exhausted");
    const historyBeforeResume = fs.readFileSync(path.join(root, ".bass", "events.jsonl"), "utf8");
    const blockedTask = parseTaskFile(task.filePath);
    const approval = resumeLoopBudget({
      projectRoot: root,
      task: blockedTask,
      plan,
      approvedBy: "reviewer",
      reason: "Continue after the expired attempt",
      now: new Date("2026-07-21T00:03:00Z"),
    });

    expect(approval.changed).toBe(true);
    expect(approval.event).toMatchObject({
      kind: "task.started",
      name: LOOP_BUDGET_RESUME_EVENT,
      summary: "loop budget resume approved by reviewer: Continue after the expired attempt",
    });
    expect(fs.readFileSync(path.join(root, ".bass", "events.jsonl"), "utf8").startsWith(historyBeforeResume)).toBe(true);
    expect(parseTaskFile(task.filePath).frontmatter.status).toBe("ACTIVE");
    expect(buildProjectStatus(root, loadConfig({ projectRoot: root })).tasks[0]?.blocked_reason).toBeNull();
    expect(resumeLoopBudget({
      projectRoot: root,
      task: blockedTask,
      plan,
      approvedBy: "reviewer",
      reason: "Continue after the expired attempt",
      now: new Date("2026-07-21T00:03:10Z"),
    }).changed).toBe(false);

    const resumedTask = parseTaskFile(task.filePath);
    const secondStart = startAttempt({
      projectRoot: root,
      task: resumedTask,
      plan,
      now: new Date("2026-07-21T00:03:30Z"),
    });
    expect(secondStart).toMatchObject({ changed: true, attempt: 2, blocked: false });
    expect(resumeLoopBudget({
      projectRoot: root,
      task: resumedTask,
      plan,
      approvedBy: "reviewer",
      reason: "Continue after the expired attempt",
      now: new Date("2026-07-21T00:03:35Z"),
    }).changed).toBe(false);
    const secondFinish = finishAttempt({
      projectRoot: root,
      task: resumedTask,
      plan,
      result: "pass",
      summary: "cumulative turns still apply",
      turns: 2,
      now: new Date("2026-07-21T00:03:45Z"),
    });
    expect(secondFinish.reason).toBe("turn budget exceeded: 3/2");
    expect(readEvents(root).events.filter((event) => event.kind === "attempt.started")).toHaveLength(2);
    expect(readEvents(root).events.filter((event) => event.name === LOOP_BUDGET_RESUME_EVENT)).toHaveLength(1);
  });

  it("시간 초과로 남은 열린 시도는 계속 재사용하지 않고 먼저 닫게 한다", () => {
    const { root, task, plan } = activeTask("EVENT-112", "medium", { max_minutes: 1, no_progress_limit: 2 });
    startAttempt({ projectRoot: root, task, plan, now: new Date("2026-07-21T00:00:00Z") });
    const expiredOpen = startAttempt({
      projectRoot: root,
      task,
      plan,
      now: new Date("2026-07-21T00:02:00Z"),
    });
    expect(expiredOpen).toMatchObject({ changed: false, attempt: 1, blocked: true });
    expect(readEvents(root).events.filter((event) => event.kind === "attempt.started")).toHaveLength(1);

    const closed = finishAttempt({
      projectRoot: root,
      task,
      plan,
      result: "no-progress",
      summary: "close the expired open attempt",
      now: new Date("2026-07-21T00:02:10Z"),
    });
    expect(closed.reason).toBe("loop time budget exhausted");
    expect(resumeLoopBudget({
      projectRoot: root,
      task: parseTaskFile(task.filePath),
      plan,
      approvedBy: "reviewer",
      reason: "Approve a fresh time window",
      now: new Date("2026-07-21T00:03:00Z"),
    }).changed).toBe(true);
  });

  it("재개는 다른 차단 사유를 풀지 않고 시도 상한도 초기화하지 않는다", () => {
    const { root, task, plan } = activeTask("EVENT-113", "medium", {
      max_minutes: 1,
      max_attempts: 1,
      no_progress_limit: 1,
    });
    startAttempt({ projectRoot: root, task, plan, now: new Date("2026-07-21T00:00:00Z") });
    const blocked = finishAttempt({
      projectRoot: root,
      task,
      plan,
      result: "no-progress",
      summary: "no progress within the time window",
      now: new Date("2026-07-21T00:00:30Z"),
    });
    expect(blocked.reason).toBe("no progress limit reached: 1");
    expect(() => resumeLoopBudget({
      projectRoot: root,
      task: parseTaskFile(task.filePath),
      plan,
      approvedBy: "reviewer",
      reason: "This is not a time-budget decision",
      now: new Date("2026-07-21T00:01:00Z"),
    })).toThrow("latest block reason");

    const timedTask = activeTask("EVENT-114", "medium", { max_minutes: 1, max_attempts: 1 });
    startAttempt({
      projectRoot: timedTask.root,
      task: timedTask.task,
      plan: timedTask.plan,
      now: new Date("2026-07-21T00:00:00Z"),
    });
    finishAttempt({
      projectRoot: timedTask.root,
      task: timedTask.task,
      plan: timedTask.plan,
      result: "pass",
      summary: "time window exceeded",
      now: new Date("2026-07-21T00:02:00Z"),
    });
    expect(() => resumeLoopBudget({
      projectRoot: timedTask.root,
      task: parseTaskFile(timedTask.task.filePath),
      plan: timedTask.plan,
      approvedBy: "reviewer",
      reason: "Attempt count must remain cumulative",
      now: new Date("2026-07-21T00:03:00Z"),
    })).toThrow("attempt budget exhausted");
    expect(readEvents(timedTask.root).events.filter((event) => event.name === LOOP_BUDGET_RESUME_EVENT)).toHaveLength(0);
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
