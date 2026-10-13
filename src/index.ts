export { createDomainDigest } from "./digest.js";
export { createAssuranceKernel } from "./kernel.js";
export { compileAssuranceDefinition } from "./definition.js";

export type {
  AssuranceContract,
  AssuranceProblem,
  AssuranceSchemas,
  BasisRow,
  Blocker,
  ConcreteKiller,
  CoverageResult,
  CoverageStageResult,
  DomainDigest,
  GateDisposition,
  GateId,
  InvariantObligation,
  InvariantPlan,
  LawBinding,
  MutationBinding,
  RepresentationMapping,
  SourceRef,
  StageBinding,
  VariantCampaignResult,
  VariantEvidenceVerification,
  VariantKillEvidenceReceipt,
  VariantDescriptor,
  VariantDisposition,
  VariantPlan,
  VariantResult,
} from "./types.js";

export type {
  AssuranceDefinition,
  AssuranceDefinitionResult,
} from "./definition.js";
export { qualifyExtension } from "./extension.js";
export type { ExtensionCheckReceipt, ExtensionQualification } from "./extension.js";
export { bridgeStrykerReport } from "./stryker.js";
export type { VerifiedStrykerRun, StrykerBridgeResult } from "./stryker.js";
