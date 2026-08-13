#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { findProjectRoot, templatesDir } from "../paths.js";
import { loadConfig, explainConfig, parseSetArgs, type LoadedConfig } from "../config/loader.js";
import { loadRegistry, resolveAlias } from "../registry/registry.js";
import { routeTask } from "../router/router.js";
import { findTask, listTasks, checkSections, TASK_SECTIONS, taskDirectory, transitionTask } from "../task/taskFile.js";
import { preTaskGate, preReviewGate, preCompleteGate, formatGateReport } from "../workflow/gates.js";
import { allowedTransitions } from "../workflow/stateMachine.js";
import { planEvaluators, runEvaluators, formatEvaluatorResults, selectEvaluatorPlans } from "../evaluators/runner.js";
import { validateFindingsFile, shouldStopIteration, findingsFileSchema } from "../critics/findings.js";
import { composeInstructions } from "../compose/composer.js";
import { runDesignChecks, addCorrection, loadCorrections, reviewCorrection } from "../design/designProfile.js";
import { doctor } from "../project/init.js";
import { applyAdapterAssignments, applyCapabilityAssignments, promptCapabilities, setupProject } from "../project/setup.js";
import { recordRiskApproval } from "../task/approvalRecord.js";
import { recordFinalApproval } from "../task/runRecord.js";
import { buildAgentGuide } from "../agent/guide.js";
import { findRequiredApprovals } from "../policy/policyEngine.js";
import { parse } from "yaml";
import type { ModelRole, WorkflowState } from "../types.js";
import { BASS_VERSION } from "../version.js";
import { buildExecutionPlan } from "../execution/planner.js";
import { formatCapabilityStatuses, inspectProviders } from "../project/capabilities.js";
import { formatUpgradePlan, upgradeProject } from "../project/upgrade.js";
import { normalizeWorkflowState } from "../workflow/stateMachine.js";
import { getRuntime, parseRuntimeTargets, runtimeCatalog } from "../runtime/catalog.js";
import { recommendRuntimes } from "../runtime/recommendation.js";
import { buildTaskGraph, formatTaskGraph } from "../task/taskGraph.js";
import { appendEvent, currentAttempt, EVENT_KINDS, EVENT_STATUSES, finishAttempt, readEvents, startAttempt } from "../task/events.js";
import { buildProjectStatus, formatProjectStatus, watchProjectStatus } from "../task/status.js";

const program = new Command();
program
  .name("bass")
  .description("BASS — agent runtime for natural-language, human-supervised software engineering.")
  .version(BASS_VERSION);

function requireProject(): { projectRoot: string; config: LoadedConfig } {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error("bass.yaml 을 찾을 수 없다. 프로젝트 루트에서 실행하거나 `bass init` 을 먼저 수행하라.");
    process.exit(2);
  }
  return { projectRoot, config: loadConfig({ projectRoot }) };
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function profiles(value: string, design: boolean): string[] {
  const selected = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (design && !selected.includes("web")) selected.push("web");
  return selected;
}

function printSetup(result: ReturnType<typeof setupProject>): void {
  console.log(`project: ${result.projectRoot} (${result.mode})`);
  console.log("BASS runtime: host package only; target package.json unchanged");
  for (const file of result.initialized.created) console.log(`created: ${file}`);
  for (const file of result.initialized.updated) console.log(`updated: ${file}`);
  for (const file of result.initialized.skipped) console.log(`preserved: ${file}`);
  for (const file of result.initialized.conflicts) console.log(`conflict: ${file}`);
  if (result.initialized.conflicts.length > 0) process.exitCode = 1;
}

async function runSetup(directory: string, opts: Record<string, unknown>): Promise<void> {
  const projectRoot = path.resolve(directory);
  const assignments = (opts["capability"] ?? []) as string[];
  const adapterAssignments = (opts["adapter"] ?? []) as string[];
  let capabilities = applyCapabilityAssignments(assignments);
  const adapters = applyAdapterAssignments(adapterAssignments);
  if (!opts["nonInteractive"] && process.stdin.isTTY && process.stdout.isTTY) {
    capabilities = await promptCapabilities(capabilities);
  }
  printSetup(setupProject({
    projectRoot,
    name: opts["name"] ? String(opts["name"]) : path.basename(projectRoot),
    profiles: profiles(String(opts["profiles"] ?? "common"), Boolean(opts["design"])),
    owner: String(opts["owner"] ?? "user"),
    withDesign: Boolean(opts["design"]),
    capabilities,
    adapters,
  }));
}

