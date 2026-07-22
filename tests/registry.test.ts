import { describe, it, expect } from "vitest";
import { loadRegistry, resolveAlias, type ModelRegistry } from "../src/registry/registry.js";

const testRegistry: ModelRegistry = {
  version: 1,
  providers: {},
  aliases: {
    "reasoning-high": {
      capabilities: ["deep-reasoning", "tool-use", "long-context"],
      stable: { provider: "openai", model: "gpt-5.6" },
      candidate: { provider: "anthropic", model: "claude-4.5-opus" },
      fallback: "balanced",
    },
    balanced: {
      capabilities: ["tool-use", "long-context"],
      stable: { provider: "openai", model: "gpt-5.5" },
      fallback: "fast-reliable",
    },
    "fast-reliable": {
      capabilities: ["fast", "cheap", "tool-use"],
      stable: { provider: "openai", model: "gpt-5.4" },
      fallback: null,
    },
    "cycle-a": {
      capabilities: [],
      stable: { provider: "x", model: "y" },
      fallback: "cycle-b",
    },
    "cycle-b": {
      capabilities: [],
      stable: { provider: "x", model: "y" },
      fallback: "cycle-a",
    },
  },
};

describe("Model Registry", () => {
  it("실제 레지스트리 파일이 로드된다", () => {
    const registry = loadRegistry();
    expect(Object.keys(registry.aliases)).toContain("reasoning-high");
    expect(Object.keys(registry.aliases)).toContain("auto");
  });

  it("alias 해석: stable 채널", () => {
    const r = resolveAlias(testRegistry, "reasoning-high");
    expect(r.channel).toBe("stable");
    expect(r.model).toBe("gpt-5.6");
  });

  it("candidate 채널 해석, candidate 없으면 stable 로", () => {
    const withCandidate = resolveAlias(testRegistry, "reasoning-high", { channel: "candidate" });
    expect(withCandidate.channel).toBe("candidate");
    expect(withCandidate.provider).toBe("anthropic");

    const withoutCandidate = resolveAlias(testRegistry, "balanced", { channel: "candidate" });
    expect(withoutCandidate.channel).toBe("stable");
    expect(withoutCandidate.notes).toMatch(/no candidate/);
  });

  it("명시적 pinning: pin:provider/model", () => {
    const r = resolveAlias(testRegistry, "pin:openai/gpt-5.6");
    expect(r.channel).toBe("pinned");
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-5.6");
  });

  it("capability mismatch 시 fallback 체인을 따른다", () => {
    // reasoning-high 는 fast 가 없으므로 balanced -> fast-reliable 로 내려간다
    const r = resolveAlias(testRegistry, "reasoning-high", { requiredCapabilities: ["fast"] });
    expect(r.model).toBe("gpt-5.4");
    expect(r.fallbackChain).toEqual(["reasoning-high", "balanced", "fast-reliable"]);
  });

  it("모델 부재: 알 수 없는 alias 는 오류", () => {
    expect(() => resolveAlias(testRegistry, "nonexistent")).toThrow(/Unknown model alias/);
  });

  it("어떤 fallback 도 capability 를 만족하지 못하면 오류", () => {
    expect(() =>
      resolveAlias(testRegistry, "fast-reliable", { requiredCapabilities: ["multimodal"] }),
    ).toThrow(/No alias in fallback chain/);
  });

  it("fallback 순환 감지", () => {
    expect(() => resolveAlias(testRegistry, "cycle-a", { requiredCapabilities: ["fast"] })).toThrow(
      /cycle/i,
    );
  });

  it("잘못된 pin 표기는 오류", () => {
    expect(() => resolveAlias(testRegistry, "pin:no-slash")).toThrow(/Invalid pin/);
  });
});
