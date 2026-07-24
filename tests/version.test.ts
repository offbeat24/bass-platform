import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASS_PACKAGE, BASS_VERSION, loadPackageMetadata } from "../src/version.js";

describe("BASS package metadata", () => {
  it("package.json을 CLI 이름과 버전의 단일 원천으로 사용한다", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));

    expect(BASS_PACKAGE.name).toBe(packageJson.name);
    expect(BASS_VERSION).toBe(packageJson.version);
    expect(BASS_VERSION).toBe("0.1.1");
    expect(loadPackageMetadata()).toBe(BASS_PACKAGE);
  });
});
