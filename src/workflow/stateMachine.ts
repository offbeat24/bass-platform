import type { WorkflowState } from "../types.js";

const MAIN_SEQUENCE: WorkflowState[] = ["CAPTURED", "ACTIVE", "REVIEW", "DONE"];

const HOLD_STATES: WorkflowState[] = ["BLOCKED", "NEEDS_DECISION", "NEEDS_EXPERT"];
const TERMINAL_STATES: WorkflowState[] = ["DONE", "ROLLED_BACK", "CANCELLED"];

export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL_STATES.includes(normalizeWorkflowState(state));
}

export function normalizeWorkflowState(state: WorkflowState): WorkflowState {
  if (["DISCOVERY", "SHAPED", "READY", "PLANNED"].includes(state)) return "CAPTURED";
  if (["IMPLEMENTING", "VERIFYING", "CRITIQUING"].includes(state)) return "ACTIVE";
  if (state === "HUMAN_REVIEW") return "REVIEW";
  return state;
}

/** state 에서 전이 가능한 다음 상태 목록 */
export function allowedTransitions(state: WorkflowState): WorkflowState[] {
  const normalized = normalizeWorkflowState(state);
  if (isTerminal(normalized)) {
    // DONE 이후 회귀 발견 시 롤백만 허용
    return normalized === "DONE" ? ["ROLLED_BACK"] : [];
  }

  const out = new Set<WorkflowState>();
  const idx = MAIN_SEQUENCE.indexOf(normalized);

  if (idx >= 0) {
    // 다음 단계 진행
    if (idx + 1 < MAIN_SEQUENCE.length) out.add(MAIN_SEQUENCE[idx + 1]!);
    // 검증·비판·리뷰에서 발견된 문제로 구현/계획 단계 회귀
    if (["ACTIVE", "REVIEW"].includes(normalized)) {
      out.add("ACTIVE");
      out.add("CAPTURED");
    }
    // 진행 중 언제든 hold/실패/취소 가능
    for (const h of HOLD_STATES) out.add(h);
    if (idx >= MAIN_SEQUENCE.indexOf("ACTIVE")) out.add("FAILED");
    out.add("CANCELLED");
  }

  if (HOLD_STATES.includes(normalized)) {
    // hold 해제: 어느 활성 단계로든 복귀 가능 (인간 결정 이후)
    for (const s of MAIN_SEQUENCE) if (s !== "DONE") out.add(s);
    out.add("CANCELLED");
  }

  if (normalized === "FAILED") {
    out.add("CAPTURED");
    out.add("ACTIVE");
    out.add("ROLLED_BACK");
    out.add("CANCELLED");
  }

  out.delete(normalized);
  return [...out];
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  const normalizedTo = normalizeWorkflowState(to);
  if (!allowedTransitions(from).includes(normalizedTo)) {
    throw new Error(
      `Invalid workflow transition: ${from} -> ${to}. Allowed: ${allowedTransitions(from).join(", ") || "(none)"}`,
    );
  }
}
