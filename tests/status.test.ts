import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";
import { appendEvent } from "../src/task/events.js";
import { buildProjectStatus, formatProjectStatus, watchProjectStatus } from "../src/task/status.js";
import { makeTempProject, writeRunRecord, writeTask } from "./helpers.js";

describe("project status", () => {
  it("task·attempt·검증·evidence·usage를 하나의 읽기 전용 snapshot으로 만든다", () => {
    const root = makeTempProject({});
    writeTask(root, "STATUS-101", { status: "ACTIVE", riskLevel: "medium" });
    appendEvent(root, { task_id: "STATUS-101", kind: "task.started", status: "running", summary: "started" });
    appendEvent(root, { task_id: "STATUS-101", attempt: 1, kind: "attempt.started", status: "running", summary: "attempt 1 started" });
    writeRunRecord(root, "STATUS-101", { usage: { turns: 3, attempts: 1, input_tokens: 100, output_tokens: 20, cached_input_tokens: 50, evaluator_tokens: 0, tool_calls: 4, subagents: 0, estimated_cost: "unknown" } });
    const status = buildProjectStatus(root, loadConfig({ projectRoot: root }), new Date("2026-08-13T00:00:00Z"));
    expect(status.tasks[0]).toMatchObject({
      id: "STATUS-101",
      status: "ACTIVE",
      attempts: 1,
      current_attempt: 1,
      max_attempts: 2,
      evidence: 0,
      open_high_or_medium: 0,
    });
    expect(status.tasks[0]!.usage.input_tokens).toBe(100);
    expect(formatProjectStatus(status)).toContain("attempt=1/2");
  });

  it("손상된 마지막 이벤트를 경고하되 이전 상태는 유지한다", () => {
    const root = makeTempProject({});
    writeTask(root, "STATUS-102", {});
    appendEvent(root, { task_id: "STATUS-102", kind: "task.started", status: "running", summary: "started" });
    fs.appendFileSync(path.join(root, ".bass", "events.jsonl"), "{broken", "utf8");
    const status = buildProjectStatus(root, loadConfig({ projectRoot: root }));
    expect(status.tasks).toHaveLength(1);
    expect(status.warnings[0]).toContain("truncated final event line");
  });

  it("완료된 시도 수는 event가 아니라 run record를 기준으로 표시한다", () => {
    const root = makeTempProject({});
    writeTask(root, "STATUS-103", { status: "REVIEW", riskLevel: "medium" });
    appendEvent(root, { task_id: "STATUS-103", attempt: 1, kind: "attempt.started", status: "running", summary: "attempt 1 started" });
    appendEvent(root, { task_id: "STATUS-103", attempt: 1, kind: "attempt.completed", status: "pass", summary: "attempt 1 passed" });
    appendEvent(root, { task_id: "STATUS-103", attempt: 2, kind: "attempt.started", status: "running", summary: "stale activity" });
    writeRunRecord(root, "STATUS-103");
    const status = buildProjectStatus(root, loadConfig({ projectRoot: root }));
    expect(status.tasks[0]?.attempts).toBe(1);
    expect(status.tasks[0]?.current_attempt).toBe(2);
  });

  it("watch는 변경된 snapshot만 방출하고 abort 시 종료한다", async () => {
    const root = makeTempProject({});
    writeTask(root, "STATUS-104", { status: "ACTIVE" });
    const config = loadConfig({ projectRoot: root });
    const output: ReturnType<typeof buildProjectStatus>[] = [];
    const controller = new AbortController();
    const watching = watchProjectStatus(
      () => buildProjectStatus(root, config),
      (status) => output.push(status),
      { intervalMs: 5, signal: controller.signal },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    appendEvent(root, { task_id: "STATUS-104", kind: "task.started", status: "running", summary: "watch update" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await watching;
    expect(output).toHaveLength(2);
    expect(output[1]?.tasks[0]?.last_activity).not.toBeNull();
  });
});
