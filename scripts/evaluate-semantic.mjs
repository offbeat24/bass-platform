import fs from "node:fs";
import path from "node:path";
import { askSemantic, semanticCost } from "../dist/semantic/client.js";
import { specificationQuestions, contextQuestions, evidenceQuestion, SEMANTIC_YES_THRESHOLD, SEMANTIC_NO_THRESHOLD } from "../dist/semantic/workflow.js";

// Twenty distinct task situations, each evaluated in English and Korean.
// The first five are development cases; the remaining fifteen are held out.
// Positive specification labels include an explicit outcome and matching assertion.
const situations = [
  ["ignore late search responses", "늦게 도착한 검색 응답 무시", "request sequence", "요청 순서", "Older search responses are ignored after a newer response arrives.", "새 요청 결과가 먼저 도착한 뒤 이전 검색 결과가 도착하면 이전 결과는 무시된다."],
  ["reject expired sign-in links", "만료된 로그인 링크 거절", "expiry check", "만료 시각 검사", "An expired sign-in link is rejected.", "만료된 로그인 링크로는 로그인할 수 없다."],
  ["retry failed file uploads", "실패한 파일 업로드 재시도", "upload retry", "업로드 재시도", "A failed upload is retried up to the configured limit.", "파일 업로드가 실패하면 설정된 횟수까지 다시 시도한다."],
  ["preserve saved draft text", "저장된 초안 글 보존", "draft persistence", "초안 저장", "Saved draft text remains unchanged after reopening.", "저장한 초안을 다시 열어도 입력 내용이 유지된다."],
  ["limit duplicate notifications", "중복 알림 제한", "notification deduplication", "알림 중복 제거", "The same event creates at most one notification.", "같은 이벤트에서는 알림이 한 번만 생성된다."],
  ["sort invoices by due date", "청구서를 납기일 순으로 정렬", "due date ordering", "납기일 정렬", "Invoices are ordered by ascending due date.", "청구서는 납기일이 빠른 순서대로 표시된다."],
  ["block unauthorized exports", "권한 없는 내보내기 차단", "export authorization", "내보내기 권한", "An export request without authorization is denied.", "권한 없는 사용자의 내보내기 요청은 거부된다."],
  ["restore a failed checkout session", "실패한 결제 세션 복원", "checkout recovery", "결제 복구", "After checkout fails, the same session can be restored.", "결제 실패 뒤에도 기존 결제 세션을 복원할 수 있다."],
  ["filter archived projects", "보관된 프로젝트 필터링", "archive filtering", "보관 항목 필터", "Archived projects are omitted from active-project results.", "보관된 프로젝트는 활성 프로젝트 목록에 나타나지 않는다."],
  ["keep pagination stable", "페이지 목록 순서 유지", "stable pagination", "안정적인 페이지 처리", "Changing pages preserves the defined item order.", "페이지를 이동해도 정해진 항목 순서가 유지된다."],
  ["validate spreadsheet columns", "스프레드시트 열 검증", "column validation", "열 검증", "A spreadsheet missing a required column fails validation.", "필수 열이 없는 스프레드시트는 검증에 실패한다."],
  ["expire stale cache entries", "오래된 캐시 항목 만료", "cache expiration", "캐시 만료", "A stale cache entry expires after its configured lifetime.", "오래된 캐시 항목은 설정된 만료 시간 뒤 제거된다."],
  ["merge repeated contact records", "중복 연락처 기록 병합", "contact matching", "연락처 병합", "Contact records with the same matching key are merged.", "일치 기준이 같은 연락처 기록은 하나로 병합된다."],
  ["show failed background jobs", "실패한 백그라운드 작업 표시", "job status reporting", "작업 상태 표시", "A failed background job is shown with failed status.", "실패한 백그라운드 작업은 실패 상태로 표시된다."],
  ["prevent duplicate form submission", "양식 중복 제출 방지", "submission idempotency", "제출 멱등성", "Submitting twice with the same idempotency key creates one operation.", "같은 멱등성 키로 양식을 두 번 제출해도 처리는 한 번만 이루어진다."],
  ["redact secrets from logs", "로그의 비밀정보 가리기", "log redaction", "로그 비밀정보 제거", "Secret values are masked in log output.", "로그에 비밀 값이 원문 그대로 노출되지 않는다."],
  ["resume interrupted downloads", "중단된 다운로드 재개", "download checkpoints", "다운로드 체크포인트", "An interrupted download resumes from its last saved checkpoint.", "중단된 다운로드는 저장된 마지막 지점부터 재개된다."],
  ["validate imported calendar dates", "가져온 일정 날짜 검증", "date parsing", "날짜 파싱", "An invalid imported calendar date is rejected.", "유효하지 않은 일정 날짜는 가져오기에서 거부된다."],
  ["reconcile inventory counts", "재고 수량 대조", "inventory reconciliation", "재고 대조", "A count mismatch appears in the inventory reconciliation result.", "재고 수량이 맞지 않으면 대조 결과에 차이를 표시한다."],
  ["isolate tenant settings", "테넌트 설정 분리", "tenant isolation", "테넌트 분리", "Each tenant can read only its own settings.", "테넌트마다 자기 설정만 조회할 수 있다."],
];

