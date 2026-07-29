import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runDesignChecks, addCorrection, loadCorrections, reviewCorrection } from "../src/design/designProfile.js";
import { makeTempProject } from "./helpers.js";
import { loadConfig } from "../src/config/loader.js";

describe("Design Profile 검사", () => {
  it("DESIGN.md 없으면 실패", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const checks = runDesignChecks({ projectRoot: root, effective: { design_profile: true } });
    expect(checks.find((c) => c.id === "design-md-exists")?.status).toBe("fail");
  });

  it("하드코딩 hex 색상을 경고한다 (토큰 파일 제외, bass-allow-color 주석 허용)", () => {
    const root = makeTempProject({ profiles: ["web"] });
    fs.writeFileSync(path.join(root, "DESIGN.md"), "# design\nhover focus disabled loading error empty", "utf8");
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "button.tsx"), `const c = "#ff0000";`, "utf8");
    fs.writeFileSync(path.join(srcDir, "tokens.ts"), `export const red = "#ff0000";`, "utf8");
    fs.writeFileSync(path.join(srcDir, "allowed.tsx"), `const c = "#00ff00"; // bass-allow-color`, "utf8");

    const checks = runDesignChecks({ projectRoot: root, effective: { design_profile: true } });
    const tokenCheck = checks.find((c) => c.id === "token-consistency-colors")!;
    expect(tokenCheck.status).toBe("warn");
    expect(tokenCheck.detail).toContain("button.tsx");
    expect(tokenCheck.detail).not.toContain("tokens.ts");
    expect(tokenCheck.detail).not.toContain("allowed.tsx");
  });

  it("DESIGN.md 가 상호작용 상태를 다루지 않으면 경고", () => {
    const root = makeTempProject({ profiles: ["web"] });
    fs.writeFileSync(path.join(root, "DESIGN.md"), "# design\n색상만 정의", "utf8");
    const checks = runDesignChecks({ projectRoot: root, effective: { design_profile: true } });
    expect(checks.find((c) => c.id === "state-completeness-spec")?.status).toBe("warn");
  });

  it("빈 템플릿의 주석 키워드는 상태 명세로 인정하지 않는다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    fs.writeFileSync(
      path.join(root, "DESIGN.md"),
      "# Product design identity\n\n## Interaction states\n\n<!-- hover focus active disabled loading error empty success -->\n",
      "utf8",
    );
    const checks = runDesignChecks({ projectRoot: root, effective: loadConfig({ projectRoot: root }).effective });
    expect(checks.find((c) => c.id === "state-completeness-spec")?.status).toBe("warn");
  });
});

describe("디자인 교정 학습 루프", () => {
  it("교정은 pending 으로 기록되고 인간 검토 후 상태가 바뀐다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const c = addCorrection(root, "버튼 라벨은 행동 동사로 끝낸다", ["T-001 리뷰 피드백"]);
    expect(c.status).toBe("pending");

    const listed = loadCorrections(root);
    expect(listed).toHaveLength(1);

    const reviewed = reviewCorrection(root, c.id, "approved", "user");
    expect(reviewed.status).toBe("approved");
    expect(reviewed.reviewer).toBe("user");
    // 파일에도 반영
    expect(loadCorrections(root)[0]!.status).toBe("approved");
  });

  it("없는 교정 id 검토는 오류", () => {
    const root = makeTempProject({ profiles: ["web"] });
    expect(() => reviewCorrection(root, 99, "approved", "user")).toThrow(/not found/);
  });
});
