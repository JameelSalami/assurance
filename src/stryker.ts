import { contentDigest } from "@durable-systems/contract";
import type {
  VariantPlan, VariantResult, VariantCampaignResult,
  VariantKillEvidenceReceipt, VariantEvidenceVerification
} from "./types.js";

/** Mutation Testing Elements JSON report, as emitted by Stryker's json reporter. */
interface StrykerReport {
  readonly schemaVersion: string;
  readonly framework: { readonly name: string; readonly version: string };
  readonly files: Record<string, {
    readonly mutants: readonly {
      readonly id: string;
      readonly status: string;
      readonly killedBy?: readonly string[];
    }[];
  }>;
  readonly testFiles: Record<string, {
    readonly tests: readonly { readonly id: string; readonly name: string }[];
  }>;
}

export interface VerifiedStrykerRun {
  /** Unmodified JSON bytes retained by the trusted host after runner completion. */
  readonly jsonReport: string;
  readonly runnerDigest: string;
  /**
   * Caller-supplied trust boundary: independently verify CI job identity,
   * candidate commit, pinned runner binary, command exit/status, and exact
   * report bytes. Hash equality alone is NOT authentication.
   */
  readonly verifyReportOrigin: (report: {
    readonly reportDigest: string;
    readonly candidateDigest: string;
    readonly runnerDigest: string;
    readonly frameworkVersion: string;
  }) => boolean;
}

export interface StrykerBridgeResult<S extends string> {
  readonly reportDigest: string;
  readonly testInventory: readonly string[];
  readonly frameworkVersion: string;
  readonly campaign: VariantCampaignResult<S>;
  readonly verification: VariantEvidenceVerification;
  readonly statusCounts: Readonly<Record<string, number>>;
}

const reportDigest = (text: string) => contentDigest(text);

const record = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

function parseStrykerReport(input: string): StrykerReport {
  let report: unknown;
  try { report = JSON.parse(input); }
  catch { throw Error("invalid-stryker-report-json"); }
  if (!record(report) ||
      !record(report.framework) ||
      report.framework.name !== "StrykerJS" ||
      typeof report.framework.version !== "string" ||
      typeof report.schemaVersion !== "string" ||
      !record(report.files) || !record(report.testFiles)) {
    throw Error("invalid-stryker-report");
  }
  for (const file of Object.values(report.files)) {
    if (!record(file) || !Array.isArray(file.mutants)) {
      throw Error("invalid-stryker-mutants");
    }
    for (const raw of file.mutants) {
      if (!record(raw) || typeof raw.id !== "string" ||
          typeof raw.status !== "string" ||
          (raw.killedBy !== undefined && (!Array.isArray(raw.killedBy) ||
            !raw.killedBy.every((id: unknown) => typeof id === "string")))) {
        throw Error("invalid-stryker-mutant");
      }
    }
  }
  for (const file of Object.values(report.testFiles)) {
    if (!record(file) || !Array.isArray(file.tests) ||
        !file.tests.every(t => record(t) &&
          typeof t.id === "string" && typeof t.name === "string")) {
      throw Error("invalid-stryker-test-inventory");
    }
  }
  return report as unknown as StrykerReport;
}

/**
 * Convert an actual Stryker JSON report to an exact Assurance campaign.
 * All Stryker mutants MUST be mapped; you cannot silently cherry-pick
 * killed mutants while ignoring surviving ones. KilledBy IDs are checked
 * against Stryker's reported test inventory and the FROZEN plan suites.
 *
 * Trust is never inferred from JSON or hashes. Positive G-VARIANT requires
 * the caller's independently implemented verifyReportOrigin callback.
 */