const cases = situations.flatMap(([en, ko, methodEn, methodKo, expectedEn, expectedKo], index) => [
  { locale: "en", action: en, method: methodEn, expected: expectedEn, index },
  { locale: "ko", action: ko, method: methodKo, expected: expectedKo, index },
]).flatMap((item) => {
  const korean = item.locale === "ko";
  const good = item.index % 2 === 0;
  const problemKind = good ? null : item.index % 4 === 1 ? "scope_conflict" : "verification_gap";
  const evidenceKind = good ? null : item.index % 4 === 1 ? "contradiction" : "insufficient";
  const acceptance = korean ? `${item.action} 동작을 자동 검사한다` : `An automated check confirms ${item.action}`;
  const specAcceptance = korean ? `수용 기준: ${item.expected}` : `Acceptance criterion: ${item.expected}`;
  const shipping = item.action;
  const excluded = problemKind === "scope_conflict" ? item.action : (korean ? "관련 없는 화면 변경" : "unrelated screen changes");
  const verification = problemKind === "verification_gap" ? (korean ? "검증 계획 없음" : "no verification planned")
    : (korean ? `${item.method} 통합 테스트에서 기대 결과를 확인한다: ${item.expected}`
      : `${item.method} integration test asserts the expected result: ${item.expected}`);
  const query = korean ? `${item.action} 구현 방법` : `Implementation of ${item.action}`;
  const distractors = Array.from({ length: 7 }, (_ignored, i) => ({ source: `candidate-${i}`, heading: "Overview", text: korean
    ? `${item.action}과 관련된 일반 화면 설명 ${i}` : `General UI discussion related to ${item.action}, section ${i}` }));
  const relevant = { source: "candidate-7", heading: "Implementation", text: korean
    ? `${item.action}: ${item.method}으로 입력 상태를 추적하고 변경된 결과를 검사한다.`
    : `${item.action}: use ${item.method} to track state and test the resulting behavior.` };
  const claim = korean ? `${item.action} 기능이 검증되었다` : `The behavior to ${item.action} was verified`;
  const source = good ? (korean ? `통합 검사 통과: ${claim}. ${item.method} 결과 확인.` : `Integration check passed: ${claim}. Confirmed via ${item.method}.`)
    : evidenceKind === "contradiction" ? (korean ? `통합 검사 실패: ${item.action} 기능이 검증되지 않았다.` : `Integration check failed: the behavior to ${item.action} was not verified.`)
      : (korean ? `${item.method} 테스트가 실행되었지만 ${item.action} 결과는 확인하지 않았다.` : `The ${item.method} test ran but did not establish ${item.action}.`);
  return [
    { dimension: "spec", ...item, gold: good, problemKind, state: { shipping, excluded, acceptance: [specAcceptance], verification, allowed_scope: "src/" } },
    { dimension: "context", ...item, gold: "candidate-7", state: { task: query, acceptance: [acceptance], candidates: [...distractors, relevant] } },
    { dimension: "evidence", ...item, gold: good, evidenceKind, state: { criterion: acceptance, claim, quote: source, source } },
  ];
});

if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ total: cases.length, development: cases.filter((c) => c.index < 5).length,
    holdout: cases.filter((c) => c.index >= 5).length, perDimension: { spec: 40, context: 40, evidence: 40 },
    languages: { ko: 60, en: 60 }, estimatedMaximumReservationsUsd: Number((120 * 64_000 * 0.042 / 1_000_000).toFixed(3)) }, null, 2));
  process.exit(0);
}
if (!process.env.TYPESAFE_API_KEY) throw new Error("TYPESAFE_API_KEY is required for live evaluation; use --dry-run to inspect the suite");

