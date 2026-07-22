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

이 프로젝트는 BASS (Behavior Architecture & System Supervisor) 워크플로를 따른다.

## 작업 규칙

1. 전체 행동 규칙은 \`bass compose --role <role>\` 출력이 기준이다.
   원문: bass-platform \`prompt-library/\` (복사본을 만들지 마라).
2. 작업은 \`tasks/<ID>.md\` 명세로 정의한다. 시작 전 \`bass gate pre-task <ID>\`,
   완료 전 run record 작성 후 \`bass gate pre-complete <ID>\` 를 통과해야 한다.
3. 모델 선택은 \`bass route <ID> --role <role>\` 권고를 따른다. 모델명을 하드코딩하지 마라.
4. 인증·권한·데이터 삭제·배포 등 승인 조건(\`bass route\` 출력의 approvals)이 있으면
   구현 전에 정지하고 인간 승인을 받는다.
${opts.withDesign ? "5. UI 작업 전 반드시 루트의 `DESIGN.md` 를 읽는다. 디자인 의도의 단일 명세다.\n" : ""}
## 설정

- 프로젝트 설정: \`bass.yaml\` / 유효 설정 확인: \`bass config explain\`
`;
}

function renderCursorShim(opts: InitOptions): string {
  return `---
description: BASS workflow rules for this project
alwaysApply: true
---

<!-- ${SHIM_MARKER}: cursor v${BASS_VERSION} — 얇은 참조 shim. 규칙 원문을 복사하지 마라. -->

이 프로젝트는 BASS 워크플로를 따른다. 규칙의 단일 원천은 다음과 같다.

- 행동 규칙: \`bass compose --role <role>\` (원문은 bass-platform prompt-library)
- 작업 명세: \`tasks/<ID>.md\` — 시작 전 \`bass gate pre-task\`, 완료 전 \`bass gate pre-complete\`
- 모델 선택: \`bass route\` 권고 사용, 모델명 하드코딩 금지
${opts.withDesign ? "- UI 작업 전 루트 `DESIGN.md` 필독\n" : ""}
AGENTS.md 와 이 파일의 내용이 다르면 드리프트다. \`bass doctor\` 로 검사하고 shim 을 재생성하라.
`;
}

function renderClaudeShim(): string {
  return `<!-- ${SHIM_MARKER}: claude v${BASS_VERSION} — 얇은 참조 shim. 규칙 원문을 복사하지 마라. -->
# CLAUDE.md

이 프로젝트의 에이전트 규칙은 \`AGENTS.md\` 를 따른다. 그 파일을 먼저 읽어라.

- 작업 게이트: \`bass gate pre-task <ID>\` / \`bass gate pre-complete <ID>\`
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