// ---------- setup / 0.2 aliases ----------
program
  .command("setup [directory]")
  .description("빈 폴더 생성과 기존 저장소 연결을 통합")
  .option("--name <name>", "프로젝트 이름")
  .option("--profiles <list>", "프로파일 목록", "common")
  .option("--owner <owner>", "작업 소유자", "user")
  .option("--design", "web 프로파일과 디자인 검증 활성화", false)
  .option("--non-interactive", "대화형 capability 선택 생략", false)
  .option("--capability <name=provider>", "capability 선택 (반복 가능)", collect, [])
  .option("--adapter <name=provider>", "runner/context/workspace/collaboration provider 선택", collect, [])
  .action(async (directory, opts) => runSetup(directory ? String(directory) : process.cwd(), opts));

program
  .command("create <directory>")
  .description("0.2 호환 alias; bass setup을 호출")
  .option("--name <name>")
  .option("--profiles <list>", "프로파일 목록", "common")
  .option("--owner <owner>", "작업 소유자", "user")
  .option("--design", "web 프로파일과 디자인 검증 활성화", false)
  .option("--non-interactive", "대화형 선택 생략", false)
  .option("--capability <name=provider>", "capability 선택", collect, [])
  .option("--adapter <name=provider>", "harness provider 선택", collect, [])
  .action(async (directory, opts) => runSetup(String(directory), opts));

program
  .command("init")
  .description("0.2 호환 alias; 현재 저장소에서 bass setup을 호출")
  .option("--name <name>")
  .option("--profiles <list>", "프로파일 목록", "common")
  .option("--owner <owner>", "작업 소유자", "user")
  .option("--design", "web 프로파일과 디자인 검증 활성화", false)
  .option("--non-interactive", "대화형 선택 생략", false)
  .option("--capability <name=provider>", "capability 선택", collect, [])
  .option("--adapter <name=provider>", "harness provider 선택", collect, [])
  .action(async (opts) => runSetup(process.cwd(), opts));

// ---------- config ----------
const configCmd = program.command("config").description("계층형 설정");
configCmd
  .command("explain")
  .description("최종 유효 설정과 각 값의 출처·override 이력 출력")
  .option("--env <env>", "환경 설정 적용")
  .option("--set <kv...>", "런타임 override (key=value)")
  .action((opts) => {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      console.error("bass.yaml not found");
      process.exit(2);
    }
    const config = loadConfig({
      projectRoot,
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.set ? { runtimeOverrides: parseSetArgs(opts.set) } : {}),
    });
    console.log(`profiles: ${config.bassYaml.bass.profiles.join(", ")}`);
    console.log(`layers (low -> high priority): ${config.layers.map((l) => l.name).join(" -> ")}`);
    console.log("");
    for (const entry of explainConfig(config)) {
      console.log(`${entry.key} = ${JSON.stringify(entry.value)}`);
      console.log(`  decided by: ${entry.layer} (${entry.source})`);
      for (const o of entry.overridden) {
        console.log(`  overrides: ${o.layer} = ${JSON.stringify(o.value)}`);
      }
    }
  });

// ---------- registry ----------
program
  .command("resolve <alias>")
  .description("모델 alias 를 실제 모델로 해석 (stable/candidate/pin)")
  .option("--channel <channel>", "stable | candidate", "stable")
  .option("--capabilities <list>", "필요 capability (쉼표 구분)")
  .action((alias, opts) => {
    const registry = loadRegistry();
    const resolution = resolveAlias(registry, alias, {
      channel: opts.channel,
      ...(opts.capabilities
        ? { requiredCapabilities: String(opts.capabilities).split(",").map((s: string) => s.trim()) as never }
        : {}),
    });
    console.log(JSON.stringify(resolution, null, 2));
  });

// ---------- route ----------
program
  .command("route <taskId>")
  .description("위험·capability 기반 모델 라우팅 권고")
  .option("--role <role>", "discovery|planner|worker|critic|evaluator|summarizer|documentation", "worker")
  .action((taskId, opts) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const models = (config.effective["models"] ?? {}) as Record<string, string>;
    const rec = routeTask(task, opts.role as ModelRole, models);
    console.log(JSON.stringify(rec, null, 2));
  });

