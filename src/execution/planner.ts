import type { LoadedConfig } from "../config/loader.js";
import type { ExecutionDepth, ExecutionPlan, TaskKind } from "../types.js";
import type { TaskFile } from "../task/taskFile.js";

const TASK_KINDS = new Set<TaskKind>(["explore", "delete", "fix", "feature", "refactor", "release"]);

export function buildExecutionPlan(config: LoadedConfig, task?: TaskFile): ExecutionPlan {
  const taskKind = inferTaskKind(task);
  const changedSurfaces = inferChangedSurfaces(task);
  const depth = resolveDepth(config, task, taskKind, changedSurfaces);
  const configuredCritics = asStrings(config.effective["critics"]);
  const capabilities = config.bassYaml.capabilities;

  const scopeLock = taskKind === "delete"
    ? [
        "Remove only the accepted target and its stale references.",
        "Do not add adjacent features, efficiency work, onboarding work, or follow-up tasks.",
      ]
    : [];

  const verificationLevels: Array<1 | 2 | 3> =
    depth === "fast" ? [1] : depth === "standard" ? [1, 2] : [1, 2, 3];
  const criticLimit = depth === "fast" ? 0 : depth === "standard" ? 1 : 2;
  const critics = relevantCritics(configuredCritics, changedSurfaces)
    .filter((critic) => !(capabilities.simplicity === "ponytail" && critic === "simplicity"))
    .slice(0, criticLimit);
  const loop = loopBudget(config, task, depth);

  return {
    taskKind,
    depth,
    changedSurfaces,
    scopeLock,
    verificationLevels,
    critics,
    capabilityCalls: capabilityCalls(config, task, depth, changedSurfaces),
    loop,
    parallel: {
      maxAgents: depth === "hardened" && (task?.frontmatter.coordination.owned_paths.length ?? 0) > 0
        ? config.bassYaml.execution.parallel.max_agents
        : 1,
    },
    maxReworkLoops: Math.max(0, loop.maxAttempts - 1),
  };
}

function loopBudget(
  config: LoadedConfig,
  task: TaskFile | undefined,
  depth: ExecutionDepth,
): ExecutionPlan["loop"] {
  const defaults = depth === "fast"
    ? { maxTurns: 4, maxAttempts: 1, maxMinutes: 15 }
    : depth === "standard"
      ? { maxTurns: 8, maxAttempts: 2, maxMinutes: 30 }
      : { maxTurns: 12, maxAttempts: 3, maxMinutes: 60 };
  const project = config.bassYaml.execution.loop;
  const taskLoop = task?.frontmatter.loop;
  return {
    maxTurns: taskLoop?.max_turns ?? project.max_turns ?? defaults.maxTurns,
    maxAttempts: taskLoop?.max_attempts ?? project.max_attempts ?? defaults.maxAttempts,
    maxMinutes: taskLoop?.max_minutes ?? project.max_minutes ?? defaults.maxMinutes,
    noProgressLimit: taskLoop?.no_progress_limit ?? project.no_progress_limit,
    stopWhen: taskLoop?.stop_when.length
      ? taskLoop.stop_when
      : ["acceptance criteria pass", "required evaluators pass", "no open high/medium findings"],
    requiredEvidence: taskLoop?.required_evidence ?? [],
  };
}

function inferTaskKind(task?: TaskFile): TaskKind {
  const raw = task?.frontmatter.type?.toLowerCase() as TaskKind | undefined;
  if (raw && TASK_KINDS.has(raw)) return raw;
  const text = `${task?.frontmatter.title ?? ""} ${task?.sections.get("What we are shipping") ?? ""}`.toLowerCase();
  if (/\b(delete|remove|삭제|제거)\b/.test(text)) return "delete";
  if (/\b(fix|bug|수정|버그)\b/.test(text)) return "fix";
  if (/\b(refactor|리팩터)\b/.test(text)) return "refactor";
  if (/\b(release|publish|배포|릴리스)\b/.test(text)) return "release";
  if (/\b(explore|research|조사|탐색)\b/.test(text)) return "explore";
  return "feature";
}

