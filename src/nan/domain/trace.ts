export const TRACE_STAGES = [
  "themes",
  "concepts",
  "decisions",
  "requirements",
  "scenarios",
  "tests",
  "evidence",
] as const;

export type TraceStage = (typeof TRACE_STAGES)[number];

export interface TraceRegistry {
  themes: string[];
  concepts: string[];
  decisions: string[];
  requirements: string[];
  scenarios: string[];
  tests: string[];
  evidence: string[];
  links: Array<{ from: string; to: string }>;
}

export interface TraceIssue {
  type: "duplicate" | "dead-link" | "orphan";
  id: string;
  detail: string;
}

export function validateTrace(registry: TraceRegistry): TraceIssue[] {
  const issues: TraceIssue[] = [];
  const stageById = new Map<string, TraceStage>();

  for (const stage of TRACE_STAGES) {
    for (const id of registry[stage]) {
      if (stageById.has(id)) {
        issues.push({ type: "duplicate", id, detail: `${id} appears more than once` });
      } else {
        stageById.set(id, stage);
      }
    }
  }

  const linked = new Set<string>();
  for (const link of registry.links) {
    if (!stageById.has(link.from)) {
      issues.push({ type: "dead-link", id: link.from, detail: `link source ${link.from} is undefined` });
    }
    if (!stageById.has(link.to)) {
      issues.push({ type: "dead-link", id: link.to, detail: `link target ${link.to} is undefined` });
    }
    linked.add(link.from);
    linked.add(link.to);
  }

  for (const [id, stage] of stageById) {
    if (!linked.has(id)) {
      issues.push({ type: "orphan", id, detail: `${stage} item ${id} has no trace link` });
    }
  }
  return issues;
}
