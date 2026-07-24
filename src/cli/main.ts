#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { findProjectRoot, templatesDir } from "../paths.js";
import { loadConfig, explainConfig, parseSetArgs, type LoadedConfig } from "../config/loader.js";
import { loadRegistry, resolveAlias } from "../registry/registry.js";
import { routeTask } from "../router/router.js";
import { findTask, listTasks, checkSections, TASK_SECTIONS } from "../task/taskFile.js";
import { preTaskGate, preCompleteGate, formatGateReport } from "../workflow/gates.js";
import { allowedTransitions } from "../workflow/stateMachine.js";
import { planEvaluators, runEvaluators, formatEvaluatorResults } from "../evaluators/runner.js";
import { validateFindingsFile, shouldStopIteration, findingsFileSchema } from "../critics/findings.js";
import { composeInstructions } from "../compose/composer.js";
import { runDesignChecks, addCorrection, loadCorrections, reviewCorrection } from "../design/designProfile.js";
import { initProject, doctor } from "../project/init.js";
import { initNanPreset } from "../nan/project.js";
import { registerNanCommands } from "../nan/cli.js";
import { parse } from "yaml";
import type { ModelRole } from "../types.js";
import { BASS_DISPLAY_NAME, BASS_VERSION } from "../version.js";

const program = new Command();
program
  .name("bass")
  .description(`${BASS_DISPLAY_NAME}. A runtime for human-supervised AI software engineering.`)
  .version(BASS_VERSION);

function requireProject(): { projectRoot: string; config: LoadedConfig } {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error("bass.yaml 을 찾을 수 없다. 프로젝트 루트에서 실행하거나 `bass init` 을 먼저 수행하라.");
    process.exit(2);
  }
  return { projectRoot, config: loadConfig({ projectRoot }) };
}

// ---------- init ----------
program
  .command("init")
  .description("프로젝트에 BASS 연결: bass.yaml + 에이전트 shim (Codex/Cursor/Claude) 생성")
  .option("--name <name>", "프로젝트 이름 (생략 시 현재 디렉터리 이름)")
  .option("--profiles <list>", "프로파일 목록 (쉼표 구분)")
  .option("--preset <preset>", "초기화 preset (nan2026)")
  .option("--owner <owner>", "작업 소유자", "user")
  .option("--design", "Design Profile 활성화 (DESIGN.md 템플릿 생성)", false)
  .option("--force", "기존 파일 덮어쓰기", false)
  .action((opts) => {
    if (opts.preset && opts.preset !== "nan2026") {
      throw new Error(`Unknown preset "${opts.preset}"`);
    }
    if (opts.preset === "nan2026" && opts.force) {
      throw new Error("NAN preset does not allow --force; preserve conflicts and resolve them explicitly.");
    }
    const name = opts.name ? String(opts.name) : path.basename(process.cwd());
    const profiles = opts.profiles
      ? String(opts.profiles).split(",").map((s: string) => s.trim())
      : opts.preset === "nan2026"
        ? ["common", "nan2026"]
        : ["common"];
    const result = initProject({
      projectRoot: process.cwd(),
      name,
      profiles,
      owner: opts.owner,
      withDesign: Boolean(opts.design),
      force: Boolean(opts.force),
    });
    for (const f of result.created) console.log(`created: ${f}`);
    for (const f of result.skipped) console.log(`skipped (exists): ${f}`);
    if (opts.preset === "nan2026") {
      const nan = initNanPreset(process.cwd());
      for (const f of nan.created) console.log(`created: ${f}`);
      for (const f of nan.updated) console.log(`updated: ${f}`);
      for (const f of nan.unchanged) console.log(`unchanged: ${f}`);
      for (const f of nan.conflicts) console.log(`conflict (preserved): ${f}`);
      if (nan.conflicts.length > 0) process.exitCode = 1;
    }
  });

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
  .option("--role <role>", "discovery|planner|worker|critic|summarizer|documentation", "worker")
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
  .command("new <taskId>")
  .description("표준 템플릿으로 작업 파일 생성")
  .requiredOption("--title <title>")
  .action((taskId, opts) => {
    const { projectRoot, config } = requireProject();
    const dest = path.join(projectRoot, "tasks", `${taskId}.md`);
    if (fs.existsSync(dest)) {
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
  .command("validate [taskId]")
  .description("작업 파일 스키마·섹션 검증 (미지정 시 전체)")
  .action((taskId) => {
    const { projectRoot } = requireProject();
    const tasks = taskId ? [findTask(projectRoot, taskId)] : listTasks(projectRoot);
    if (tasks.length === 0) console.log("no tasks found under tasks/");
    let failed = false;
    for (const t of tasks) {
      const missing = checkSections(t, TASK_SECTIONS).filter((c) => !c.present);
      const status = t.frontmatter.status;
      console.log(`${t.frontmatter.id} [${status}] ${t.frontmatter.title}`);
      console.log(`  next states: ${allowedTransitions(status).join(", ") || "(terminal)"}`);
      if (missing.length > 0) {
        console.log(`  missing sections: ${missing.map((m) => m.section).join(", ")}`);
      }
      if (status === "READY" || status === "PLANNED") {
        const empty = checkSections(t, ["Problem", "What we are shipping", "What we are not shipping", "Acceptance criteria"]).filter((c) => !c.nonEmpty);
        if (empty.length > 0) {
          failed = true;
          console.log(`  READY 위반: 비어 있는 필수 섹션 — ${empty.map((e) => e.section).join(", ")}`);
        }
      }
    }
    process.exit(failed ? 1 : 0);
  });

// ---------- gate ----------
const gateCmd = program.command("gate").description("인간 감독 게이트");
gateCmd
  .command("pre-task <taskId>")
  .description("작업 시작 가능 여부 검사 (READY 조건 + 승인 조건)")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const report = preTaskGate(task, { projectRoot, effective: config.effective });
    console.log(formatGateReport(report));
    process.exit(report.passed ? 0 : 1);
  });
gateCmd
  .command("pre-complete <taskId>")
  .description("DONE 처리 가능 여부 검사 (run record + DONE 조건)")
  .action((taskId) => {
    const { projectRoot, config } = requireProject();
    const task = findTask(projectRoot, taskId);
    const report = preCompleteGate(task, { projectRoot, effective: config.effective });
    console.log(formatGateReport(report));
    process.exit(report.passed ? 0 : 1);
  });

// ---------- evaluate ----------
program
  .command("evaluate")
  .description("프로젝트가 선언한 평가기(Level 1~3) 실행")
  .option("--levels <list>", "실행할 레벨 (예: 1,2)", "1,2,3")
  .action((opts) => {
    const { projectRoot, config } = requireProject();
    const levels = String(opts.levels).split(",").map((s: string) => Number(s.trim())) as Array<1 | 2 | 3>;
    const results = runEvaluators(planEvaluators(config.effective), projectRoot, { levels });
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
  .description("shim 존재·참조 유효성·드리프트 검사")
  .action(() => {
    const { projectRoot, config } = requireProject();
    const checks = doctor(projectRoot, config.effective);
    for (const c of checks) {
      console.log(`  [${c.status.toUpperCase()}] ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);
  });

registerNanCommands(program, () => requireProject().projectRoot);

try {
  program.parse();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
