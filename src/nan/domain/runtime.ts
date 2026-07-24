/**
 * Engine-neutral NAN runtime contract.
 *
 * This module deliberately imports no adapter, package-manager, or game-engine API.
 * Keep it deterministic so recommendations can be reviewed and tested without tools.
 */
export type RuntimeTarget = "web" | "android" | "ios" | "macos";
export type CheckStatus = "pass" | "fail" | "not-verified";

export interface RuntimeDescriptor {
  id: string;
  name: string;
  version: string;
  kind: "web-2d" | "web-3d" | "native" | "custom";
  description: string;
  suitedTags: string[];
  capabilities: string[];
  supportedTargets: RuntimeTarget[];
  license: string;
  licenseRisk: "low" | "medium" | "high";
}

export interface RuntimeContext {
  projectRoot: string;
  targets: RuntimeTarget[];
}

export interface RuntimeCheck {
  id: string;
  status: CheckStatus;
  detail: string;
}

export interface RuntimeCheckReport {
  runtime: string;
  status: CheckStatus;
  checks: RuntimeCheck[];
}

export interface ScaffoldOptions {
  projectRoot: string;
  destination: string;
  targets: RuntimeTarget[];
  projectName: string;
}

export interface ScaffoldReport {
  runtime: string;
  status: "applied" | "unchanged" | "conflict" | "failed";
  created: string[];
  unchanged: string[];
  conflicts: string[];
  message?: string;
}

export interface InstallReport {
  runtime: string;
  status: "installed" | "skipped" | "failed";
  command?: string;
  message?: string;
}

export interface VerificationReport {
  runtime: string;
  status: CheckStatus;
  targets: Array<{ target: RuntimeTarget; status: CheckStatus; detail: string }>;
}

export interface RuntimeAdapter {
  descriptor(): RuntimeDescriptor;
  doctor(context: RuntimeContext): RuntimeCheckReport;
  scaffold(options: ScaffoldOptions): ScaffoldReport;
  install(projectRoot: string): InstallReport;
  verify(projectRoot: string, targets: RuntimeTarget[]): VerificationReport;
}

export interface TargetAdapterDescriptor {
  id: string;
  version: string;
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
  compose(options: ScaffoldOptions): TargetComposition;
}

export interface ConceptAxes {
  space: string;
  coreVerb: string;
  systemBehavior: string;
  pressure: string;
  themeCoupling: string;
  visualReward: string;
}

export interface NanConcept {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  axes: ConceptAxes;
  representativeScene: string;
  newCoreSystems: string[];
  hardGates: Record<string, boolean>;
  score: Record<string, number>;
  approvedBy?: string;
}

export interface RuntimeRecommendation {
  runtime: RuntimeDescriptor;
  score: number;
  breakdown: {
    conceptFit: number;
    verticalSlice: number;
    buildReadiness: number;
    teamReadiness: number;
    deploymentStability: number;
    licenseRisk: number;
  };
  reasons: string[];
}