// Keep one ledger across retries and reruns so the release evaluation has a total $1 cap.
const project = path.resolve(".bass/semantic/evaluation-root");
const config = { mode: "enforce", provider: "typesafe", model: "jev-1.13.0", input_usd_per_million: 0.042, document_paths: [], max_usd: 1 };
const answers = [];
const output = path.resolve(".bass/evidence/BASS-056/semantic-live-evaluation.json");
function writeReport(report) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
function keywordTopFive(state) {
  const words = new Set(`${state.task} ${state.acceptance.join(" ")}`.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? []);
  return state.candidates.map((candidate, index) => ({ index, score: [...words].filter((word) => candidate.text.toLowerCase().includes(word)).length }))
    .sort((left, right) => right.score - left.score || left.index - right.index).slice(0, 5).some((candidate) => candidate.index === 7);
}
for (const item of cases) {
  const questions = item.dimension === "spec" ? specificationQuestions(item.state.acceptance)
    : item.dimension === "context" ? contextQuestions(item.state.candidates.length)
      : { relation: evidenceQuestion() };
  const started = performance.now();
  let result;
  try { result = await askSemantic(project, config, { state: item.state, questions }); }
  catch (error) {
    writeReport({ passed: false, completed: answers.length, total: cases.length,
      failure: { dimension: item.dimension, locale: item.locale, index: item.index, message: String(error) },
      usage: semanticCost(project), answers });
    throw error;
  }
  const output = result.response.answers;
  const specValues = ["compatibility", "observable_0", "covered_0"].map((name) => output[name]);
  const pass = item.dimension === "spec"
    ? specValues.every((answer) => answer?.type === "noul" && answer.noul >= SEMANTIC_YES_THRESHOLD)
    : item.dimension === "context"
      ? [...Array(8).keys()].sort((left, right) => output[`candidate_${right}`]?.score - output[`candidate_${left}`]?.score)
        .filter((index) => output[`candidate_${index}`]?.score >= 1.5).slice(0, 5).includes(7)
      : output.relation?.choice === "supports" && output.relation?.confidence >= 0.8;
  answers.push({ dimension: item.dimension, locale: item.locale, index: item.index, gold: item.gold, pass,
    ...(item.problemKind ? { problemKind: item.problemKind } : {}),
    ...(item.evidenceKind ? { evidenceKind: item.evidenceKind } : {}),
    ...(item.dimension === "context" ? { keywordTopFive: keywordTopFive(item.state) } : {}),
    abstained: item.dimension === "spec" ? specValues.some((answer) => answer?.type === "noul" && answer.noul > SEMANTIC_NO_THRESHOLD && answer.noul < SEMANTIC_YES_THRESHOLD)
      : item.dimension === "evidence" ? output.relation?.confidence < 0.8 : false,
    model: result.response.model, reused: result.reused, inputTokens: result.response.usage.input_tokens,
    latencyMs: Math.round(performance.now() - started) });
}

const holdout = answers.filter((answer) => answer.index >= 5);
const by = (dimension) => holdout.filter((answer) => answer.dimension === dimension);
const spec = by("spec"), context = by("context"), evidence = by("evidence");
const share = (items, predicate) => items.length ? items.filter(predicate).length / items.length : 0;
const metrics = {
  specProblemRecall: share(spec.filter((item) => !item.gold), (item) => !item.pass),
  specConflictRecall: share(spec.filter((item) => item.problemKind === "scope_conflict"), (item) => !item.pass),
  specVerificationGapRecall: share(spec.filter((item) => item.problemKind === "verification_gap"), (item) => !item.pass),
  specNormalFalsePositive: share(spec.filter((item) => item.gold), (item) => !item.pass),
  contextTopFive: share(context, (item) => item.pass),
  contextKeywordTopFive: share(context, (item) => item.keywordTopFive),
  evidenceBadAccepted: evidence.filter((item) => !item.gold && item.pass).length,
  evidenceContradictionsAccepted: evidence.filter((item) => item.evidenceKind === "contradiction" && item.pass).length,
  evidenceInsufficientAccepted: evidence.filter((item) => item.evidenceKind === "insufficient" && item.pass).length,
  evidenceNormalAccepted: share(evidence.filter((item) => item.gold), (item) => item.pass),
  abstentionRate: share(holdout, (item) => item.abstained),
  meanLatencyMs: Math.round(holdout.reduce((sum, item) => sum + item.latencyMs, 0) / holdout.length),
  meanApiLatencyMs: Math.round(holdout.filter((item) => !item.reused).reduce((sum, item) => sum + item.latencyMs, 0)
    / Math.max(1, holdout.filter((item) => !item.reused).length)),
  cachedHoldoutCases: holdout.filter((item) => item.reused).length,
};
const passed = metrics.specProblemRecall >= 0.9 && metrics.specConflictRecall >= 0.9
  && metrics.specVerificationGapRecall >= 0.9 && metrics.specNormalFalsePositive <= 0.1
  && metrics.contextTopFive >= 0.9 && metrics.contextTopFive >= metrics.contextKeywordTopFive
  && metrics.evidenceBadAccepted === 0 && metrics.evidenceNormalAccepted >= 0.8;
const report = { passed, metrics, cases: answers.length, holdout: holdout.length, usage: semanticCost(project),
  models: [...new Set(answers.map((answer) => answer.model))], answers };
writeReport(report);
console.log(JSON.stringify({ passed, metrics, usage: report.usage, output }, null, 2));
process.exit(passed ? 0 : 1);
