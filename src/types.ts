/** 공유 타입. BASS 전역에서 사용하는 도메인 모델. */

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type WorkflowState =
  | "CAPTURED"
  | "ACTIVE"
  | "REVIEW"
  | "DONE"
  // 0.2 states remain readable and normalize to the four 0.3 states.
  | "DISCOVERY"
  | "SHAPED"
  | "READY"
  | "PLANNED"
  | "IMPLEMENTING"
  | "VERIFYING"
  | "CRITIQUING"
  | "HUMAN_REVIEW"
  | "BLOCKED"
  | "NEEDS_DECISION"
  | "NEEDS_EXPERT"
  | "FAILED"
  | "ROLLED_BACK"
  | "CANCELLED";

export type TaskKind = "explore" | "delete" | "fix" | "feature" | "refactor" | "release";
export type ExecutionDepth = "fast" | "standard" | "hardened";

export interface ExecutionPlan {
  contractVersion: 1;
  planFingerprint: string;
  taskKind: TaskKind;
  depth: ExecutionDepth;
  changedSurfaces: string[];
  scopeLock: string[];
  verificationLevels: Array<1 | 2 | 3>;
  critics: string[];
  capabilityCalls: string[];
  providers: {
    runner: string;
    context: string;
    workspace: string;
    collaboration: string;
  };
  loop: {
    maxTurns: number;
    maxAttempts: number;
    maxMinutes: number;
    noProgressLimit: number;
    stopWhen: string[];
    requiredEvidence: string[];
  };
  parallel: {
    maxAgents: number;
  };
  /** 0.3 host compatibility. Derived from loop.maxAttempts - 1. */
  maxReworkLoops: number;
}

export type ModelRole =
  | "discovery"
  | "planner"
  | "worker"
  | "critic"
  | "evaluator"
  | "summarizer"
  | "documentation";

export type Capability =
  | "deep-reasoning"
  | "long-context"
  | "tool-use"
  | "multimodal"
  | "fast"
  | "cheap";

export interface ConfigLayer {
  /** 계층 이름 (예: "global-defaults", "profile:web", "project", "task", "override") */
  name: string;
  /** 값의 물리적 출처 (파일 경로 또는 "built-in") */
  source: string;
  values: Record<string, unknown>;
}

export interface ResolvedConfigEntry {
  key: string;
  value: unknown;
  /** 최종 값을 결정한 계층 */
  layer: string;
  source: string;
  /** 하위 계층에서 덮어써진 이력 (낮은 우선순위 → 높은 우선순위 순) */
  overridden: Array<{ layer: string; source: string; value: unknown }>;
}

export interface AliasResolution {
  alias: string;
  channel: "stable" | "candidate" | "pinned";
  provider: string;
  model: string;
  capabilities: Capability[];
  /** fallback 체인을 거쳤다면 그 경로 */
  fallbackChain: string[];
  notes?: string;
}

export interface RouteRecommendation {
  taskId: string;
  role: ModelRole;
  recommendedAlias: string;
  resolved: AliasResolution | null;
  riskLevel: RiskLevel;
  reasons: string[];
  /** 인간 승인 게이트가 필요한 정책 항목 */
  approvalsRequired: string[];
}

export interface EvaluatorResult {
  name: string;
  level: 1 | 2 | 3;
  command: string;
  status: "pass" | "fail" | "timeout" | "skipped" | "error";
  exitCode: number | null;
  durationMs: number;
  outputTail: string;
  evidencePath?: string;
}

export type Severity = "high" | "medium" | "low" | "note";
export type Confidence = "confirmed" | "likely" | "speculative";

export interface CriticFinding {
  severity: Severity;
  confidence: Confidence;
  category:
    | "correctness"
    | "security"
    | "scope"
    | "maintainability"
    | "test"
    | "product"
    | "design";
  evidence: {
    file: string;
    location: string;
  };
  description: string;
  impact: string;
  verification: string;
  suggested_fix: string;
}

export interface GateCheck {
  id: string;
  description: string;
  status: "pass" | "fail" | "warn" | "needs-human";
  detail?: string;
}

export interface GateReport {
  gate: "pre-task" | "pre-review" | "pre-complete";
  taskId: string;
  passed: boolean;
  checks: GateCheck[];
  approvalsRequired: string[];
}
