import path from "node:path";
import type { Command } from "commander";
import { recommendRuntimes } from "./domain/recommendation.js";
import {
  getRuntime,
  loadConcept,
  parseTargets,
  runtimeCatalog,
} from "./runtimeCatalog.js";
import {
  loadCertifications,
  lockProtectedFiles,
  recordAttempt,
  saveCertification,
  saveVerification,
  selectRuntime,
  validateProjectTrace,
  verifyProtectedFiles,
  writeEvidenceReport,
} from "./project.js";
import { relativeProjectPath } from "./managedFiles.js";
import { targetAdapters } from "./adapters/capacitor.js";

function failWhen(condition: boolean): void {
  if (condition) process.exitCode = 1;
}

export function registerNanCommands(program: Command, requireProjectRoot: () => string): void {
  const nan = program.command("nan").description("NAN 2026 theme-to-prototype decision and evidence harness");
  const runtime = nan.command("runtime").description("Runtime adapter catalog, recommendation, and certification");

  runtime
    .command("list")
    .description("List built-in and project custom runtime adapters")
    .action(() => {
      const root = requireProjectRoot();
      for (const adapter of runtimeCatalog(root)) {
        const item = adapter.descriptor();
        console.log(
          `${item.id}\t${item.kind}\t${item.supportedTargets.join(",")}\t${item.license}\t${item.description}`,
        );
      }
      for (const adapter of targetAdapters()) {
        const item = adapter.descriptor();
        console.log(`${item.id}\ttarget\t${item.targets.join(",")}\t${item.description}`);
      }
    });

  runtime
    .command("recommend")
    .requiredOption("--concept <id>", "Concept id, e.g. CON-001")
    .description("Score runtimes against the concept using the documented 100-point rubric")
    .action((opts) => {
      const root = requireProjectRoot();
      const concept = loadConcept(root, opts.concept);
      const ready = new Set(
        Object.values(loadCertifications(root).records)
          .filter((record) => record.status === "certified")
          .map((record) => record.runtime),
      );
      const recommendations = recommendRuntimes(
        concept,
        runtimeCatalog(root).map((adapter) => adapter.descriptor()),
        ready,
      );
      for (const item of recommendations) {
        console.log(`${item.runtime.id}\t${item.score}/100`);
        console.log(`  ${JSON.stringify(item.breakdown)}`);
        for (const reason of item.reasons) console.log(`  - ${reason}`);
      }
      console.log("Human approval is required before selecting the final runtime.");
    });

  runtime
    .command("doctor")
    .requiredOption("--runtime <id>")
    .option("--targets <list>", "web,android,ios,macos", "web")
    .description("Check local tools without installing or changing the system")
    .action((opts) => {
      const root = requireProjectRoot();
      const report = getRuntime(opts.runtime, root).doctor({
        projectRoot: root,
        targets: parseTargets(opts.targets),
      });
      console.log(`${report.runtime}: ${report.status}`);
      for (const check of report.checks) console.log(`  [${check.status}] ${check.id} — ${check.detail}`);
      failWhen(report.status !== "pass");
    });

  runtime
    .command("certify <runtimeId>")
    .option("--targets <list>", "web,android,ios,macos", "web")
    .option("--approve-risk <reviewer>", "Named human who accepts use of an uncertified runtime")
    .option("--reason <reason>", "Risk acceptance reason")
    .description("Record local readiness; unexecuted targets remain not-verified")
    .action((runtimeId, opts) => {
      const root = requireProjectRoot();
      const targets = parseTargets(opts.targets);
      const report = getRuntime(runtimeId, root).doctor({ projectRoot: root, targets });
      const approval = opts.approveRisk
        ? { reviewer: String(opts.approveRisk), reason: String(opts.reason ?? "explicit human risk acceptance") }
        : undefined;
      const record = saveCertification(root, runtimeId, targets, report, approval);
      console.log(JSON.stringify(record, null, 2));
      failWhen(record.status !== "certified");
    });

  runtime
    .command("apply <runtimeId>")
    .option("--targets <list>", "web,android,ios,macos", "web")
    .option("--dest <path>", "Project-relative destination", "game")
    .option("--install", "Run the adapter package installation after scaffolding", false)
    .option("--approve-risk <reviewer>", "Named human accepting an uncertified runtime")
    .option("--reason <reason>", "Risk acceptance reason")
    .description("Select and idempotently scaffold a runtime adapter")
    .action((runtimeId, opts) => {
      const root = requireProjectRoot();
      const targets = parseTargets(opts.targets);
      const approval = opts.approveRisk
        ? { reviewer: String(opts.approveRisk), reason: String(opts.reason ?? "explicit human risk acceptance") }
        : undefined;
      selectRuntime(root, runtimeId, targets, approval);
      const destination = relativeProjectPath(root, opts.dest);
      const adapter = getRuntime(runtimeId, root);
      const report = adapter.scaffold({
        projectRoot: root,
        destination,
        targets,
        projectName: path.basename(root),
      });
      console.log(JSON.stringify(report, null, 2));
      if (opts.install && report.status !== "failed" && report.status !== "conflict") {
        const install = adapter.install(path.join(root, destination));
        console.log(JSON.stringify(install, null, 2));
        failWhen(install.status === "failed");
      }
      failWhen(report.status === "failed" || report.status === "conflict");
    });

  runtime
    .command("verify <runtimeId>")
    .option("--targets <list>", "web,android,ios,macos", "web")
    .option("--dest <path>", "Project-relative destination", "game")
    .description("Execute available build checks; unavailable targets remain not-verified")
    .action((runtimeId, opts) => {
      const root = requireProjectRoot();
      const destination = relativeProjectPath(root, opts.dest);
      const report = getRuntime(runtimeId, root).verify(
        path.join(root, destination),
        parseTargets(opts.targets),
      );
      saveVerification(root, report);
      console.log(JSON.stringify(report, null, 2));
      failWhen(report.status !== "pass");
    });

  const concept = nan.command("concept").description("Concept gate");
  concept
    .command("gate <conceptId>")
    .description("Validate the six axes, seven hard gates, score, and human approval")
    .action((conceptId) => {
      const root = requireProjectRoot();
      const value = loadConcept(root, conceptId);
      const failed = Object.entries(value.hardGates).filter(([, passed]) => !passed);
      const score = Object.values(value.score).reduce((sum, item) => sum + item, 0);
      console.log(`${value.id}: ${failed.length === 0 && value.approvedBy ? "pass" : "needs-human"}`);
      console.log(`  score: ${score}/100`);
      for (const [gate] of failed) console.log(`  [fail] ${gate}`);
      if (!value.approvedBy) console.log("  [needs-human] approvedBy is missing");
      failWhen(failed.length > 0 || !value.approvedBy || score > 100);
    });

  const trace = nan.command("trace").description("Theme-to-evidence traceability");
  trace
    .command("validate")
    .description("Reject duplicate ids, dead links, and orphan trace items")
    .action(() => {
      const issues = validateProjectTrace(requireProjectRoot());
      if (issues.length === 0) console.log("trace PASS");
      for (const issue of issues) console.log(`[${issue.type}] ${issue.id} — ${issue.detail}`);
      failWhen(issues.length > 0);
    });

  const evidence = nan.command("evidence").description("Deterministic evidence reporting");
  evidence
    .command("report")
    .description("Generate evidence/report.json with stable file checksums")
    .action(() => {
      const report = writeEvidenceReport(requireProjectRoot());
      console.log(`evidence files: ${report.files.length}`);
      console.log(`checksum: ${report.checksum}`);
    });

  const session = nan.command("session").description("Session charter protection");
  session
    .command("lock")
    .description("Lock gates, agent shims, and acceptance criteria at session start")
    .action(() => {
      const lock = lockProtectedFiles(requireProjectRoot());
      console.log(`locked ${lock.files.length} protected files`);
    });

  const protect = nan.command("protect").description("Verify locked charter files");
  protect
    .command("verify")
    .description("Fail when protected files were deleted or changed after locking")
    .action(() => {
      const checks = verifyProtectedFiles(requireProjectRoot());
      for (const check of checks) console.log(`[${check.status}] ${check.path} — ${check.detail}`);
      failWhen(checks.some((check) => check.status === "fail"));
    });

  const attempt = nan.command("attempt").description("Bounded retry and BLOCKED state tracking");
  attempt
    .command("record <taskId>")
    .requiredOption("--outcome <outcome>", "pass | fail")
    .description("Two consecutive failures block; a fourth failed rework needs human judgment")
    .action((taskId, opts) => {
      if (opts.outcome !== "pass" && opts.outcome !== "fail") {
        throw new Error("--outcome must be pass or fail");
      }
      const record = recordAttempt(requireProjectRoot(), taskId, opts.outcome);
      console.log(JSON.stringify(record, null, 2));
      failWhen(record.status !== "ACTIVE");
    });
}
