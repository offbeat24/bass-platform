import fs from "node:fs";
import path from "node:path";
import { templatesDir } from "../paths.js";
import { BASS_VERSION } from "../version.js";

/**
 * `bass init`: 프로젝트에 BASS 를 연결한다.
 *
 * 원칙 (Core §6, Design §8):
 * - BASS 코드를 복사하지 않는다. 프로젝트는 bass.yaml 로 버전을 의존한다.
 * - 도구별 파일(AGENTS.md, .cursor/rules, CLAUDE.md)은 원문 복사가 아니라
 *   같은 명세를 참조하는 얇은 shim 이다.
 */

export interface InitOptions {
  projectRoot: string;
  name: string;
  profiles: string[];
  owner: string;
  withDesign: boolean;
  force?: boolean;
}

export interface InitResult {
  created: string[];
  skipped: string[];
}

const SHIM_MARKER = "bass-shim";

export function initProject(opts: InitOptions): InitResult {
  const created: string[] = [];
  const skipped: string[] = [];

  const write = (rel: string, content: string): void => {
    const abs = path.join(opts.projectRoot, rel);
    if (fs.existsSync(abs) && !opts.force) {
      skipped.push(rel);
      return;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    created.push(rel);
  };

  write("bass.yaml", renderBassYaml(opts));
  write("AGENTS.md", renderAgentsShim(opts));
  write(".cursor/rules/bass.mdc", renderCursorShim(opts));
  write("CLAUDE.md", renderClaudeShim());

  if (opts.withDesign) {
    write("DESIGN.md", fs.readFileSync(path.join(templatesDir(), "DESIGN.md"), "utf8"));
  }

  for (const dir of ["tasks", "records", "critiques", "docs/decisions"]) {
    const abs = path.join(opts.projectRoot, dir);
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs, { recursive: true });
      created.push(`${dir}/`);
    }
  }

  return { created, skipped };
}

function renderBassYaml(opts: InitOptions): string {
  return `# BASS 프로젝트 설정. BASS 코드를 복사하지 않고 버전을 의존한다.
bass:
  version: ${BASS_VERSION}
  profiles:
${opts.profiles.map((p) => `    - ${p}`).join("\n")}

project:
  name: ${opts.name}

# capability alias 만 사용한다. 모델명을 직접 쓰지 마라.
# 특정 모델 고정이 꼭 필요하면 "pin:provider/model" 표기를 쓴다.
models:
  worker: auto

workflow:
  max_active_tasks: 1
  reviewer_required: true

evaluators:
  level1: []
  level2: []
  level3: []
`;
}

function renderAgentsShim(opts: InitOptions): string {
  return `<!-- ${SHIM_MARKER}: agents v${BASS_VERSION} — 이 파일은 얇은 참조 shim 이다. 규칙 원문을 여기에 복사하지 마라. -->
# AGENTS.md — ${opts.name}

이 프로젝트는 BASS를 AI 에이전트의 내부 실행 런타임으로 사용한다.
사용자 인터페이스는 자연어 대화이며, 사용자가 BASS 명령이나 기록 파일을 직접 관리하게 하지 마라.

## 에이전트 실행 계약

1. 작업 시작 시 \`bass agent guide [task-id]\`를 내부적으로 실행하고 현재 계약을 읽는다.
2. 저장소에서 확인할 수 있는 사실은 직접 조사한다. 사람에게는 제품·가치·위험 결정을 한 번에 하나씩 묻는다.
3. task·상태·검증·critic·record는 에이전트가 관리한다. 내부 상태 전환을 승인 질문으로 노출하지 마라.
4. 위험 승인 조건이 있으면 선택지·권장안·영향을 제시하고, 사용자의 명시적 결정만 \`bass approval risk\`로 기록한다.
5. 구현 후 \`bass gate pre-review\`로 근거를 준비하고 결과를 한 번에 보여준다. 최종 승인을 기록한 뒤 \`bass task finalize\`를 실행한다.
6. 재실행 시 이미 완료된 단계·결정·부작용을 재사용하고 중복 생성하지 마라.
${opts.withDesign ? "7. UI 작업은 `DESIGN.md`와 실제 렌더링을 조사하고, 기계 검사와 독립 Design Critic을 거친다.\n" : ""}
## 원천

- 동적 실행 안내: \`bass agent guide --json\`
- 전체 행동 규칙: \`bass compose --role <role>\`
- 프로젝트 설정: \`bass.yaml\` / 유효 설정: \`bass config explain\`
`;
}

