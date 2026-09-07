import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseTaskFile } from "../src/task/taskFile.js";
import { readEvents } from "../src/task/events.js";
import { makeTempProject, writeTask } from "./helpers.js";

// Run the source entrypoint so these checks cannot silently use a stale dist build.
async function cli(root: string, args: string[]) {
  vi.resetModules();
  const argv = process.argv;
  process.argv = [process.execPath, "bass", ...args];
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("CLI exit"); });
  try {
    await import("../src/cli/main.js");
    return { code: 0, output: log.mock.calls.flat().join("\n") };
  } catch (failure) {
    if (!exit.mock.calls.length) throw failure;
    return { code: Number(exit.mock.calls[0]?.[0]), output: error.mock.calls.flat().join("\n") };
  } finally {
    process.argv = argv;
    cwd.mockRestore();
    log.mockRestore();
    error.mockRestore();
    exit.mockRestore();
  }
}

function snapshot(root: string, file: string) {
  const events = path.join(root, ".bass", "events.jsonl");
  return [fs.readFileSync(file, "utf8"), fs.existsSync(events) ? fs.readFileSync(events, "utf8") : null];
}

describe("CLI work entry gates", () => {
  it.each(["CAPTURED", "ACTIVE"])("a failed pre-task cannot be bypassed from %s", async (status) => {
    const root = makeTempProject({});
    const file = writeTask(root, "CLI-1", { status, sections: { Problem: "" } });
    const before = snapshot(root, file);
    expect((await cli(root, ["gate", "pre-task", "CLI-1"])).code).toBe(1);
    for (const command of [["task", "transition", "CLI-1", "ACTIVE"], ["task", "attempt", "start", "CLI-1"]]) {
      const result = await cli(root, command);
      expect(result.code).toBe(1);
      expect(result.output).toContain("section:Problem");
      expect(snapshot(root, file)).toEqual(before);
    }
  });

  it.each(["REVIEW", "HUMAN_REVIEW"])("%s releases paths; reactivation conflicts leave state and events unchanged", async (status) => {
    const root = makeTempProject({});
    const review = writeTask(root, "CLI-2", { status, coordination: { owned_paths: ["src"] } });
    writeTask(root, "CLI-3", { status: "CAPTURED", coordination: { owned_paths: ["src/app"] } });
    expect((await cli(root, ["task", "transition", "CLI-3", "ACTIVE"])).code).toBe(0);
    const before = snapshot(root, review);
    const rejected = await cli(root, ["task", "transition", "CLI-2", "ACTIVE"]);
    expect(rejected.code).toBe(1);
    expect(rejected.output).toContain("overlaps");
    expect(snapshot(root, review)).toEqual(before);
  });

  it("a review predecessor still blocks explicit dependencies", async () => {
    const root = makeTempProject({});
    writeTask(root, "CLI-4", { status: "REVIEW" });
    const file = writeTask(root, "CLI-5", { status: "CAPTURED", coordination: { depends_on: ["CLI-4"] } });
    const before = snapshot(root, file);
    const result = await cli(root, ["task", "transition", "CLI-5", "ACTIVE"]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("blocked by: CLI-4");
    expect(snapshot(root, file)).toEqual(before);
  });

  it("reactivation checks capacity even when owned paths are disjoint", async () => {
    const root = makeTempProject({});
    const file = writeTask(root, "CLI-6", { status: "REVIEW", coordination: { owned_paths: ["src/a"] } });
    writeTask(root, "CLI-7", { status: "ACTIVE", coordination: { owned_paths: ["src/b"] } });
    const before = snapshot(root, file);
    const result = await cli(root, ["task", "transition", "CLI-6", "ACTIVE"]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("active-task-limit");
    expect(snapshot(root, file)).toEqual(before);
  });

  it("valid reactivation and repeated activation/start are idempotent", async () => {
    const root = makeTempProject({});
    const file = writeTask(root, "CLI-8", { status: "REVIEW" });
    expect((await cli(root, ["task", "transition", "CLI-8", "ACTIVE"])).code).toBe(0);
    expect(parseTaskFile(file).frontmatter.status).toBe("ACTIVE");
    const active = snapshot(root, file);
    expect((await cli(root, ["task", "transition", "CLI-8", "ACTIVE"])).output).toContain("unchanged:");
    expect(snapshot(root, file)).toEqual(active);
    expect((await cli(root, ["task", "attempt", "start", "CLI-8"])).code).toBe(0);
    const started = snapshot(root, file);
    expect((await cli(root, ["task", "attempt", "start", "CLI-8"])).output).toContain("unchanged:");
    expect(snapshot(root, file)).toEqual(started);
    expect(readEvents(root).events.filter((event) => event.kind === "attempt.started")).toHaveLength(1);
  });
});