// ---------- task ----------
const taskCmd = program.command("task").description("작업 명세 관리");
taskCmd
  .command("graph")
  .description("작업 의존성, ready 상태, owned path 충돌 검사")
  .option("--json", "기계 판독 JSON 출력", false)
  .action((opts) => {
    const { projectRoot } = requireProject();
    const graph = buildTaskGraph(listTasks(projectRoot));
    console.log(opts.json ? JSON.stringify(graph, null, 2) : formatTaskGraph(graph));
    process.exit(graph.valid ? 0 : 1);
  });
const attemptCmd = taskCmd.command("attempt").description("bounded 구현·검증 시도 관리");
attemptCmd
  .command("start <taskId>")
  .option("--parent <attempt>", "부모 시도 번호")
  .option("--json", "기계 판독 JSON 출력", false)
  .action((taskId, opts) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const result = startAttempt({
      projectRoot,
      task,
      plan: buildExecutionPlan(config, task),
      ...(opts.parent ? { parentAttempt: Number(opts.parent) } : {}),
    });
    console.log(opts.json ? JSON.stringify(result, null, 2) : `${result.changed ? "started" : "unchanged"}: ${taskId} attempt=${result.attempt}${result.reason ? ` (${result.reason})` : ""}`);
    if (result.blocked) process.exitCode = 1;
  });
attemptCmd
  .command("finish <taskId>")
  .requiredOption("--result <result>", "pass | fail | no-progress")
  .requiredOption("--summary <summary>", "한 줄 결과 요약")
  .option("--fingerprint <fingerprint>", "실패 지문")
  .option("--turns <turns>", "이번 시도에서 호스트가 보고한 turn 수")
  .option("--json", "기계 판독 JSON 출력", false)
  .action((taskId, opts) => {
    if (!["pass", "fail", "no-progress"].includes(String(opts.result))) throw new Error("--result must be pass, fail, or no-progress");
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const result = finishAttempt({
      projectRoot,
      task,
      plan: buildExecutionPlan(config, task),
      result: opts.result,
      summary: String(opts.summary),
      ...(opts.fingerprint ? { failureFingerprint: String(opts.fingerprint) } : {}),
      ...(opts.turns !== undefined ? { turns: Number(opts.turns) } : {}),
    });
    console.log(opts.json ? JSON.stringify(result, null, 2) : `finished: ${taskId} attempt=${result.attempt}${result.reason ? `; blocked=${result.reason}` : ""}`);
    if (result.blocked) process.exitCode = 1;
  });
taskCmd
  .command("new <taskId>")
  .description("에이전트가 표준 작업 파일을 멱등하게 준비")
  .requiredOption("--title <title>")
  .option("--if-missing", "이미 존재하면 성공한 no-op 으로 처리", false)
  .action((taskId, opts) => {
    const { projectRoot, config } = requireProject();
    const dest = path.join(taskDirectory(projectRoot), `${taskId}.md`);
    if (fs.existsSync(dest)) {
      if (opts.ifMissing) {
        console.log(`unchanged: ${dest}`);
        return;
      }
      console.error(`already exists: ${dest}`);
      process.exit(1);
    }
    const template = fs.readFileSync(path.join(templatesDir(), "task.md"), "utf8");
    const profile = config.bassYaml.bass.profiles[config.bassYaml.bass.profiles.length - 1]!;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(
      dest,
      template
        .replaceAll("{{TASK_ID}}", taskId)
        .replaceAll("{{TITLE}}", opts.title)
        .replaceAll("{{PROFILE}}", profile)
        .replaceAll("{{OWNER}}", "user"),
      "utf8",
    );
    console.log(`created: ${dest}`);
  });
taskCmd
  .command("transition <taskId> <state>")
  .description("에이전트가 내부 workflow 상태를 안전하고 멱등하게 전이")
  .action((taskId, state) => {
    const { projectRoot } = requireProject();
    const result = transitionTask(projectRoot, taskId, String(state).toUpperCase() as WorkflowState);
    console.log(
      `${result.changed ? "updated" : "unchanged"}: ${result.taskId} ${result.from} -> ${result.to}`,
    );
  });
taskCmd
  .command("finalize <taskId>")
  .description("최종 승인과 완료 근거를 검사한 뒤 DONE 으로 멱등하게 전이")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    if (task.frontmatter.status === "DONE") {
      console.log(`unchanged: ${taskId} is already DONE`);
      return;
    }
    const report = preCompleteGate(task, { projectRoot, effective: config.effective, executionPlan: buildExecutionPlan(config, task) });
    console.log(formatGateReport(report));
    if (!report.passed) {
      process.exitCode = 1;
      return;
    }
    const result = transitionTask(projectRoot, taskId, "DONE");
    if (result.changed) {
      appendEvent(projectRoot, { task_id: taskId, kind: "task.completed", status: "pass", summary: "task finalized as DONE" });
    }
    console.log(`${result.changed ? "updated" : "unchanged"}: ${taskId} -> DONE`);
  });

