import type { RuntimeDescriptor, RuntimeRecommendation, RuntimeRequirements } from "./domain.js";

export function recommendRuntimes(
  requirements: RuntimeRequirements,
  runtimes: RuntimeDescriptor[],
): RuntimeRecommendation[] {
  const existing = new Set(requirements.existingDependencies.map((item) => item.toLowerCase()));
  const ready = new Set(requirements.teamReadyRuntimeIds.map((item) => item.toLowerCase()));
  return runtimes.map((runtime) => {
    const dimensionFit = requirements.dimension === "either" || runtime.dimension === "either" || runtime.dimension === requirements.dimension ? 30 : 0;
    const supported = requirements.targets.filter((target) => runtime.supportedTargets.includes(target)).length;
    const targetFit = Math.round(20 * supported / Math.max(1, requirements.targets.length));
    const dependencyReady = existing.has(runtime.id) || Boolean(runtime.packageName && existing.has(runtime.packageName.toLowerCase()));
    const existingDependency = dependencyReady ? 15 : runtime.id === "vanilla-web" ? 12 : 0;
    const teamReadiness = ready.has(runtime.id) ? 15 : 0;
    const deploymentFit = runtime.deployment === requirements.deployment || runtime.deployment === "hybrid" ? 15 : 5;
    const licenseRisk = runtime.licenseRisk === "low" ? 5 : runtime.licenseRisk === "medium" ? 3 : 0;
    const breakdown = { dimensionFit, targetFit, existingDependency, teamReadiness, deploymentFit, licenseRisk };
    return {
      runtime,
      score: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      breakdown,
      reasons: [
        `${supported}/${requirements.targets.length} targets supported`,
        dependencyReady ? "existing dependency can be reused" : "new runtime dependency",
        ready.has(runtime.id) ? "team marked this runtime ready" : "team readiness not confirmed",
        `${runtime.license} license (${runtime.licenseRisk} risk)`,
      ],
    };
  }).sort((a, b) => b.score - a.score || a.runtime.id.localeCompare(b.runtime.id));
}
