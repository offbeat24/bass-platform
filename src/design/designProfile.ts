import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import type { GateCheck } from "../types.js";

/** Design Profile 기계 검사 (Design 프롬프트 §10 중 MVP 항목) */

export interface DesignCheckOptions {
  projectRoot: string;
  effective: Record<string, unknown>;
  /** 검사할 소스 디렉터리 (기본 src) */
  sourceDirs?: string[];
}

export function runDesignChecks(opts: DesignCheckOptions): GateCheck[] {
  const checks: GateCheck[] = [];
  const designMd = path.join(opts.projectRoot, "DESIGN.md");

  // 1. DESIGN.md 존재
  const exists = fs.existsSync(designMd);
  checks.push({
    id: "design-md-exists",
    description: "DESIGN.md 존재",
    status: exists ? "pass" : "fail",
    detail: exists ? undefined : "bass init 으로 템플릿을 생성할 수 있다",
  });
  if (!exists) return checks;

  // 2. 토큰 일관성: 하드코딩된 hex 색상 검출 (토큰 파일 밖에서)
  const sourceDirs = opts.sourceDirs ?? ["src", "app", "components"];
  const hardcoded: string[] = [];
  for (const dir of sourceDirs) {
    const abs = path.join(opts.projectRoot, dir);
    if (!fs.existsSync(abs)) continue;
    scanForHardcodedColors(abs, hardcoded);
  }
  checks.push({
    id: "token-consistency-colors",
    description: "토큰 파일 밖 하드코딩 hex 색상 없음",
    status: hardcoded.length === 0 ? "pass" : "warn",
    detail: hardcoded.length > 0 ? hardcoded.slice(0, 10).join("; ") : undefined,
  });

  // 3. 상태 완결성 체크리스트: DESIGN.md 의 Interaction states 섹션에 명시됐는지
  const designContent = fs.readFileSync(designMd, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const interactionStates = extractMarkdownSection(designContent, "Interaction states");
  const design = (opts.effective["design"] ?? {}) as Record<string, unknown>;
  const stateChecklist = (design["state_checklist"] ?? [
    "hover", "focus", "disabled", "loading", "error", "empty",
  ]) as string[];
  const missingStates = stateChecklist.filter(
    (s) => !new RegExp(`\\b${s}\\b`, "i").test(interactionStates),
  );
  checks.push({
    id: "state-completeness-spec",
    description: "DESIGN.md 가 상호작용 상태를 다룸",
    status: missingStates.length === 0 ? "pass" : "warn",
    detail: missingStates.length > 0 ? `DESIGN.md 에 언급 없는 상태: ${missingStates.join(", ")}` : undefined,
  });

  return checks;
}

function extractMarkdownSection(content: string, heading: string): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start < 0) return "";
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join("\n").trim();
}

const TOKEN_FILE_PATTERN = /(token|theme|palette|design)/i;
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".vue", ".svelte"]);
const HEX_COLOR = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/;
// CSS 커스텀 프로퍼티 정의(--foo: #hex)는 토큰 정의 자체이므로 위반이 아니다
const CSS_VAR_DEFINITION = /^\s*--[\w-]+\s*:/;

function scanForHardcodedColors(dir: string, out: string[], depth = 0): void {
  if (depth > 6 || out.length > 50) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanForHardcodedColors(full, out, depth + 1);
    } else if (SOURCE_EXT.has(path.extname(entry.name)) && !TOKEN_FILE_PATTERN.test(entry.name)) {
      const lines = fs.readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (
          HEX_COLOR.test(line) &&
          !CSS_VAR_DEFINITION.test(line) &&
          !line.includes("bass-allow-color")
        ) {
          out.push(`${full}:${i + 1}`);
        }
      });
    }
  }
}

/**
 * 디자인 교정 학습 루프 (Design 프롬프트 §15).
 * Correction → Pending → Human review → 승인 시 인간이 DESIGN.md 에 반영.
 * 교정을 즉시 영구 규칙으로 만들지 않는다.
 */
export interface DesignCorrection {
  id: number;
  status: "pending" | "approved" | "rejected";
  rule: string;
  evidence: string[];
  created_at: string;
  reviewed_at?: string;
  reviewer?: string;
}

function correctionsPath(projectRoot: string): string {
  return path.join(projectRoot, "design", "corrections.yaml");
}

export function loadCorrections(projectRoot: string): DesignCorrection[] {
  const file = correctionsPath(projectRoot);
  if (!fs.existsSync(file)) return [];
  return (parse(fs.readFileSync(file, "utf8")) ?? []) as DesignCorrection[];
}

export function addCorrection(projectRoot: string, rule: string, evidence: string[]): DesignCorrection {
  const all = loadCorrections(projectRoot);
  const next: DesignCorrection = {
    id: (all[all.length - 1]?.id ?? 0) + 1,
    status: "pending",
    rule,
    evidence,
    created_at: new Date().toISOString(),
  };
  all.push(next);
  saveCorrections(projectRoot, all);
  return next;
}

export function reviewCorrection(
  projectRoot: string,
  id: number,
  decision: "approved" | "rejected",
  reviewer: string,
): DesignCorrection {
  const all = loadCorrections(projectRoot);
  const target = all.find((c) => c.id === id);
  if (!target) throw new Error(`Correction #${id} not found`);
  target.status = decision;
  target.reviewed_at = new Date().toISOString();
  target.reviewer = reviewer;
  saveCorrections(projectRoot, all);
  return target;
}

function saveCorrections(projectRoot: string, corrections: DesignCorrection[]): void {
  const file = correctionsPath(projectRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringify(corrections), "utf8");
}