// ---------- event / status ----------
const eventCmd = program.command("event").description("구조화된 BASS 활동 이벤트 기록");
eventCmd
  .command("append <taskId> <kind>")
  .requiredOption("--summary <summary>", "한 줄 요약; transcript와 비밀정보 금지")
  .option("--status <status>", "pass | fail | skipped | error")
  .option("--name <name>", "evaluator, critic, evidence 이름")
  .option("--attempt <attempt>", "관련 시도 번호")
  .action((taskId, kind, opts) => {
    const allowed = new Set(["evaluation.completed", "critic.completed", "evidence.recorded"]);
    if (!allowed.has(String(kind))) throw new Error(`event append accepts only: ${[...allowed].join(", ")}`);
    if (!EVENT_KINDS.includes(kind)) throw new Error(`invalid event kind: ${kind}`);
    if (opts.status && !EVENT_STATUSES.includes(opts.status)) throw new Error(`invalid event status: ${opts.status}`);
    const { projectRoot } = requireProject();
    findTask(projectRoot, taskId);
    const openAttempt = currentAttempt(readEvents(projectRoot).events, taskId);
    const event = appendEvent(projectRoot, {
      task_id: taskId,
      kind,
      summary: String(opts.summary),
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.name ? { name: String(opts.name) } : {}),
      ...(opts.attempt ? { attempt: Number(opts.attempt) } : openAttempt ? { attempt: openAttempt } : {}),
    });
    console.log(JSON.stringify(event));
  });

program
  .command("status")
  .description("작업, 시도, 검증, evidence, 비용 상태 표시")
  .option("--json", "기계 판독 JSON 출력", false)
  .option("--watch", "변경된 상태를 1초 간격으로 출력", false)
  .action(async (opts) => {
    const { projectRoot, config } = requireProject();
    const read = (): ReturnType<typeof buildProjectStatus> => buildProjectStatus(projectRoot, config);
    const emit = (status: ReturnType<typeof buildProjectStatus>): void =>
      console.log(opts.json ? JSON.stringify(status) : formatProjectStatus(status));
    if (!opts.watch) {
      emit(read());
      return;
    }
    const controller = new AbortController();
    const stop = (): void => controller.abort();
    process.once("SIGINT", stop);
    await watchProjectStatus(read, emit, { signal: controller.signal });
    process.off("SIGINT", stop);
  });
taskCmd
  .command("validate [taskId]")
  .description("작업 파일 스키마·섹션 검증 (미지정 시 전체)")
  .action((taskId) => {
    const { projectRoot } = requireProject();
    const tasks = taskId ? [findTask(projectRoot, taskId)] : listTasks(projectRoot);
    if (tasks.length === 0) console.log("no tasks found under .bass/tasks/ or legacy tasks/");
    let failed = false;
    for (const t of tasks) {
      const missing = checkSections(t, TASK_SECTIONS).filter((c) => !c.present);
      const status = t.frontmatter.status;
      console.log(`${t.frontmatter.id} [${status}] ${t.frontmatter.title}`);
      console.log(`  next states: ${allowedTransitions(status).join(", ") || "(terminal)"}`);
      if (missing.length > 0) {
        console.log(`  missing sections: ${missing.map((m) => m.section).join(", ")}`);
      }
      if (status === "CAPTURED") {
        const empty = checkSections(t, ["Problem", "What we are shipping", "What we are not shipping", "Acceptance criteria"]).filter((c) => !c.nonEmpty);
        if (empty.length > 0) {
          failed = true;
          console.log(`  CAPTURED 위반: 비어 있는 필수 섹션 — ${empty.map((e) => e.section).join(", ")}`);
        }
      }
    }
    process.exit(failed ? 1 : 0);
  });

// ---------- gate ----------
const gateCmd = program.command("gate").description("인간 감독 게이트");
gateCmd
  .command("pre-task <taskId>")
  .description("작업 시작 가능 여부 검사 (CAPTURED 계약 + 위험 승인)")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const report = preTaskGate(task, { projectRoot, effective: config.effective, executionPlan: buildExecutionPlan(config, task) });
    console.log(formatGateReport(report));
    process.exit(report.passed ? 0 : 1);
  });
