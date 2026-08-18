import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ExecutionPlan } from "../types.js";
import type { BassYaml } from "../project/bassYaml.js";
import { inspectProviders, type CapabilityInspectionOptions } from "../project/capabilities.js";
import { providerForCapabilityCall, type AgentHost } from "../project/providerCatalog.js";
import { evidenceEntryForFile } from "./runRecord.js";
import type { TaskFile } from "./taskFile.js";
import {
  appendEvent,
  currentAttempt,
  normalizeEventSummary,
  readEvents,
  type BassEvent,
} from "./events.js";

export type CapabilityCompletionStatus = "pass" | "fail" | "skipped" | "error";
export type CapabilityClaimAction = "run" | "reuse" | "uncertain";

interface CapabilityActionOptions {
  projectRoot: string;
  task: TaskFile;
  plan: ExecutionPlan;
  config: BassYaml;
  capabilityCall: string;
  host: AgentHost;
}

export interface CapabilityClaimOptions extends CapabilityActionOptions {
  inspection?: Omit<CapabilityInspectionOptions, "host">;
}

export interface CapabilityClaimResult {
  action: CapabilityClaimAction;
  callId: string;
  attempt: number;
  event?: BassEvent;
}

interface CallBinding {
  attempt: number;
  callId: string;
  open: boolean;
}

export function capabilityCallId(
  planFingerprint: string,
  taskId: string,
  attempt: number,
  capabilityCall: string,
): string {
  return createHash("sha256")
    .update(`${planFingerprint}\n${taskId}\n${attempt}\n${capabilityCall}`)
    .digest("hex");
}

export function claimCapability(options: CapabilityClaimOptions): CapabilityClaimResult {
  const provider = validatePlannedExternalCall(options.plan, options.capabilityCall);
  const providerStatus = inspectProviders(options.config, { ...options.inspection, host: options.host })
    .find((item) => item.selected === provider);
  if (!providerStatus) throw new Error(`${provider} is not selected in bass.yaml`);
  if (providerStatus.state !== "actual-plugin" || providerStatus.sessionActive !== true) {
    throw new Error(`Cannot invoke ${provider} on ${options.host}: ${providerStatus.detail}`);
  }

  const initialEvents = readEvents(options.projectRoot).events;
  const binding = resolveCallBinding(options, initialEvents);
  const existing = existingClaim(initialEvents, binding);
  if (existing) return existing;
  if (!binding.open) throw new Error(`No active attempt for ${options.task.frontmatter.id}`);

  const release = acquireCallLock(options.projectRoot, binding.callId);
  if (!release) {
    return existingClaim(readEvents(options.projectRoot).events, binding)
      ?? { action: "uncertain", callId: binding.callId, attempt: binding.attempt };
  }
  try {
    const events = readEvents(options.projectRoot).events;
    const claimed = existingClaim(events, binding);
    if (claimed) return claimed;
    const event = appendEvent(options.projectRoot, {
      task_id: options.task.frontmatter.id,
      attempt: binding.attempt,
      kind: "capability.started",
      status: "running",
      call_id: binding.callId,
      host: options.host,
      capability_call: options.capabilityCall,
      summary: `${options.capabilityCall} claimed for ${options.host}`,
    });
    return { action: "run", callId: binding.callId, attempt: binding.attempt, event };
  } finally {
    release();
  }
}

export interface CapabilityCompleteOptions extends CapabilityActionOptions {
  status: CapabilityCompletionStatus;
  summary: string;
  evidence?: string;
}

export interface CapabilityCompleteResult {
  changed: boolean;
  callId: string;
  attempt: number;
  event: BassEvent;
}

export function completeCapability(options: CapabilityCompleteOptions): CapabilityCompleteResult {
  validatePlannedExternalCall(options.plan, options.capabilityCall);
  const initialEvents = readEvents(options.projectRoot).events;
  const binding = resolveCallBinding(options, initialEvents);
  const initial = completionState(options, initialEvents, binding);
  if (initial) return initial;

  const release = acquireCallLock(options.projectRoot, binding.callId);
  if (!release) {
    const locked = completionState(options, readEvents(options.projectRoot).events, binding);
    if (locked) return locked;
    throw new Error(`Capability completion is already in progress for call_id ${binding.callId}`);
  }
  try {
    const events = readEvents(options.projectRoot).events;
    const completed = completionState(options, events, binding);
    if (completed) return completed;
    const started = requireStarted(options, events, binding);
    if (started.host !== options.host) {
      throw new Error(`Capability call was claimed by ${started.host}; complete it with the same host`);
    }
    const evidencePath = options.evidence
      ? evidenceEntryForFile(
          options.projectRoot,
          options.task.frontmatter.id,
          "capability",
          options.evidence,
          options.capabilityCall,
        ).path
      : undefined;
    const event = appendEvent(options.projectRoot, {
      task_id: options.task.frontmatter.id,
      attempt: binding.attempt,
      kind: "capability.completed",
      status: options.status,
      call_id: binding.callId,
      host: options.host,
      capability_call: options.capabilityCall,
      summary: normalizeEventSummary(options.summary),
      ...(evidencePath ? { evidence_path: evidencePath } : {}),
    });
    return { changed: true, callId: binding.callId, attempt: binding.attempt, event };
  } finally {
    release();
  }
}

