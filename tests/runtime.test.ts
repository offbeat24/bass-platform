import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRuntime, runtimeCatalog, targetAdapterCatalog } from "../src/runtime/catalog.js";
import { recommendRuntimes } from "../src/runtime/recommendation.js";
import { loadConfig } from "../src/config/loader.js";
import { makeTempProject } from "./helpers.js";

describe("portable game runtime", () => {
  it("NAN의 일반 adapter 목록을 game core로 제공한다", () => {
    expect(runtimeCatalog().map((adapter) => adapter.descriptor().id)).toEqual([
      "vanilla-web", "pixi", "phaser", "playcanvas", "unity",
    ]);
    expect(targetAdapterCatalog().map((adapter) => adapter.descriptor().id)).toEqual(["capacitor-mobile"]);
  });

  it("Capacitor target adapter는 mobile을 명시한 web scaffold에만 합성된다", () => {
    const root = makeTempProject({ profiles: ["game"] });
    getRuntime("pixi").scaffold({ projectRoot: root, destination: "game", targets: ["android"], projectName: "demo" });
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, "game", "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies["@capacitor/android"]).toBeDefined();
    expect(fs.existsSync(path.join(root, "game", "capacitor.config.ts"))).toBe(true);
    expect(getRuntime("pixi").doctor({ projectRoot: root, targets: ["android"] }).checks.some((check) => check.id === "capacitor-android-toolchain")).toBe(true);
  });

  it("2D, target, 기존 의존성, 팀 준비도, 배포, 라이선스를 모두 점수화한다", () => {
    const recommendations = recommendRuntimes({
      dimension: "2d",
      targets: ["web"],
      existingDependencies: ["pixi.js"],
      teamReadyRuntimeIds: ["pixi"],
      deployment: "web",
    }, runtimeCatalog().map((adapter) => adapter.descriptor()));
    expect(recommendations[0]?.runtime.id).toBe("pixi");
    expect(Object.keys(recommendations[0]!.breakdown)).toEqual([
      "dimensionFit", "targetFit", "existingDependency", "teamReadiness", "deploymentFit", "licenseRisk",
    ]);
  });

  it("checksum이 맞는 파일만 갱신하고 사용자 편집은 conflict로 보존한다", () => {
    const root = makeTempProject({ profiles: ["game"] });
    const adapter = getRuntime("vanilla-web");
    const first = adapter.scaffold({ projectRoot: root, destination: "game", targets: ["web"], projectName: "demo" });
    expect(first.status).toBe("applied");
    const entry = path.join(root, "game", "src", "main.ts");
    fs.appendFileSync(entry, "// user edit\n", "utf8");
    const second = adapter.scaffold({ projectRoot: root, destination: "game", targets: ["web"], projectName: "demo" });
    expect(second.status).toBe("conflict");
    expect(second.conflicts).toContain("game/src/main.ts");
    expect(fs.readFileSync(entry, "utf8")).toContain("user edit");
    expect(fs.existsSync(path.join(root, "package.json"))).toBe(false);
  });

  it("Unity scaffold는 대상에 package.json을 만들지 않는다", () => {
    const root = makeTempProject({ profiles: ["game"] });
    const report = getRuntime("unity").scaffold({ projectRoot: root, destination: "unity-game", targets: ["macos"], projectName: "demo" });
    expect(report.status).toBe("applied");
    expect(fs.existsSync(path.join(root, "unity-game", "ProjectSettings", "ProjectVersion.txt"))).toBe(true);
    expect(fs.existsSync(path.join(root, "unity-game", "package.json"))).toBe(false);
  });

  it("nan2026은 game을 확장하고 대회 gate는 overlay에만 둔다", () => {
    const gameRoot = makeTempProject({ profiles: ["game"] });
    const nanRoot = makeTempProject({ profiles: ["nan2026"] });
    const game = loadConfig({ projectRoot: gameRoot }).effective;
    const nan = loadConfig({ projectRoot: nanRoot }).effective;
    expect(game["runtime_selection"]).toBeDefined();
    expect(game["event_overlay"]).toBeUndefined();
    expect(nan["runtime_selection"]).toBeDefined();
    expect((nan["event_overlay"] as Record<string, unknown>)["time_limit_hours"]).toBe(48);
  });
});
