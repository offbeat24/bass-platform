export interface Nan2026Overlay {
  conceptGate: true;
  timeLimitHours: 48;
  requiredEvidence: true;
  trace: true;
  sessionLock: true;
}

/** Event-only policy. Generic game runtime code must not import this module. */
export const NAN2026_OVERLAY: Nan2026Overlay = {
  conceptGate: true,
  timeLimitHours: 48,
  requiredEvidence: true,
  trace: true,
  sessionLock: true,
};