function resolveCallBinding(options: CapabilityActionOptions, events: BassEvent[]): CallBinding {
  const taskId = options.task.frontmatter.id;
  const open = currentAttempt(events, taskId);
  if (open !== null) {
    const attemptStart = events.find(
      (event) => event.task_id === taskId && event.kind === "attempt.started" && event.attempt === open,
    );
    if (attemptStart?.plan_fingerprint && attemptStart.plan_fingerprint !== options.plan.planFingerprint) {
      throw new Error(`Attempt ${open} is bound to a different ExecutionPlan; start a new attempt before reinvoking capabilities`);
    }
    const callId = capabilityCallId(options.plan.planFingerprint, taskId, open, options.capabilityCall);
    const differentPlanCall = events.find((event) =>
      event.task_id === taskId
      && event.attempt === open
      && event.kind === "capability.started"
      && event.capability_call === options.capabilityCall
      && event.call_id !== callId,
    );
    if (differentPlanCall) {
      throw new Error(`Capability call already exists under a different plan in attempt ${open}; start a new attempt`);
    }
    return { attempt: open, callId, open: true };
  }

  const historical = [...events].reverse().find((event) =>
    event.task_id === taskId
    && event.attempt !== undefined
    && (event.kind === "capability.started" || event.kind === "capability.completed")
    && event.capability_call === options.capabilityCall
    && event.call_id === capabilityCallId(
      options.plan.planFingerprint,
      taskId,
      event.attempt,
      options.capabilityCall,
    ),
  );
  if (!historical?.attempt || !historical.call_id) throw new Error(`No active attempt for ${taskId}`);
  return { attempt: historical.attempt, callId: historical.call_id, open: false };
}

function existingClaim(events: BassEvent[], binding: CallBinding): CapabilityClaimResult | null {
  const matching = events.filter((event) => event.call_id === binding.callId);
  const completed = matching.find((event) => event.kind === "capability.completed");
  if (completed) return { action: "reuse", callId: binding.callId, attempt: binding.attempt, event: completed };
  const started = matching.find((event) => event.kind === "capability.started");
  return started
    ? { action: "uncertain", callId: binding.callId, attempt: binding.attempt, event: started }
    : null;
}

function completionState(
  options: CapabilityCompleteOptions,
  events: BassEvent[],
  binding: CallBinding,
): CapabilityCompleteResult | null {
  const started = requireStarted(options, events, binding);
  if (started.host !== options.host) {
    throw new Error(`Capability call was claimed by ${started.host}; complete it with the same host`);
  }
  const existing = events.find(
    (event) => event.call_id === binding.callId && event.kind === "capability.completed",
  );
  if (!existing) return null;
  const same = existing.status === options.status
    && existing.summary === normalizeEventSummary(options.summary)
    && existing.host === options.host
    && existing.capability_call === options.capabilityCall
    && existing.evidence_path === normalizeEvidenceArgument(options.evidence);
  if (!same) throw new Error(`Conflicting completion already exists for call_id ${binding.callId}`);
  return { changed: false, callId: binding.callId, attempt: binding.attempt, event: existing };
}

function requireStarted(
  options: CapabilityActionOptions,
  events: BassEvent[],
  binding: CallBinding,
): BassEvent {
  const started = events.find(
    (event) => event.call_id === binding.callId && event.kind === "capability.started",
  );
  if (!started) throw new Error(`Capability call was not claimed: ${options.capabilityCall}`);
  return started;
}

function normalizeEvidenceArgument(value?: string): string | undefined {
  if (!value) return undefined;
  return path.normalize(value).split(path.sep).join("/").replace(/^\.\//, "");
}

function acquireCallLock(projectRoot: string, callId: string): (() => void) | null {
  const directory = path.join(projectRoot, ".bass", "cache");
  const file = path.join(directory, `capability-${callId}.lock`);
  fs.mkdirSync(directory, { recursive: true });
  let handle: number;
  try {
    handle = fs.openSync(file, "wx");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") return null;
    throw error;
  }
  return () => {
    try {
      fs.closeSync(handle);
    } finally {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  };
}

function validatePlannedExternalCall(plan: ExecutionPlan, capabilityCall: string): string {
  if (!plan.capabilityCalls.includes(capabilityCall)) {
    throw new Error(`Capability call is not in the current ExecutionPlan: ${capabilityCall}`);
  }
  const provider = providerForCapabilityCall(capabilityCall);
  if (!provider) throw new Error(`Capability call is builtin or unknown and cannot be claimed: ${capabilityCall}`);
  return provider;
}