gateCmd
  .command("pre-review <taskId>")
  .description("사람에게 결과를 제시하기 전 검증·critic·렌더링 근거 준비 상태 검사")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const report = preReviewGate(task, { projectRoot, effective: config.effective, executionPlan: buildExecutionPlan(config, task) });
    console.log(formatGateReport(report));
    process.exit(report.passed ? 0 : 1);
  });
gateCmd
  .command("pre-complete <taskId>")
  .description("DONE 처리 가능 여부 검사 (run record + DONE 조건)")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const report = preCompleteGate(task, { projectRoot, effective: config.effective, executionPlan: buildExecutionPlan(config, task) });
    console.log(formatGateReport(report));
    process.exit(report.passed ? 0 : 1);
  });

// ---------- approval ----------
const approvalCmd = program
  .command("approval")
  .description("사람이 명시적으로 내린 위험·최종 결정을 에이전트가 기록");
approvalCmd
  .command("risk <taskId>")
  .requiredOption("--rule <ruleId>", "정책 rule id")
  .requiredOption("--decision <decision>", "approved | rejected")
  .requiredOption("--approver <name>", "명시적으로 결정한 사람")
  .requiredOption("--reason <reason>", "결정 이유")
  .description("사전 위험 결정을 보존하며 멱등하게 기록")
  .action((taskId, opts) => {
    const { projectRoot } = requireProject();
    const task = findTask(projectRoot, taskId);
    const triggeredRuleIds = findRequiredApprovals(task.frontmatter).map((approval) => approval.rule.id);
    if (!triggeredRuleIds.includes(String(opts.rule))) {
      throw new Error(
        `Approval rule "${opts.rule}" is not triggered by ${taskId}. Triggered rules: ${triggeredRuleIds.join(", ") || "(none)"}`,
      );
    }
    const decision = String(opts.decision);
    if (decision !== "approved" && decision !== "rejected") {
      throw new Error(`Invalid decision "${decision}" (expected approved or rejected)`);
    }
    const result = recordRiskApproval({
      projectRoot,
      taskId,
      ruleId: String(opts.rule),
      decision,
      approver: String(opts.approver),
      reason: String(opts.reason),
    });
    console.log(
      `${result.changed ? "recorded" : "unchanged"}: ${result.approval.rule_id} ${result.approval.decision} by ${result.approval.approver}`,
    );
  });
approvalCmd
  .command("final <taskId>")
  .requiredOption("--approver <name>", "결과를 승인한 사람")
  .option("--notes <notes>", "승인 메모")
  .description("pre-review 이후 사람의 최종 결과 승인을 멱등하게 기록")
  .action((taskId, opts) => {
    const { projectRoot } = requireProject();
    const task = findTask(projectRoot, taskId);
    if (normalizeWorkflowState(task.frontmatter.status) !== "REVIEW") {
      throw new Error(`Final approval requires REVIEW status (current: ${task.frontmatter.status})`);
    }
    const result = recordFinalApproval(
      projectRoot,
      taskId,
      String(opts.approver),
      opts.notes ? String(opts.notes) : undefined,
    );
    console.log(`${result.changed ? "recorded" : "unchanged"}: final approval by ${opts.approver}`);
  });

// ---------- agent ----------
const agentCmd = program
  .command("agent")
  .description("AI 도구가 자연어 요청을 BASS 내부 실행으로 연결할 때 사용하는 인터페이스");
agentCmd
  .command("guide [taskId]")
  .option("--json", "기계 판독 JSON 출력", false)
  .description("현재 프로젝트·작업에 맞는 실행 계약과 다음 행동 제안")
  .action((taskId, opts) => {
    const { projectRoot, config } = requireProject();
    const task = taskId ? findTask(projectRoot, String(taskId)) : undefined;
    const guide = buildAgentGuide(projectRoot, config, task);
    if (opts.json) {
      console.log(JSON.stringify(guide, null, 2));
      return;
    }
    console.log("BASS agent contract");
    console.log(`  user interface: ${guide.contract.user_interface}`);
    console.log(`  CLI operator: ${guide.contract.cli_operator}`);
    console.log(`  project: ${guide.project.name} (${guide.project.profiles.join(", ")})`);
    console.log(`  design spec: ${guide.project.design_spec}`);
    for (const rule of guide.operating_rules) console.log(`  - ${rule}`);
    if (guide.task) {
      console.log(`  task: ${guide.task.id} [${guide.task.status}] depth=${guide.task.workflow_depth}`);
      for (const action of guide.task.suggested_next_actions) console.log(`  next: ${action}`);
    }
    const limits = guide.execution_plan.loop;
    console.log(`  execution: ${guide.execution_plan.taskKind}/${guide.execution_plan.depth}; levels=${guide.execution_plan.verificationLevels.join(",")}; turns<=${limits.maxTurns}; attempts<=${limits.maxAttempts}; minutes<=${limits.maxMinutes}; agents<=${guide.execution_plan.parallel.maxAgents}`);
    for (const lock of guide.execution_plan.scopeLock) console.log(`  scope lock: ${lock}`);
  });

