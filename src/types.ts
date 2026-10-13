export type GateId = "G-REP" | "G-LAW" | "G-VARIANT" | "G-COVERAGE";

export interface GateDisposition {
  readonly gate: GateId;
  readonly status: "passed" | "failed" | "blocked";
  readonly blockers: readonly string[];
  readonly digest: string;
  readonly authority: "none";
}

export interface SourceRef {
  readonly object: string;
  readonly clause: string;
}

export interface ConcreteKiller {
  readonly caseId: string;
  readonly fullyOwned: boolean;
  readonly stages: readonly {
    readonly owners: readonly string[];
    readonly procedure: string;
    readonly procedureIndex: number;
  }[];
}

export interface MutationBinding {
  readonly id: string;
  readonly source: SourceRef;
  readonly operator: string;
  readonly equivalence: string;
  readonly expectedKillers: readonly string[];
  readonly concreteKillers: readonly ConcreteKiller[];
  readonly fullyOwnedKiller: boolean;
}

export interface LawBinding {
  readonly id: string;
  readonly source: SourceRef;
  readonly status: string;
  readonly faultModelBinding: string;
  readonly mutationIds: readonly string[];
  readonly verificationRows: readonly string[];
}

export interface RepresentationMapping {
  readonly source: SourceRef;
  readonly status: string;
  readonly ready: boolean;
  readonly evidenceIds: readonly string[];
}

export interface StageBinding {
  readonly id: string;
  readonly caseId: string;
  readonly procedureIndex: number;
  readonly procedure: string;
  readonly allocation: string;
  readonly owners: readonly string[];
  readonly sources: readonly SourceRef[];
  readonly formalProperties: readonly string[];
}

export interface BasisRow {
  readonly id: string;
  readonly kind: string;
  readonly suites: readonly string[];
  readonly verificationClasses: readonly string[];
}

export interface Blocker {
  readonly gate: "G-REP" | "G-LAW" | "other";
  readonly source: string;
  readonly reason: string;
}

export interface AssuranceProblem {
  readonly readiness: {
    readonly gRepresentation: string;
    readonly gLaw: string;
  };
  readonly representationMappings: readonly RepresentationMapping[];
  readonly laws: readonly LawBinding[];
  readonly mutations: readonly MutationBinding[];
  readonly basisRows: readonly BasisRow[];
  readonly blockers: readonly Blocker[];
}

export interface AssuranceContract {
  readonly digest: string;
  readonly semantic: {
    readonly laws: readonly LawBinding[];
    readonly mutations: readonly MutationBinding[];
    readonly ownedStages: readonly StageBinding[];
    readonly deferredStages: readonly StageBinding[];
    readonly basisRows: readonly BasisRow[];
  };
}

export interface InvariantObligation {
  readonly id: string;
  readonly sourceIds: readonly string[];
  readonly verificationClasses: readonly string[];
  readonly suites: readonly string[];
  readonly formalProperties: readonly string[];
  readonly stages: readonly string[];
  readonly requiresShrinking: boolean;
}

export interface InvariantPlan<S extends string = string> {
  readonly schema: S;
  readonly builderContractDigest: string;
  readonly obligations: readonly InvariantObligation[];
  readonly digest: string;
  readonly authority: "none";
}

export interface VariantDescriptor {
  readonly id: string;
  readonly mutationId: string;
  readonly operator: string;
  readonly sourceId: string;
  readonly oracleDigest: string;
  /** Frozen suite IDs derived from the mutation's declared verification rows. */
  readonly allowedKillerIds: readonly string[];
}

export interface VariantPlan<S extends string = string> {
  readonly schema: S;
  readonly builderContractDigest: string;
  readonly candidateDigest: string;
  readonly changedFiles: readonly string[];
  readonly variants: readonly VariantDescriptor[];
  readonly digest: string;
  readonly authority: "none";
}

export type VariantDisposition =
  | "killed"
  | "survived"
  | "equivalent"
  | "compile-invalid"
  | "not-admitted";

export interface VariantResult {
  readonly variantId: string;
  readonly disposition: VariantDisposition;
  readonly killerIds: readonly string[];
  readonly oracleDigest: string;
}

export interface VariantCampaignResult<S extends string = string> {
  readonly schema: S;
  readonly planDigest: string;
  readonly results: readonly VariantResult[];
  readonly digest: string;
  readonly authority: "none";
}

/**
 * Externally produced evidence of a specific test killing a specific variant.
 * This is a reference, NOT a cryptographic attestation. The host verifier
 * must check it against real runner logs, test inventory and trusted origin.
 */
export interface VariantKillEvidenceReceipt {
  readonly schema: "assurance.variant-kill-evidence/v1";
  readonly planDigest: string;
  readonly campaignDigest: string;
  readonly candidateDigest: string;
  readonly variantId: string;
  readonly killerId: string;
  readonly oracleDigest: string;
  readonly runnerDigest: string;
  readonly executionDigest: string;
  readonly authority: "none";
}

export interface VariantEvidenceVerification {
  readonly receipts: readonly VariantKillEvidenceReceipt[];
  /**
   * Independently verify origin, runner execution, test existence and kill
   * semantics. Never implement by blindly returning true in production.
   */
  readonly trustedVerifier: (receipt: VariantKillEvidenceReceipt) => boolean;
}

export interface CoverageStageResult {
  readonly stageId: string;
  readonly state:
    | "closed-here"
    | "partial-valid"
    | "blocked-implementation"
    | "blocked-oracle"
    | "blocked-dependency"
    | "not-yet-applicable"
    | "unaffected";
  readonly evidenceDigests: readonly string[];
}

export interface CoverageResult<S extends string = string> {
  readonly schema: S;
  readonly builderContractDigest: string;
  readonly stages: readonly CoverageStageResult[];
  readonly digest: string;
  readonly authority: "none";
}

export interface AssuranceSchemas {
  readonly invariantPlan: string;
  readonly variantPlan: string;
  readonly variantCampaignResult: string;
  readonly coverageResult: string;
}

export type DomainDigest = (domain: string, value: unknown) => string;
