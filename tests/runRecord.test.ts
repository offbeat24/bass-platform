import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evidenceEntryForFile, loadRunRecord } from "../src/task/runRecord.js";
import { makeTempProject } from "./helpers.js";

describe("run record compatibility and evidence paths", () => {
  it("0.3 record에 0.4 선택 필드가 없어도 기본값을 채워 읽는다", () => {
    const root = makeTempProject({});
    const recordsDir = path.join(root, ".bass", "records");
    fs.mkdirSync(recordsDir, { recursive: true });
    fs.writeFileSync(path.join(recordsDir, "LEGACY-301.json"), JSON.stringify({
      task_id: "LEGACY-301",
      summary_of_changes: "legacy change",
      why: "legacy reason",
      files_changed: ["src/legacy.ts"],
      verification: { evaluations_run: [{ name: "test", level: 2, status: "pass" }], not_verified: [] },
      critic_findings: { total: 0, open_high_or_medium: 0 },
      human_approval: { approved: true, approver: "owner", at: "2026-07-21T00:00:00Z" },
      known_limitations: [],
      out_of_scope_findings: [],
      docs_updated: { needed: false, updated: [] },
      lessons: { recorded: false, candidates: [] },
      rollback: { method: "git revert" },
    }), "utf8");

    const record = loadRunRecord(root, "LEGACY-301");
    expect(record).toMatchObject({
      record_version: 0,
      attempts: [],
      evidence: [],
      context: { sources: [], total_chars: 0, omitted: [] },
      scope: { actual_files: [], outside_allowed: [], forbidden_touched: [] },
    });
    expect(record?.usage.input_tokens).toBe("unknown");
  });

  it("task evidence 디렉터리 밖의 파일은 manifest에 넣지 못한다", () => {
    const root = makeTempProject({});
    const foreignDir = path.join(root, ".bass", "evidence", "OTHER-302");
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, "output.log"), "secret", "utf8");
    expect(() => evidenceEntryForFile(
      root,
      "TASK-302",
      "test-output",
      ".bass/evidence/OTHER-302/output.log",
      "test",
    )).toThrow(/evidence must be under/);
  });
});