// ---------- evaluate ----------
program
  .command("evaluate")
  .description("ExecutionPlan에 따라 필요한 평가기만 실행")
  .option("--task <taskId>", "작업 실행 계획 사용")
  .option("--levels <list>", "디버깅/CI용 명시적 레벨 override")
  .action((opts) => {
    const { projectRoot, config } = requireProject();
    const task = opts.task ? findTask(projectRoot, String(opts.task)) : undefined;
    const executionPlan = buildExecutionPlan(config, task);
    const override = opts.levels
      ? String(opts.levels).split(",").map((value: string) => Number(value.trim()))
      : undefined;
    if (override?.some((level: number) => ![1, 2, 3].includes(level))) throw new Error("--levels must contain only 1,2,3");
    const allPlans = planEvaluators(config.effective);
    const selected = override
      ? allPlans
      : selectEvaluatorPlans(allPlans, executionPlan, config.bassYaml.execution.verification);
    const attempt = task ? currentAttempt(readEvents(projectRoot).events, task.frontmatter.id) : null;
    const results = runEvaluators(selected, projectRoot, {
      ...(override ? { levels: override as Array<1 | 2 | 3> } : {}),
      reusePassing: true,
      ...(task ? {
        evidenceDir: path.join(projectRoot, ".bass", "evidence", task.frontmatter.id, `attempt-${attempt ?? "untracked"}`),
      } : {}),
    });
    if (task) {
      for (const result of results) {
        appendEvent(projectRoot, {
          task_id: task.frontmatter.id,
          ...(attempt ? { attempt } : {}),
          kind: "evaluation.completed",
          status: result.status === "timeout" ? "error" : result.status,
          name: result.name,
          summary: `${result.name} ${result.status}`,
          duration_ms: result.durationMs,
        });
        if (result.evidencePath) {
          appendEvent(projectRoot, {
            task_id: task.frontmatter.id,
            ...(attempt ? { attempt } : {}),
            kind: "evidence.recorded",
            status: "pass",
            name: `evaluation-log:${result.name}`,
            summary: `evaluation log recorded: ${result.evidencePath}`,
          });
        }
      }
    }
    console.log(formatEvaluatorResults(results));
    process.exit(results.some((r) => r.status === "fail" || r.status === "error" || r.status === "timeout") ? 1 : 0);
  });

// ---------- compose ----------
program
  .command("compose")
  .description("base + role + profile + project + policy + task 지침 조합 (출처 주석 포함)")
  .option("--role <role>", "roles/ 의 워크플로 역할")
  .option("--critic <critic>", "critics/ 의 비판 역할")
  .option("--task <taskId>", "작업 명세 포함")
  .action((opts) => {
    const { projectRoot, config } = requireProject();
    const task = opts.task ? findTask(projectRoot, opts.task) : undefined;
    console.log(
      composeInstructions({
        projectRoot,
        config,
        ...(opts.role ? { role: opts.role } : {}),
        ...(opts.critic ? { critic: opts.critic } : {}),
        ...(task ? { task } : {}),
      }),
    );
  });

// ---------- critique ----------
const critiqueCmd = program.command("critique").description("critic 산출물 검증");
critiqueCmd
  .command("validate <file>")
  .description("finding 파일의 스키마·프로토콜 준수 검증")
  .action((file) => {
    const { file: parsed, issues } = validateFindingsFile(file);
    if (parsed) {
      console.log(`critic=${parsed.critic} task=${parsed.task_id} iteration=${parsed.iteration} findings=${parsed.findings.length}${parsed.no_issues_found ? " (no issues)" : ""}`);
    }
    for (const issue of issues) {
      console.log(`  [PROTOCOL] ${issue.index !== null ? `finding[${issue.index}]: ` : ""}${issue.problem}`);
    }
    process.exit(issues.length > 0 ? 1 : 0);
  });
