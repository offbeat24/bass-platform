import type { WorkflowState } from "../types.js";

/** 표준 진행 경로 (Core 프롬프트 §13) */
const MAIN_SEQUENCE: WorkflowState[] = [
  "CAPTURED",
  "DISCOVERY",
  "SHAPED",
  "READY",
  "PLANNED",
  "IMPLEMENTING",
  "VERIFYING",
  "CRITIQUING",
  "HUMAN_REVIEW",
  "DONE",
];

const HOLD_STATES: WorkflowState[] = ["BLOCKED", "NEEDS_DECISION", "NEEDS_EXPERT"];
const TERMINAL_STATES: WorkflowState[] = ["DONE", "ROLLED_BACK", "CANCELLED"];

export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** state 에서 전이 가능한 다음 상태 목록 */
export function allowedTransitions(state: WorkflowState): WorkflowState[] {
  if (isTerminal(state)) {
    // DONE 이후 회귀 발견 시 롤백만 허용
    return state === "DONE" ? ["ROLLED_BACK"] : [];
  }

  const out = new Set<WorkflowState>();
  const idx = MAIN_SEQUENCE.indexOf(state);

  if (idx >= 0) {
    // 다음 단계 진행
    if (idx + 1 < MAIN_SEQUENCE.length) out.add(MAIN_SEQUENCE[idx + 1]!);
    // 검증·비판·리뷰에서 발견된 문제로 구현/계획 단계 회귀
    if (["VERIFYING", "CRITIQUING", "HUMAN_REVIEW"].includes(state)) {
      out.add("IMPLEMENTING");
      out.add("PLANNED");
      out.add("DISCOVERY"); // 요구사항 자체가 문제인 경우 (Design QA §13 회귀 포함)
    }
    // 진행 중 언제든 hold/실패/취소 가능
    for (const h of HOLD_STATES) out.add(h);
    if (idx >= MAIN_SEQUENCE.indexOf("IMPLEMENTING")) out.add("FAILED");
    out.add("CANCELLED");
  }

  if (HOLD_STATES.includes(state)) {
    // hold 해제: 어느 활성 단계로든 복귀 가능 (인간 결정 이후)
    for (const s of MAIN_SEQUENCE) if (s !== "DONE") out.add(s);
    out.add("CANCELLED");
  }

  if (state === "FAILED") {
    out.add("PLANNED");
    out.add("IMPLEMENTING");
    out.add("ROLLED_BACK");
    out.add("CANCELLED");
  }

  out.delete(state);
  return [...out];
}

export function assertTransition(from: WorkflowState, to: WorkflowState): void {
  if (!allowedTransitions(from).includes(to)) {
    throw new Error(
      `Invalid workflow transition: ${from} -> ${to}. Allowed: ${allowedTransitions(from).join(", ") || "(none)"}`,
    );
  }
}