export function bridgeStrykerReport<const S extends string>(input: {
  readonly plan: VariantPlan;
  readonly report: VerifiedStrykerRun;
  /** Exact plan variant ID -> Stryker global mutant ID. */
  readonly mutantIds: Readonly<Record<string, string>>;
  readonly makeCampaign: (plan: VariantPlan, results: readonly VariantResult[]) => VariantCampaignResult<S>;
}): StrykerBridgeResult<S> {
  const { plan } = input;
  const report = parseStrykerReport(input.report.jsonReport);
  const mutantMap = new Map<string, StrykerReport["files"][string]["mutants"][number]>();
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      if (mutantMap.has(mutant.id)) throw Error("duplicate-stryker-mutant-id:" + mutant.id);
      mutantMap.set(mutant.id, mutant);
    }
  }
  const inventory = new Set<string>();
  for (const file of Object.values(report.testFiles)) {
    for (const test of file.tests) {
      if (inventory.has(test.id)) throw Error("duplicate-stryker-test-id:" + test.id);
      inventory.add(test.id);
    }
  }
  if (inventory.size === 0 || mutantMap.size === 0) {
    throw Error("empty-stryker-report-or-inventory");
  }
  const planned = new Set(plan.variants.map(v => v.id));
  const assigned = Object.entries(input.mutantIds);
  if (assigned.length !== planned.size ||
      assigned.some(([id]) => !planned.has(id)) ||
      new Set(assigned.map(([, id]) => id)).size !== assigned.length ||
      assigned.some(([, id]) => !mutantMap.has(id)) ||
      assigned.length !== mutantMap.size) {
    throw Error("stryker-plan-mapping-incomplete-or-excess");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(input.report.runnerDigest)) {
    throw Error("invalid-stryker-runner-digest");
  }
  const statuses: Record<string, number> = {};
  const results: VariantResult[] = [];
  for (const variant of plan.variants) {
    const mutant = mutantMap.get(input.mutantIds[variant.id]!);
    if (!mutant) throw Error("unmapped-stryker-mutant:" + variant.id);
    const status = mutant.status;
    statuses[status] = (statuses[status] ?? 0) + 1;
    const disposition = status === "Killed" ? "killed" as const
      : status === "Survived" ? "survived" as const
      : status === "CompileError" ? "compile-invalid" as const
      : "not-admitted" as const;
    const killerIds = disposition === "killed" ? [...(mutant.killedBy ?? [])] : [];
    if (disposition === "killed" &&
        (killerIds.length === 0 || killerIds.some(id => !inventory.has(id)) ||
         new Set(killerIds).size !== killerIds.length)) {
      throw Error("unverified-stryker-killer-id:" + variant.id);
    }
    // Even a real Stryker reporter doesn't override the predeclared plan.
    if (killerIds.some(id => !variant.allowedKillerIds.includes(id))) {
      throw Error("stryker-killer-not-in-frozen-plan:" + variant.id);
    }
    results.push({ variantId: variant.id, disposition,
      killerIds, oracleDigest: variant.oracleDigest });
  }
  const campaign = input.makeCampaign(plan, results);
  const digest = reportDigest(input.report.jsonReport);
  const receipts: VariantKillEvidenceReceipt[] = results
    .filter(result => result.disposition === "killed")
    .flatMap(result => result.killerIds.map(killerId => ({
      schema: "assurance.variant-kill-evidence/v1",
      planDigest: plan.digest, campaignDigest: campaign.digest,
      candidateDigest: plan.candidateDigest,
      variantId: result.variantId, killerId,
      oracleDigest: result.oracleDigest,
      runnerDigest: input.report.runnerDigest,
      executionDigest: digest,
      authority: "none"
    })));
  const bound = new Set(receipts.map(r => JSON.stringify([r.variantId,r.killerId])));
  return {
    reportDigest: digest,
    testInventory: [...inventory].sort(),
    frameworkVersion: report.framework.version,
    campaign,
    verification: {
      receipts,
      trustedVerifier: receipt => {
        if (!bound.has(JSON.stringify([receipt.variantId,receipt.killerId])) ||
            receipt.executionDigest !== digest ||
            receipt.campaignDigest !== campaign.digest ||
            receipt.planDigest !== plan.digest ||
            receipt.runnerDigest !== input.report.runnerDigest ||
            receipt.candidateDigest !== plan.candidateDigest) return false;
        try {
          return input.report.verifyReportOrigin({
            reportDigest: digest,
            candidateDigest: plan.candidateDigest,
            runnerDigest: input.report.runnerDigest,
            frameworkVersion: report.framework.version
          }) === true;
        } catch { return false; }
      }
    },
    statusCounts: statuses
  };
}