critiqueCmd
  .command("stop <dir>")
  .description("iteration finding 파일들로 반복 종료 여부 판정")
  .action((dir) => {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .sort();
    const iterations = files.map((f) => {
      const parsed = findingsFileSchema.safeParse(parse(fs.readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`invalid findings file: ${f}`);
      return parsed.data;
    });
    iterations.sort((a, b) => a.iteration - b.iteration);
    const decision = shouldStopIteration(iterations);
    console.log(`stop: ${decision.stop}`);
    for (const r of decision.reasons) console.log(`  - ${r}`);
  });

// ---------- design ----------
const runtimeCmd = program.command("runtime").description("일반 game runtime 추천·doctor·scaffold·install·verify");
runtimeCmd
  .command("list")
  .description("내장 runtime adapter 목록")
  .action(() => console.log(JSON.stringify(runtimeCatalog().map((adapter) => adapter.descriptor()), null, 2)));
runtimeCmd
  .command("recommend")
  .description("검토 가능한 결정식으로 runtime 추천")
  .option("--dimension <value>", "2d | 3d | either", "either")
  .option("--targets <list>", "web,android,ios,macos", "web")
  .option("--existing <list>", "기존 dependency 또는 runtime id", "")
  .option("--team-ready <list>", "팀 준비가 확인된 runtime id", "")
  .option("--deployment <value>", "web | native | hybrid", "web")
  .action((opts) => {
    if (!["2d", "3d", "either"].includes(opts.dimension)) throw new Error("--dimension must be 2d, 3d, or either");
    if (!["web", "native", "hybrid"].includes(opts.deployment)) throw new Error("--deployment must be web, native, or hybrid");
    const recommendations = recommendRuntimes(
      {
        dimension: opts.dimension,
        targets: parseRuntimeTargets(opts.targets),
        existingDependencies: String(opts.existing).split(",").map((item) => item.trim()).filter(Boolean),
        teamReadyRuntimeIds: String(opts.teamReady).split(",").map((item) => item.trim()).filter(Boolean),
        deployment: opts.deployment,
      },
      runtimeCatalog().map((adapter) => adapter.descriptor()),
    );
    console.log(JSON.stringify(recommendations, null, 2));
  });
runtimeCmd
  .command("doctor <runtimeId>")
  .option("--targets <list>", "검사 대상", "web")
  .action((runtimeId, opts) => {
    const { projectRoot } = requireProject();
    const report = getRuntime(runtimeId).doctor({ projectRoot, targets: parseRuntimeTargets(opts.targets) });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "fail" ? 1 : 0);
  });
runtimeCmd
  .command("scaffold <runtimeId>")
  .requiredOption("--destination <path>", "프로젝트 루트 아래 생성 경로")
  .option("--targets <list>", "생성 대상", "web")
  .option("--name <name>", "게임 프로젝트 이름", "bass-game")
  .option("--confirm", "사용자가 runtime과 경로를 명시적으로 선택함", false)
  .action((runtimeId, opts) => {
    if (!opts.confirm) throw new Error("Scaffold requires explicit user selection; rerun with --confirm after approval.");
    const { projectRoot } = requireProject();
    const report = getRuntime(runtimeId).scaffold({ projectRoot, destination: opts.destination, targets: parseRuntimeTargets(opts.targets), projectName: opts.name });
    console.log(JSON.stringify(report, null, 2));
    process.exit(["conflict", "failed"].includes(report.status) ? 1 : 0);
  });
runtimeCmd
  .command("install <runtimeId>")
  .requiredOption("--path <path>", "runtime 프로젝트 경로")
  .option("--confirm", "사용자가 설치를 명시적으로 승인함", false)
  .action((runtimeId, opts) => {
    if (!opts.confirm) throw new Error("Install requires explicit approval; rerun with --confirm.");
    const { projectRoot } = requireProject();
    const runtimeRoot = childPath(projectRoot, opts.path);
    const report = getRuntime(runtimeId).install(runtimeRoot);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "failed" ? 1 : 0);
  });
runtimeCmd
  .command("verify <runtimeId>")
  .requiredOption("--path <path>", "runtime 프로젝트 경로")
  .option("--targets <list>", "검증 대상", "web")
  .action((runtimeId, opts) => {
    const { projectRoot } = requireProject();
    const report = getRuntime(runtimeId).verify(childPath(projectRoot, opts.path), parseRuntimeTargets(opts.targets));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "fail" ? 1 : 0);
  });

