import type {
  AssuranceContract,
  AssuranceProblem,
  AssuranceSchemas,
  CoverageResult,
  CoverageStageResult,
  DomainDigest,
  GateDisposition,
  InvariantPlan,
  MutationBinding,
  StageBinding,
  VariantCampaignResult,
  VariantPlan,
  VariantResult,
} from "./types.js";

function sid(source: { readonly object: string; readonly clause: string }): string {
  return source.object + ":" + source.clause;
}

function mutationBlockers(mutation: MutationBinding): readonly string[] {
  const out: string[] = [];
  if (mutation.equivalence !== "non-equivalent-required-kill") {
    out.push(mutation.id + ":invalid-equivalence-policy");
  }
  if (!mutation.fullyOwnedKiller) out.push(mutation.id + ":no-fully-owned-killer");
  if (mutation.expectedKillers.length === 0) out.push(mutation.id + ":no-expected-killer");
  if (mutation.concreteKillers.length === 0) out.push(mutation.id + ":no-concrete-killer");
  const owned = new Set(
    mutation.concreteKillers.filter((killer) =>
      killer.fullyOwned && killer.stages.length > 0 &&
      killer.stages.every((stage) => stage.owners.length > 0)
    ).map((killer) => killer.caseId),
  );
  for (const expected of mutation.expectedKillers) {
    if (!owned.has(expected)) out.push(mutation.id + ":no-owned-expected-killer:" + expected);
  }
  return out;
}

