import fs from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { CriticFinding } from "../types.js";

/** Core 프롬프트 §16 finding 스키마 */
export const findingSchema = z.object({
  severity: z.enum(["high", "medium", "low", "note"]),
  confidence: z.enum(["confirmed", "likely", "speculative"]),
  category: z.enum(["correctness", "security", "scope", "maintainability", "test", "product", "design"]),
  evidence: z.object({
    file: z.string().min(1),
    location: z.string().min(1),
  }),
  description: z.string().min(1),
  impact: z.string().min(1),
  verification: z.string().min(1),
  suggested_fix: z.string().min(1),
});

export const findingsFileSchema = z.object({
  critic: z.string(),
  task_id: z.string(),
  iteration: z.number().int().positive(),
  no_issues_found: z.boolean().default(false),
  findings: z.array(findingSchema).default([]),
});

export type FindingsFile = z.infer<typeof findingsFileSchema>;

export interface FindingValidationIssue {
  index: number | null;
  problem: string;
}

/**
 * critic 산출물을 검증한다. 스키마 위반 외에 프로토콜 위반
 * (근거 없는 high finding, 문제 없음과 finding 동시 존재)도 잡는다.
 */
export function validateFindingsFile(filePath: string): {
  file: FindingsFile | null;
  issues: FindingValidationIssue[];
} {
  const issues: FindingValidationIssue[] = [];
  const raw = parse(fs.readFileSync(filePath, "utf8"));
  const result = findingsFileSchema.safeParse(raw);
  if (!result.success) {
    for (const i of result.error.issues) {
      issues.push({ index: null, problem: `${i.path.join(".")}: ${i.message}` });
    }
    return { file: null, issues };
  }

  const file = result.data;
  if (file.no_issues_found && file.findings.length > 0) {
    issues.push({ index: null, problem: "no_issues_found=true 인데 findings 가 존재한다" });
  }
  if (!file.no_issues_found && file.findings.length === 0) {
    issues.push({
      index: null,
      problem: "findings 가 비어 있으면 no_issues_found=true 로 명시하라 (프로토콜 7항)",
    });
  }

  file.findings.forEach((f, index) => {
    if ((f.severity === "high" || f.severity === "medium") && f.confidence === "speculative") {
      issues.push({
        index,
        problem: `${f.severity} finding 이 speculative — 추측과 확인된 결함을 구분하라 (프로토콜 3항)`,
      });
    }
    const vague = /(어색|별로|예쁘지 않|느낌이|촌스럽)/;
    if (vague.test(f.description) && f.verification.trim().length < 10) {
      issues.push({
        index,
        problem: "근거 없는 취향 표현으로 보인다. 검증 방법을 구체화하라",
      });
    }
  });

  return { file, issues };
}

export interface StopDecision {
  stop: boolean;
  reasons: string[];
}

/**
 * 반복 종료 판정 (Core 프롬프트 §16).
 * 최근 iteration 의 finding 목록을 받아 계속 반복할 가치가 있는지 판단한다.
 */
export function shouldStopIteration(iterations: FindingsFile[]): StopDecision {
  const reasons: string[] = [];
  if (iterations.length === 0) return { stop: false, reasons: ["no iterations yet"] };

  const latest = iterations[iterations.length - 1]!;
  const confirmedHighMedium = latest.findings.filter(
    (f) => (f.severity === "high" || f.severity === "medium") && f.confidence !== "speculative",
  );

  if (latest.no_issues_found || latest.findings.length === 0) {
    reasons.push("최신 iteration 에서 문제 없음");
    return { stop: true, reasons };
  }

  if (confirmedHighMedium.length === 0) {
    reasons.push("새로운 high/medium 확인 문제 없음 — 남은 항목은 low/note 수준");
    return { stop: true, reasons };
  }

  const speculativeRatio = latest.findings.filter((f) => f.confidence === "speculative").length / latest.findings.length;
  if (speculativeRatio > 0.5) {
    reasons.push(`근거 없는 추측 비율 증가 (${Math.round(speculativeRatio * 100)}%) — 추가 반복 가치 낮음`);
    return { stop: true, reasons };
  }

  reasons.push(`확인된 high/medium finding ${confirmedHighMedium.length}건 — 수정 후 재검증 필요`);
  return { stop: false, reasons };
}
