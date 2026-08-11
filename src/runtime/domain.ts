export type RuntimeTarget = "web" | "android" | "ios" | "macos";
export type RuntimeCheckStatus = "pass" | "fail" | "not-verified";

export interface RuntimeDescriptor {
  id: string;
  name: string;
  adapterVersion: string;
  dimension: "2d" | "3d" | "either";
  deployment: "web" | "native" | "hybrid";
  description: string;
  packageName?: string;
  capabilities: string[];
  supportedTargets: RuntimeTarget[];
  license: string;
  licenseRisk: "low" | "medium" | "high";
}

export interface RuntimeRequirements {
  dimension: "2d" | "3d" | "either";
  targets: RuntimeTarget[];
  existingDependencies: string[];
  teamReadyRuntimeIds: string[];
  deployment: "web" | "native" | "hybrid";
}

export interface RuntimeRecommendation {
  runtime: RuntimeDescriptor;
  score: number;
  breakdown: {
    dimensionFit: number;
    targetFit: number;
    existingDependency: number;
    teamReadiness: number;
    deploymentFit: number;
    licenseRisk: number;
  };
  reasons: string[];
}

export interface RuntimeCheck {
  id: string;
  status: RuntimeCheckStatus;
  detail: string;
}

export interface RuntimeCheckReport {
  runtime: string;
  status: RuntimeCheckStatus;
  checks: RuntimeCheck[];
}

export interface RuntimeContext {
  projectRoot: string;
  targets: RuntimeTarget[];
}

export interface RuntimeScaffoldOptions {
  projectRoot: string;
  destination: string;
  targets: RuntimeTarget[];
  projectName: string;
}

export interface RuntimeScaffoldReport {
  runtime: string;
  status: "applied" | "unchanged" | "conflict" | "failed";
  created: string[];
  updated: string[];
  unchanged: string[];
  conflicts: string[];
  message?: string;
}

export interface RuntimeInstallReport {
  runtime: string;
  status: "installed" | "skipped" | "failed";
  command?: string;
  message?: string;
}

export interface RuntimeVerificationReport {
  runtime: string;
  status: RuntimeCheckStatus;
  targets: Array<{ target: RuntimeTarget; status: RuntimeCheckStatus; detail: string }>;
}

export interface RuntimeAdapter {
  descriptor(): RuntimeDescriptor;
  doctor(context: RuntimeContext): RuntimeCheckReport;
  scaffold(options: RuntimeScaffoldOptions): RuntimeScaffoldReport;
  install(runtimeRoot: string): RuntimeInstallReport;
  verify(runtimeRoot: string, targets: RuntimeTarget[]): RuntimeVerificationReport;
}

export interface TargetAdapterDescriptor {
  id: string;
  adapterVersion: string;
  name: string;
  targets: RuntimeTarget[];
  description: string;
}

export interface TargetComposition {
  dependencies: Record<string, string>;
  files: Record<string, string>;
}

export interface TargetAdapter {
  descriptor(): TargetAdapterDescriptor;
  compose(options: RuntimeScaffoldOptions): TargetComposition;
}