function resolveDepth(
  config: LoadedConfig,
  task: TaskFile | undefined,
  taskKind: TaskKind,
  changedSurfaces: string[],
): ExecutionDepth {
  const configured = config.bassYaml.execution.depth;
  if (configured !== "adaptive") return configured;
  const riskReasons = (task?.frontmatter.risk.reasons ?? []).join(" ").toLowerCase();
  const hardenedSurface = changedSurfaces.some((surface) => surface === "data" || surface === "release");
  const hardenedReason = /(auth|permission|authorization|public[- ]?api|migration|deploy|release|인증|권한|공개 api|마이그레이션|배포)/.test(riskReasons);
  if (taskKind === "release" || hardenedSurface || hardenedReason || task?.frontmatter.risk.level === "high" || task?.frontmatter.risk.level === "critical") {
    return "hardened";
  }
  const game = config.bassYaml.bass.profiles.includes("game") || config.bassYaml.bass.profiles.includes("nan2026");
  if (task?.frontmatter.risk.level === "low" && changedSurfaces.length <= 2 && !game) return "fast";
  return "standard";
}

export function inferChangedSurfaces(task?: TaskFile): string[] {
  if (!task) return [];
  const configured = task.frontmatter.config?.["changed_surfaces"];
  if (Array.isArray(configured)) return unique(configured.map(String).map(normalizeSurface).filter(Boolean));
  const scope = task.sections.get("Allowed scope") ?? "";
  return unique(
    scope
      .split(/[\n,]/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean)
      .map(normalizeSurface),
  );
}

function normalizeSurface(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "").trim();
  if (/^(src\/)?(ui|components|styles|app)/i.test(normalized)) return "ui";
  if (/^(server|api|db|database|migrations?)/i.test(normalized)) return "data";
  if (/^(infra|deploy|\.github|docker)/i.test(normalized)) return "release";
  if (/^(game|unity|assets|scenes)/i.test(normalized)) return "game";
  return normalized;
}

function relevantCritics(critics: string[], surfaces: string[]): string[] {
  const preferred = surfaces.includes("ui")
    ? ["design", "implementation", "test", "architecture", "simplicity"]
    : surfaces.some((surface) => surface === "data" || surface === "release")
      ? ["security", "architecture", "test", "implementation", "simplicity"]
      : ["implementation", "test", "architecture", "simplicity", "discovery"];
  const available = new Set(critics);
  return unique([...preferred.filter((critic) => available.has(critic)), ...critics]);
}

function capabilityCalls(
  config: LoadedConfig,
  task: TaskFile | undefined,
  depth: ExecutionDepth,
  surfaces: string[],
): string[] {
  const selected = config.bassYaml.capabilities;
  const requested = new Set((task?.frontmatter.capabilities ?? []).map((item) => item.toLowerCase()));
  const reasons = (task?.frontmatter.risk.reasons ?? []).join(" ").toLowerCase();
  const calls: string[] = [];

  const ambiguous = requested.has("specification") || requested.has("ouroboros") || /(ambigu|conflict|semantic|rework|명세|충돌|모호|재작업)/.test(reasons);
  if (ambiguous && selected.specification !== "off") {
    calls.push(`${selected.specification}:seed`);
    if (depth === "hardened") calls.push(`${selected.specification}:semantic-evaluation`);
  }
  if (selected.simplicity === "ponytail") calls.push(`ponytail:${depth === "fast" ? "lite" : "full"}`);

  const uiDirection = requested.has("ui-direction") || requested.has("new-ui") || requested.has("redesign");
  if (surfaces.includes("ui") && uiDirection && selected.ui_direction === "bass") calls.push("bass:ui-direction");
  if ((requested.has("pen") || requested.has("ui-exploration")) && selected.ui_canvas === "pen") calls.push("pen:mcp");
  if (requested.has("html-report") && selected.html_report === "bass") calls.push("bass:html-report");
  return calls;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