export function createAssuranceKernel<const S extends AssuranceSchemas>(options: {
  readonly domainDigest: DomainDigest;
  readonly schemas: S;
}) {
  const domainDigest = options.domainDigest;

  function gateRepresentation(problem: AssuranceProblem): GateDisposition {
    const blockers = [
      ...problem.blockers
        .filter((blocker) => blocker.gate === "G-REP")
        .map((blocker) => blocker.source + ":" + blocker.reason),
      ...problem.representationMappings
        .filter((mapping) => !mapping.ready || !["closed", "mapped-current"].includes(mapping.status) || mapping.evidenceIds.length === 0)
        .map((mapping) => sid(mapping.source) + ":" + (mapping.evidenceIds.length === 0 ? "no-evidence" : mapping.status)),
    ];
    if (problem.representationMappings.length === 0) blockers.push("no-representation-mappings");
    const status =
      problem.readiness.gRepresentation === "passed" && blockers.length === 0
        ? ("passed" as const)
        : ("blocked" as const);
    const body = {
      gate: "G-REP" as const,
      status,
      blockers: blockers.sort(),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("gate-representation.v1", body) };
  }

  function gateLaw(problem: AssuranceProblem): GateDisposition {
    const blockers: string[] = problem.blockers
      .filter((blocker) => blocker.gate === "G-LAW")
      .map((blocker) => blocker.source + ":" + blocker.reason);
    const mutations = new Map(problem.mutations.map((mutation) => [mutation.id, mutation]));
    if (problem.laws.length === 0) blockers.push("no-admitted-laws");

    for (const law of problem.laws) {
      if (law.status !== "mapped-current" && law.status !== "mapped-deferred") {
        blockers.push(law.id + ":invalid-mapping-status:" + law.status);
      }
      if (
        law.faultModelBinding !== "direct-source" &&
        law.faultModelBinding !== "explicit-cross-source"
      ) {
        blockers.push(law.id + ":invalid-fault-model-binding:" + law.faultModelBinding);
      }
      if (law.mutationIds.length === 0) blockers.push(law.id + ":no-frozen-fault-model");
      for (const mutationId of law.mutationIds) {
        const mutation = mutations.get(mutationId);
        if (!mutation) blockers.push(law.id + ":missing-mutation:" + mutationId);
        else blockers.push(...mutationBlockers(mutation));
      }
      if (law.verificationRows.length === 0) {
        blockers.push(law.id + ":no-independent-verification-row");
      }
    }

    const status =
      problem.readiness.gLaw === "passed" && blockers.length === 0
        ? ("passed" as const)
        : ("blocked" as const);
    const body = {
      gate: "G-LAW" as const,
      status,
      blockers: [...new Set(blockers)].sort(),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("gate-law.v1", body) };
  }

  function verificationForStage(
    stage: StageBinding,
    contract: AssuranceContract,
  ): { classes: string[]; suites: string[] } {
    const sourceIds = new Set(stage.sources.map(sid));
    const rowIds = new Set(
      contract.semantic.laws
        .filter((law) => sourceIds.has(sid(law.source)))
        .flatMap((law) => law.verificationRows),
    );
    const rows = contract.semantic.basisRows.filter((row) =>
      rowIds.has(row.kind + ":" + row.id),
    );
    return {
      classes: [...new Set(rows.flatMap((row) => row.verificationClasses))].sort(),
      suites: [...new Set(rows.flatMap((row) => row.suites))].sort(),
    };
  }

  function compileInvariantPlan(
    contract: AssuranceContract,
  ): InvariantPlan<S["invariantPlan"]> {
    const obligations = contract.semantic.ownedStages
      .map((stage) => {
        const verification = verificationForStage(stage, contract);
        const sourceIds = stage.sources.map(sid).sort();
        const requiresShrinking = verification.classes.some(
          (value) =>
            value === "property" ||
            value === "state-model" ||
            value === "boundary-fuzz",
        );
        return {
          id: "invariant:" + stage.id,
          sourceIds,
          verificationClasses: verification.classes,
          suites: verification.suites,
          formalProperties: stage.formalProperties,
          stages: [stage.id],
          requiresShrinking,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const body = {
      schema: options.schemas.invariantPlan,
      builderContractDigest: contract.digest,
      obligations,
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("invariant-plan.v1", body) };
  }

  function compileVariantPlan(input: {
    readonly contract: AssuranceContract;
    readonly candidateDigest: string;
    readonly changedFiles: readonly string[];
  }): VariantPlan<S["variantPlan"]> {
    const oracleDigest = domainDigest("variant-oracle.v1", {
      builderContractDigest: input.contract.digest,
      laws: input.contract.semantic.laws.map((law) => ({
        id: law.id,
        source: law.source,
        verificationRows: law.verificationRows,
      })),
    });
    const variants =
      input.changedFiles.length === 0
        ? []
        : input.contract.semantic.mutations.map((mutation) => ({
            id: "variant:" + mutation.id,
            mutationId: mutation.id,
            operator: mutation.operator,
            sourceId: sid(mutation.source),
            oracleDigest,
          }));

    const body = {
      schema: options.schemas.variantPlan,
      builderContractDigest: input.contract.digest,
      candidateDigest: input.candidateDigest,
      changedFiles: [...new Set(input.changedFiles)].sort(),
      variants,
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("variant-plan.v1", body) };
  }

  function createVariantCampaignResult(
    plan: VariantPlan<S["variantPlan"]>,
    results: readonly VariantResult[],
  ): VariantCampaignResult<S["variantCampaignResult"]> {
    const byId = new Map(results.map((result) => [result.variantId, result]));
    if (byId.size !== results.length) throw new Error("duplicate variant result");
    const expected = new Set(plan.variants.map((variant) => variant.id));
    for (const id of byId.keys()) {
      if (!expected.has(id)) throw new Error("unexpected variant result: " + id);
    }
    for (const variant of plan.variants) {
      const result = byId.get(variant.id);
      if (!result) throw new Error("missing variant result: " + variant.id);
      if (result.oracleDigest !== variant.oracleDigest) {
        throw new Error("variant attempted to change oracle: " + variant.id);
      }
    }

    const body = {
      schema: options.schemas.variantCampaignResult,
      planDigest: plan.digest,
      results: [...results].sort((a, b) => a.variantId.localeCompare(b.variantId)),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("variant-campaign-result.v1", body) };
  }

  function gateVariant(
    plan: VariantPlan<S["variantPlan"]>,
    campaign: VariantCampaignResult<S["variantCampaignResult"]>,
  ): GateDisposition {
    const blockers: string[] = [];
    const expectedPlanDigest = domainDigest("variant-plan.v1", {
      schema: plan.schema,
      builderContractDigest: plan.builderContractDigest,
      candidateDigest: plan.candidateDigest,
      changedFiles: plan.changedFiles,
      variants: plan.variants,
      authority: "none",
    });
    if (plan.digest !== expectedPlanDigest) blockers.push("variant-plan-digest-mismatch");
    if (campaign.planDigest !== plan.digest) blockers.push("campaign-plan-digest-mismatch");
    const expectedCampaignDigest = domainDigest("variant-campaign-result.v1", {
      schema: campaign.schema,
      planDigest: campaign.planDigest,
      results: campaign.results,
      authority: "none",
    });
    if (campaign.digest !== expectedCampaignDigest) blockers.push("campaign-result-digest-mismatch");
    if (plan.changedFiles.length > 0 && plan.variants.length === 0) {
      blockers.push("changed-production-without-admitted-variants");
    }
    if (plan.changedFiles.length === 0 && plan.variants.length > 0) {
      blockers.push("variants-without-changed-production");
    }
    const variants = new Map(plan.variants.map((variant) => [variant.id, variant]));
    if (variants.size !== plan.variants.length) blockers.push("duplicate-planned-variant");
    const seen = new Set<string>();
    for (const result of campaign.results) {
      if (seen.has(result.variantId)) blockers.push(result.variantId + ":duplicate-result");
      seen.add(result.variantId);
      const variant = variants.get(result.variantId);
      if (!variant) {
        blockers.push(result.variantId + ":unexpected-result");
        continue;
      }
      if (result.oracleDigest !== variant.oracleDigest) {
        blockers.push(result.variantId + ":oracle-digest-mismatch");
      }
      if (result.disposition !== "killed") {
        blockers.push(result.variantId + ":" + result.disposition);
      } else if (
        result.killerIds.length === 0 ||
        result.killerIds.some((id) => id.trim() === "") ||
        new Set(result.killerIds).size !== result.killerIds.length
      ) {
        blockers.push(result.variantId + ":invalid-killer-evidence");
      }
    }
    for (const variant of plan.variants) {
      if (!seen.has(variant.id)) blockers.push(variant.id + ":missing-result");
    }
    const status = blockers.length === 0 ? ("passed" as const) : ("failed" as const);
    const body = {
      gate: "G-VARIANT" as const,
      status,
      blockers: [...new Set(blockers)].sort(),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("gate-variant.v1", body) };
  }

  function createCoverageResult(
    contract: AssuranceContract,
    stages: readonly CoverageStageResult[],
  ): CoverageResult<S["coverageResult"]> {
    const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
    if (byId.size !== stages.length) throw new Error("duplicate coverage stage");
    const expected = new Set([
      ...contract.semantic.ownedStages.map((stage) => stage.id),
      ...contract.semantic.deferredStages.map((stage) => stage.id),
    ]);
    for (const id of byId.keys()) {
      if (!expected.has(id)) throw new Error("coverage result for unknown stage: " + id);
    }

    const body = {
      schema: options.schemas.coverageResult,
      builderContractDigest: contract.digest,
      stages: [...stages].sort((a, b) => a.stageId.localeCompare(b.stageId)),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("coverage-result.v1", body) };
  }

  function gateCoverage(
    contract: AssuranceContract,
    coverage: CoverageResult<S["coverageResult"]>,
  ): GateDisposition {
    const blockers: string[] = [];
    if (coverage.builderContractDigest !== contract.digest) {
      blockers.push("coverage-contract-digest-mismatch");
    }
    const expectedDigest = domainDigest("coverage-result.v1", {
      schema: coverage.schema,
      builderContractDigest: coverage.builderContractDigest,
      stages: coverage.stages,
      authority: "none",
    });
    if (coverage.digest !== expectedDigest) blockers.push("coverage-result-digest-mismatch");
    const byId = new Map(coverage.stages.map((stage) => [stage.stageId, stage]));
    if (byId.size !== coverage.stages.length) blockers.push("duplicate-coverage-stage");
    const expected = new Set([
      ...contract.semantic.ownedStages.map((stage) => stage.id),
      ...contract.semantic.deferredStages.map((stage) => stage.id),
    ]);
    for (const id of byId.keys()) {
      if (!expected.has(id)) blockers.push(id + ":unexpected-coverage-stage");
    }
    for (const stage of contract.semantic.ownedStages) {
      const observed = byId.get(stage.id);
      if (!observed) blockers.push(stage.id + ":missing");
      else if (observed.state !== "closed-here") {
        blockers.push(stage.id + ":" + observed.state);
      } else if (
        observed.evidenceDigests.length === 0 ||
        observed.evidenceDigests.some((digest) => digest.trim() === "")
      ) {
        blockers.push(stage.id + ":no-evidence");
      }
    }
    for (const stage of contract.semantic.deferredStages) {
      if (stage.owners.length === 0) blockers.push(stage.id + ":deferred-without-owner");
    }

    const status = blockers.length === 0 ? ("passed" as const) : ("blocked" as const);
    const body = {
      gate: "G-COVERAGE" as const,
      status,
      blockers: [...new Set(blockers)].sort(),
      authority: "none" as const,
    };
    return { ...body, digest: domainDigest("gate-coverage.v1", body) };
  }

  return {
    gateRepresentation,
    gateLaw,
    compileInvariantPlan,
    compileVariantPlan,
    createVariantCampaignResult,
    gateVariant,
    createCoverageResult,
    gateCoverage,
  };
}