import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFindingsFile, shouldStopIteration, type FindingsFile } from "../src/critics/findings.js";

function writeFindings(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bass-critic-"));
  const file = path.join(dir, "findings.yaml");
  fs.writeFileSync(file, content, "utf8");
  return file;
}

const validFinding = `
critic: implementation
task_id: T-001
iteration: 1
findings:
  - severity: high
    confidence: confirmed
    category: correctness
    evidence:
      file: src/a.ts
      location: "line 10"
    description: null 체크 누락
    impact: 빈 입력에서 크래시
    verification: "npm test -- a.test.ts 실행"
    suggested_fix: 가드 추가
`;

describe("critic finding 검증", () => {
  it("유효한 finding 파일은 통과", () => {
    const { file, issues } = validateFindingsFile(writeFindings(validFinding));
    expect(file).not.toBeNull();
    expect(issues).toEqual([]);
  });

  it("증거 없는 finding 은 스키마 위반", () => {
    const { issues } = validateFindingsFile(
      writeFindings(`
critic: implementation
task_id: T-001
iteration: 1
findings:
  - severity: high
    confidence: confirmed
    category: correctness
    description: 문제
    impact: 영향
    verification: 방법
    suggested_fix: 수정
`),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it("high finding 이 speculative 면 프로토콜 위반", () => {
    const { issues } = validateFindingsFile(
      writeFindings(validFinding.replace("confidence: confirmed", "confidence: speculative")),
    );
    expect(issues.some((i) => i.problem.includes("speculative"))).toBe(true);
  });

  it("문제 없음 처리: findings 비어 있으면 no_issues_found 명시 요구", () => {
    const { issues } = validateFindingsFile(
      writeFindings(`
critic: test
task_id: T-001
iteration: 1
findings: []
`),
    );
    expect(issues.some((i) => i.problem.includes("no_issues_found"))).toBe(true);
  });

  it("no_issues_found 와 findings 동시 존재는 모순", () => {
    const { issues } = validateFindingsFile(
      writeFindings(validFinding.replace("findings:", "no_issues_found: true\nfindings:")),
    );
    expect(issues.some((i) => i.problem.includes("no_issues_found"))).toBe(true);
  });
});

describe("반복 종료 판정", () => {
  const base = { critic: "implementation", task_id: "T-001", no_issues_found: false };
  const highFinding = {
    severity: "high" as const,
    confidence: "confirmed" as const,
    category: "correctness" as const,
    evidence: { file: "a.ts", location: "1" },
    description: "d",
    impact: "i",
    verification: "v",
    suggested_fix: "f",
  };

  it("확인된 high finding 이 있으면 계속", () => {
    const iterations: FindingsFile[] = [{ ...base, iteration: 1, findings: [highFinding] }];
    expect(shouldStopIteration(iterations).stop).toBe(false);
  });

  it("문제 없음이면 종료", () => {
    const iterations: FindingsFile[] = [
      { ...base, iteration: 1, findings: [highFinding] },
      { ...base, iteration: 2, no_issues_found: true, findings: [] },
    ];
    expect(shouldStopIteration(iterations).stop).toBe(true);
  });

  it("low/note 만 남으면 종료", () => {
    const iterations: FindingsFile[] = [
      { ...base, iteration: 1, findings: [{ ...highFinding, severity: "low" }] },
    ];
    const d = shouldStopIteration(iterations);
    expect(d.stop).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/low/);
  });

  it("추측 비율이 높으면 종료 (환각 방지)", () => {
    const spec = { ...highFinding, confidence: "speculative" as const };
    const iterations: FindingsFile[] = [
      { ...base, iteration: 1, findings: [spec, spec, { ...highFinding, severity: "medium" }] },
    ];
    const d = shouldStopIteration(iterations);
    expect(d.stop).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/추측/);
  });
});
