import { describe, it, expect } from "vitest";
import { loadConfig, explainConfig, parseSetArgs } from "../src/config/loader.js";
import { mergeLayers, explainLayers, maskSecrets } from "../src/config/merge.js";
import { makeTempProject } from "./helpers.js";

describe("계층형 설정 병합", () => {
  it("기본 로딩: built-in + common 프로파일 + 프로젝트 값이 병합된다", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const config = loadConfig({ projectRoot: root });
    const models = config.effective["models"] as Record<string, string>;
    expect(models["discovery"]).toBe("reasoning-high");
    expect(config.bassYaml.project.name).toBe("test-project");
  });

  it("계층 병합: 프로젝트 값이 프로파일 값을 덮어쓴다", () => {
    const root = makeTempProject({
      profiles: ["common"],
      extraYaml: `models:
  worker: reasoning-high
`,
    });
    const config = loadConfig({ projectRoot: root });
    const models = config.effective["models"] as Record<string, string>;
    expect(models["worker"]).toBe("reasoning-high");
    // 다른 키는 프로파일 값 유지
    expect(models["summarizer"]).toBe("fast-reliable");
  });

  it("web 프로파일은 common 을 extends 하고 design_profile 을 켠다", () => {
    const root = makeTempProject({ profiles: ["web"] });
    const config = loadConfig({ projectRoot: root });
    expect(config.effective["design_profile"]).toBe(true);
    expect(config.layers.map((l) => l.name)).toContain("profile:common");
    expect(config.layers.map((l) => l.name)).toContain("profile:web");
  });

  it("런타임 override 가 최우선이다", () => {
    const root = makeTempProject({ profiles: ["common"] });
    const config = loadConfig({
      projectRoot: root,
      runtimeOverrides: parseSetArgs(["models.worker=balanced", "workflow.max_active_tasks=3"]),
    });
    expect((config.effective["models"] as Record<string, string>)["worker"]).toBe("balanced");
    expect((config.effective["workflow"] as Record<string, unknown>)["max_active_tasks"]).toBe(3);
  });

  it("잘못된 설정: 알 수 없는 프로파일은 명확한 오류", () => {
    const root = makeTempProject({ profiles: ["nonexistent-profile"] });
    expect(() => loadConfig({ projectRoot: root })).toThrow(/Unknown profile/);
  });

  it("잘못된 설정: 스키마 위반 bass.yaml 은 필드 경로를 포함한 오류", () => {
    const root = makeTempProject({ profiles: ["common"], extraYaml: "workflow:\n  max_active_tasks: -1\n" });
    expect(() => loadConfig({ projectRoot: root })).toThrow(/max_active_tasks/);
  });

  it("프로젝트 요구 버전과 런타임 버전이 다르면 설치 방법을 포함한 오류", () => {
    const root = makeTempProject({ profiles: ["common"], version: "999.0.0" });
    expect(() => loadConfig({ projectRoot: root })).toThrow(
      /BASS version mismatch: project requires 999\.0\.0.*Install bass-platform@999\.0\.0/,
    );
  });

  it("환경 설정: 정의되지 않은 env 는 오류, 정의된 env 는 적용", () => {
    const root = makeTempProject({
      profiles: ["common"],
      extraYaml: `environments:
  production:
    workflow:
      reviewer_required: true
`,
    });
    expect(() => loadConfig({ projectRoot: root, env: "staging" })).toThrow(/staging/);
    const config = loadConfig({ projectRoot: root, env: "production" });
    expect(config.layers.map((l) => l.name)).toContain("environment:production");
  });

  it("설정 출처 설명: 최종값의 계층과 override 이력을 보여준다", () => {
    const root = makeTempProject({
      profiles: ["common"],
      extraYaml: `models:
  worker: balanced
`,
    });
    const config = loadConfig({ projectRoot: root });
    const entries = explainConfig(config);
    const worker = entries.find((e) => e.key === "models.worker")!;
    expect(worker.value).toBe("balanced");
    expect(worker.layer).toBe("project");
    expect(worker.overridden.map((o) => o.layer)).toContain("bass-defaults");
  });

  it("비밀정보 마스킹", () => {
    const entries = explainLayers([
      { name: "project", source: "bass.yaml", values: { api_key: "sk-123", normal: "ok" } },
    ]);
    const masked = maskSecrets(entries);
    expect(masked.find((e) => e.key === "api_key")!.value).toBe("***masked***");
    expect(masked.find((e) => e.key === "normal")!.value).toBe("ok");
  });

  it("배열은 병합하지 않고 상위 계층이 대체한다", () => {
    const merged = mergeLayers([
      { name: "a", source: "-", values: { list: [1, 2, 3] } },
      { name: "b", source: "-", values: { list: [9] } },
    ]);
    expect(merged["list"]).toEqual([9]);
  });
});
