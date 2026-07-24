import type { NanConcept, RuntimeDescriptor, RuntimeRecommendation } from "./runtime.js";

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/**
 * Deterministic, reviewable recommendation. It is advisory: a human must approve
 * both the concept and the final runtime selection.
 */
export function recommendRuntimes(
  concept: NanConcept,
  runtimes: RuntimeDescriptor[],
  readyRuntimeIds: Set<string> = new Set(),
): RuntimeRecommendation[] {
  const tags = new Set(concept.tags.map((tag) => tag.toLowerCase()));

  return runtimes
    .map((runtime) => {
      const matches = runtime.suitedTags.filter((tag) => tags.has(tag.toLowerCase())).length;
      const ratio = runtime.suitedTags.length === 0 ? 0 : matches / runtime.suitedTags.length;
      const conceptFit = clamp(10 + ratio * 20, 30);
      const complexityPenalty = concept.newCoreSystems.length > 2 ? 12 : concept.newCoreSystems.length * 2;
      const verticalSlice = clamp(
        (runtime.kind === "web-2d" ? 25 : runtime.kind === "web-3d" ? 19 : 16) - complexityPenalty,
        25,
      );
      const ready = readyRuntimeIds.has(runtime.id);
      const buildReadiness = ready ? 15 : runtime.id === "vanilla-web" ? 12 : 8;
      const teamReadiness = ready ? 15 : 7;
      const deploymentStability = runtime.supportedTargets.includes("web")
        ? runtime.kind === "web-2d"
          ? 10
          : 8
        : 5;
      const licenseRisk =
        runtime.licenseRisk === "low" ? 5 : runtime.licenseRisk === "medium" ? 3 : 0;
      const breakdown = {
        conceptFit,
        verticalSlice,
        buildReadiness,
        teamReadiness,
        deploymentStability,
        licenseRisk,
      };
      return {
        runtime,
        score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
        breakdown,
        reasons: [
          `${matches}/${runtime.suitedTags.length} concept tags matched`,
          ready ? "runtime is certified on this project" : "runtime is not certified yet",
          `${runtime.kind} delivery profile`,
          `${runtime.license} license (${runtime.licenseRisk} risk)`,
        ],
      };
    })
    .sort((a, b) => b.score - a.score || a.runtime.id.localeCompare(b.runtime.id));
}