function childPath(root: string, candidate: string): string {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path must be inside project root: ${candidate}`);
  return resolved;
}

// ---------- design ----------
const designCmd = program.command("design").description("Design Profile 검사·교정 루프");
designCmd
  .command("check")
  .description("DESIGN.md 존재, 토큰 일관성, 상태 완결성 검사")
  .action(() => {
    const { projectRoot, config } = requireProject();
    const checks = runDesignChecks({ projectRoot, effective: config.effective });
    for (const c of checks) {
      console.log(`  [${c.status.toUpperCase()}] ${c.id} — ${c.description}${c.detail ? ` (${c.detail})` : ""}`);
    }
    process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);
  });
const correctionCmd = designCmd.command("correction").description("디자인 교정 학습 루프 (pending -> human review)");
correctionCmd
  .command("add <rule>")
  .option("--evidence <list>", "근거 (쉼표 구분)", "")
  .description("교정을 pending 으로 기록 (즉시 규칙화하지 않음)")
  .action((rule, opts) => {
    const { projectRoot } = requireProject();
    const evidence = String(opts.evidence).split(",").map((s: string) => s.trim()).filter(Boolean);
    const c = addCorrection(projectRoot, rule, evidence);
    console.log(`recorded pending correction #${c.id}: ${c.rule}`);
    console.log("인간 승인 후 `bass design correction review` 로 상태를 갱신하고 DESIGN.md 에 직접 반영하라.");
  });
correctionCmd
  .command("list")
  .action(() => {
    const { projectRoot } = requireProject();
    for (const c of loadCorrections(projectRoot)) {
      console.log(`#${c.id} [${c.status}] ${c.rule}${c.evidence.length ? ` (evidence: ${c.evidence.join("; ")})` : ""}`);
    }
  });
correctionCmd
  .command("review <id>")
  .requiredOption("--decision <decision>", "approved | rejected")
  .option("--reviewer <name>", "검토자", "user")
  .action((id, opts) => {
    const { projectRoot } = requireProject();
    const c = reviewCorrection(projectRoot, Number(id), opts.decision, opts.reviewer);
    console.log(`correction #${c.id} -> ${c.status} (by ${c.reviewer})`);
    if (c.status === "approved") {
      console.log("승인됨. DESIGN.md 의 해당 섹션에 규칙을 직접 반영하고 ADR 필요 여부를 판단하라.");
    }
  });

// ---------- doctor ----------
program
  .command("doctor")
  .description("연결 상태와 선택 capability의 실제 호스트 상태 검사")
  .option("--capabilities", "capability 상태만 자세히 표시", false)
  .action((opts) => {
    const { projectRoot, config } = requireProject();
    if (opts.capabilities) {
      const statuses = inspectProviders(config.bassYaml);
      console.log(formatCapabilityStatuses(statuses));
      process.exit(providerFailed(statuses) ? 1 : 0);
      return;
    }
    const checks = doctor(projectRoot, config.effective);
    for (const c of checks) {
      console.log(`  [${c.status.toUpperCase()}] ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    const providers = inspectProviders(config.bassYaml).filter((status) => status.state !== "builtin" && status.state !== "off");
    for (const provider of providers) {
      const state = provider.state === "missing" || provider.state === "unauthenticated" || provider.sessionActive === false
        ? "FAIL"
        : provider.sessionActive === null
          ? "WARN"
          : "PASS";
      console.log(`  [${state}] provider:${provider.capability} — ${provider.detail}`);
    }
    process.exit(checks.some((c) => c.status === "fail") || providerFailed(providers) ? 1 : 0);
  });

function providerFailed(statuses: ReturnType<typeof inspectProviders>): boolean {
  return statuses.some((status) =>
    status.state === "missing" || status.state === "unauthenticated" || status.sessionActive === false,
  );
}

program
  .command("upgrade")
  .description("이전 저장소를 사용자 파일을 보존하며 0.4 계약으로 마이그레이션")
  .option("--check", "읽기 전용 변경 계획 표시", false)
  .option("--apply", "계획 적용", false)
  .action((opts) => {
    if (opts.check && opts.apply) throw new Error("Choose either --check or --apply");
    const projectRoot = findProjectRoot();
    if (!projectRoot) throw new Error("bass.yaml not found");
    console.log(formatUpgradePlan(upgradeProject(projectRoot, Boolean(opts.apply))));
  });

try {
  await program.parseAsync();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