function renderCursorShim(opts: InitOptions): string {
  return `---
description: BASS workflow rules for this project
alwaysApply: true
---

<!-- ${SHIM_MARKER}: cursor v${BASS_VERSION} — 얇은 참조 shim. 규칙 원문을 복사하지 마라. -->

이 프로젝트는 BASS를 AI 에이전트 내부 런타임으로 사용한다.
사용자에게 CLI 실행이나 상태 파일 편집을 요구하지 말고 자연어 목적과 피드백만 받는다.

- 동적 실행 계약: \`bass agent guide [task-id]\`
- 행동 규칙: \`bass compose --role <role>\` (원문은 bass-platform prompt-library)
- task·상태·검증·record는 에이전트가 내부 관리
- 사람 결정은 정책이 요구하는 제품·가치·위험 판단에만 요청
- 검토 전 \`bass gate pre-review\`, 명시적 승인 후 \`bass task finalize\`
- 모델 선택: \`bass route\` 권고 사용, 모델명 하드코딩 금지
${opts.withDesign ? "- UI 작업 전 루트 `DESIGN.md` 필독\n" : ""}
AGENTS.md 와 이 파일의 내용이 다르면 드리프트다. \`bass doctor\` 로 검사하고 shim 을 재생성하라.
`;
}

function renderClaudeShim(): string {
  return `<!-- ${SHIM_MARKER}: claude v${BASS_VERSION} — 얇은 참조 shim. 규칙 원문을 복사하지 마라. -->
# CLAUDE.md

이 프로젝트의 에이전트 규칙은 \`AGENTS.md\` 를 따른다. 그 파일을 먼저 읽어라.

- 사용자는 자연어로만 협업한다. BASS CLI와 기록 파일은 에이전트가 내부 관리한다.
- 시작 시 \`bass agent guide [task-id]\`를 읽고 위험에 비례한 실행 깊이를 선택한다.
- 작업 게이트: \`bass gate pre-task <ID>\` / \`bass gate pre-review <ID>\` / \`bass task finalize <ID>\`
- UI 작업이 있다면 루트 \`DESIGN.md\` 를 먼저 읽는다 (존재하는 경우).
- 규칙 전문이 필요하면 \`bass compose --role <role>\` 을 실행한다.
`;
}

/** `bass doctor`: shim 존재·참조 유효성·드리프트(비대화) 검사 (Design §8) */
export interface DoctorCheck {
  id: string;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

const SHIM_MAX_LINES = 60;

export function doctor(projectRoot: string, effective: Record<string, unknown>): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const requireFile = (rel: string, id: string): string | null => {
    const abs = path.join(projectRoot, rel);
    if (!fs.existsSync(abs)) {
      checks.push({ id, status: "fail", detail: `${rel} missing — run \`bass init\`` });
      return null;
    }
    return fs.readFileSync(abs, "utf8");
  };

  const bassYaml = requireFile("bass.yaml", "bass-yaml");
  if (bassYaml) checks.push({ id: "bass-yaml", status: "pass" });

  for (const [rel, id] of [
    ["AGENTS.md", "shim-agents"],
    [".cursor/rules/bass.mdc", "shim-cursor"],
    ["CLAUDE.md", "shim-claude"],
  ] as const) {
    const content = requireFile(rel, id);
    if (!content) continue;

    if (!content.includes(SHIM_MARKER)) {
      checks.push({
        id,
        status: "warn",
        detail: `${rel} 에 shim 마커가 없다 — 수동 관리 파일이거나 드리프트일 수 있다`,
      });
      continue;
    }
    const lines = content.split("\n").length;
    if (lines > SHIM_MAX_LINES) {
      checks.push({
        id,
        status: "warn",
        detail: `${rel} 이 ${lines}줄 — shim 이 비대해졌다. 원문 복사(드리프트) 징후. 참조로 되돌려라`,
      });
    } else {
      checks.push({ id, status: "pass" });
    }
  }

  if (Boolean(effective["design_profile"])) {
    const designExists = fs.existsSync(path.join(projectRoot, "DESIGN.md"));
    checks.push({
      id: "design-md",
      status: designExists ? "pass" : "fail",
      detail: designExists ? undefined : "design_profile 활성인데 DESIGN.md 없음",
    });
  }

  return checks;
}
