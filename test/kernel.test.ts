import assert from "node:assert/strict";
import test from "node:test";
import {
  compileAssuranceDefinition,
  createAssuranceKernel,
  createDomainDigest,
  type AssuranceDefinition,
} from "../src/index.js";

const domainDigest = createDomainDigest("assurance-test");
const kernel = createAssuranceKernel({
  domainDigest,
  schemas: {
    invariantPlan: "test.invariant/v1",
    variantPlan: "test.variant/v1",
    variantCampaignResult: "test.campaign/v1",
    coverageResult: "test.coverage/v1",
  } as const,
});

const source = { object: "contract", clause: "law-a" };
const definition: AssuranceDefinition = {
  schema: "assurance.definition/v1",
  representations: [{ source, status: "closed", ready: true, evidenceIds: ["e"] }],
  laws: [{
    id: "law-a",
    source,
    status: "mapped-current",
    faultModelBinding: "direct-source",
    mutationIds: ["M1"],
    verificationRows: ["verification:V1"],
  }],
  mutations: [{
    id: "M1",
    source,
    operator: "break-a",
    equivalence: "non-equivalent-required-kill",
    expectedKillers: ["stage-a"],
    concreteKillers: [{
      caseId: "stage-a",
      fullyOwned: true,
      stages: [{ owners: ["project"], procedure: "verify a", procedureIndex: 0 }],
    }],
    fullyOwnedKiller: true,
  }],
  basisRows: [{
    id: "V1",
    kind: "verification",
    suites: ["test:a"],
    verificationClasses: ["conformance"],
  }],
  ownedStages: [{
    id: "stage-a",
    caseId: "stage-a",
    procedureIndex: 0,
    procedure: "verify a",
    allocation: "owned-here",
    owners: ["project"],
    sources: [source],
    formalProperties: [],
  }],
  deferredStages: [],
  blockers: [],
  authority: "none",
};

test("Contract canonical identity backs assurance domain digests", () => {
  const a = domainDigest("x.v1", { b: 2, a: 1 });
  const b = domainDigest("x.v1", { a: 1, b: 2 });
  assert.equal(a, b);
  assert.notEqual(a, domainDigest("y.v1", { a: 1, b: 2 }));
});

test("neutral assurance definition compiles to problem and exact contract", () => {
  const result = compileAssuranceDefinition(definition, domainDigest);
  assert.equal(result._tag, "AssuranceDefinition");
  if (result._tag !== "AssuranceDefinition") return;
  assert.equal(result.problem.readiness.gRepresentation, "passed");
  assert.equal(result.problem.readiness.gLaw, "passed");
  assert.match(result.contract.digest, /^[0-9a-f]{64}$/);
});

/**
 * Synthetic independent runner fixture. Production integrations must validate
 * trusted CI logs, executable test inventory and real kill outcomes themselves.
 */
const runnerDigest = "sha256:" + "1".repeat(64);
const executionDigest = "sha256:" + "2".repeat(64);
function independentFixtureVerification(
  plan: ReturnType<typeof kernel.compileVariantPlan>,
  campaign: ReturnType<typeof kernel.createVariantCampaignResult>,
) {
  return {
    receipts: campaign.results.filter(result => result.disposition === "killed")
      .flatMap(result => result.killerIds.map(killerId => ({
        schema: "assurance.variant-kill-evidence/v1" as const,
        planDigest: plan.digest,
        campaignDigest: campaign.digest,
        candidateDigest: plan.candidateDigest,
        variantId: result.variantId,
        killerId,
        oracleDigest: result.oracleDigest,
        runnerDigest,
        executionDigest,
        authority: "none" as const,
      }))),
    trustedVerifier: (receipt: {
      readonly runnerDigest: string; readonly executionDigest: string;
      readonly killerId: string; readonly candidateDigest: string;
    }) => receipt.runnerDigest === runnerDigest &&
      receipt.executionDigest === executionDigest &&
      receipt.killerId === "test:a" &&
      receipt.candidateDigest === "candidate",
  };
}

test("G-suite passes with frozen law, killed variant and evidence-backed coverage", () => {
  const compiled = compileAssuranceDefinition(definition, domainDigest);
  assert.equal(compiled._tag, "AssuranceDefinition");
  if (compiled._tag !== "AssuranceDefinition") return;

  assert.equal(kernel.gateRepresentation(compiled.problem).status, "passed");
  assert.equal(kernel.gateLaw(compiled.problem).status, "passed");

  const invariant = kernel.compileInvariantPlan(compiled.contract);
  assert.deepEqual(invariant.obligations[0]?.suites, ["test:a"]);

  const plan = kernel.compileVariantPlan({
    contract: compiled.contract,
    candidateDigest: "candidate",
    changedFiles: ["src/a.ts"],
  });
  const campaign = kernel.createVariantCampaignResult(plan, [{
    variantId: "variant:M1",
    disposition: "killed",
    killerIds: ["test:a"],
    oracleDigest: plan.variants[0]!.oracleDigest,
  }]);
  assert.deepEqual(plan.variants[0]?.allowedKillerIds, ["test:a"]);
  assert.equal(kernel.gateVariant(plan, campaign).status, "blocked");
  assert.equal(kernel.gateVariant(plan, campaign,
    independentFixtureVerification(plan, campaign)).status, "passed");

  const coverage = kernel.createCoverageResult(compiled.contract, [{
    stageId: "stage-a",
    state: "closed-here",
    evidenceDigests: ["evidence"],
  }]);
  assert.equal(kernel.gateCoverage(compiled.contract, coverage).status, "passed");
});

test("surviving required variant fails GV and incomplete representation blocks GR", () => {
  const blocked: AssuranceDefinition = {
    ...definition,
    representations: [{ ...definition.representations[0]!, ready: false, status: "missing" }],
  };
  const compiled = compileAssuranceDefinition(blocked, domainDigest);
  assert.equal(compiled._tag, "AssuranceDefinition");
  if (compiled._tag !== "AssuranceDefinition") return;
  assert.equal(kernel.gateRepresentation(compiled.problem).status, "blocked");

  const plan = kernel.compileVariantPlan({
    contract: compiled.contract,
    candidateDigest: "candidate",
    changedFiles: ["src/a.ts"],
  });
  const campaign = kernel.createVariantCampaignResult(plan, [{
    variantId: "variant:M1",
    disposition: "survived",
    killerIds: [],
    oracleDigest: plan.variants[0]!.oracleDigest,
  }]);
  assert.equal(kernel.gateVariant(plan, campaign).status, "failed");
});

function compiledFixture() {
  const compiled = compileAssuranceDefinition(definition, domainDigest);
  if (compiled._tag !== "AssuranceDefinition") {
    throw new Error("fixture refused: " + compiled.reason);
  }
  return compiled;
}

function variantFixture() {
  const { contract } = compiledFixture();
  const plan = kernel.compileVariantPlan({
    contract,
    candidateDigest: "candidate",
    changedFiles: ["src/a.ts"],
  });
  const killed = {
    variantId: plan.variants[0]!.id,
    disposition: "killed" as const,
    killerIds: ["test:a"],
    oracleDigest: plan.variants[0]!.oracleDigest,
  };
  return { contract, plan, killed };
}

test("G-REP and G-LAW do not pass vacuously empty evidence", () => {
  const empty = compileAssuranceDefinition({
    ...definition,
    representations: [],
    laws: [],
  }, domainDigest);
  assert.equal(empty._tag, "AssuranceDefinition");
  if (empty._tag !== "AssuranceDefinition") return;
  assert.equal(kernel.gateRepresentation(empty.problem).status, "blocked");
  assert.equal(kernel.gateLaw(empty.problem).status, "blocked");
});

test("G-LAW refuses a claimed killer that is not fully owned and concrete", () => {
  const mutation = definition.mutations[0]!;
  const bad = compileAssuranceDefinition({
    ...definition,
    mutations: [{
      ...mutation,
      fullyOwnedKiller: true,
      concreteKillers: mutation.concreteKillers.map((killer) => ({
        ...killer,
        fullyOwned: false,
      })),
    }],
  }, domainDigest);
  assert.equal(bad._tag, "AssuranceDefinition");
  if (bad._tag !== "AssuranceDefinition") return;
  assert.equal(kernel.gateLaw(bad.problem).status, "blocked");
  assert.match(kernel.gateLaw(bad.problem).blockers.join(","), /no-owned-expected-killer/);
});

test("G-VARIANT refuses every non-killed required mutant instead of accepting non-survival labels", () => {
  const { plan, killed } = variantFixture();
  for (const disposition of ["survived", "equivalent", "compile-invalid", "not-admitted"] as const) {
    const result = kernel.createVariantCampaignResult(plan, [{
      ...killed, disposition, killerIds: [],
    }]);
    const decision = kernel.gateVariant(plan, result);
    assert.equal(decision.status, "failed", disposition);
    assert.ok(decision.blockers.some((blocker) => blocker.includes(disposition)));
  }
  const good = kernel.createVariantCampaignResult(plan, [killed]);
  assert.equal(kernel.gateVariant(plan, good,
    independentFixtureVerification(plan, good)).status, "passed");
});

test("G-VARIANT requires exact cardinality, oracle identity and digest-bound results", () => {
  const { plan, killed } = variantFixture();
  assert.throws(() => kernel.createVariantCampaignResult(plan, []), /missing variant/);
  assert.throws(
    () => kernel.createVariantCampaignResult(plan, [killed, killed]),
    /duplicate variant/,
  );
  assert.throws(
    () => kernel.createVariantCampaignResult(plan, [killed, { ...killed, variantId: "variant:extra" }]),
    /unexpected variant/,
  );
  assert.throws(
    () => kernel.createVariantCampaignResult(plan, [{ ...killed, oracleDigest: "wrong" }]),
    /change oracle/,
  );
  const campaign = kernel.createVariantCampaignResult(plan, [killed]);
  assert.equal(kernel.gateVariant(plan, { ...campaign, results: [] }).status, "failed");
  assert.equal(kernel.gateVariant(plan, {
    ...campaign, results: [{ ...killed, killerIds: [] }],
  }).status, "failed");
  assert.equal(kernel.gateVariant({ ...plan, candidateDigest: "forged" }, campaign).status, "failed");
});

test("G-COVERAGE refuses stale, extra, missing and receipt-tampered stage evidence", () => {
  const { contract } = compiledFixture();
  const stage = {
    stageId: "stage-a",
    state: "closed-here" as const,
    evidenceDigests: ["evidence"],
  };
  const coverage = kernel.createCoverageResult(contract, [stage]);
  assert.equal(kernel.gateCoverage(contract, coverage).status, "passed");
  assert.throws(
    () => kernel.createCoverageResult(contract, [...coverage.stages, { ...stage, stageId: "extra" }]),
    /unknown stage/,
  );
  assert.equal(kernel.gateCoverage(contract, { ...coverage, stages: [] }).status, "blocked");
  assert.equal(kernel.gateCoverage(contract, {
    ...coverage, stages: [{ ...stage, evidenceDigests: ["substituted"] }],
  }).status, "blocked");
  assert.equal(kernel.gateCoverage(contract, {
    ...coverage, stages: [{ ...stage, state: "partial-valid" }],
  }).status, "blocked");
  assert.equal(kernel.gateCoverage(contract, {
    ...coverage, stages: [...coverage.stages, { ...stage, stageId: "extra" }],
  }).status, "blocked");
});
test("G-REP rejects claimed ready representations without current mapping evidence", () => {
  for (const mapping of [
    { ...definition.representations[0]!, status: "missing", ready: true },
    { ...definition.representations[0]!, status: "mapped-deferred", ready: true },
    { ...definition.representations[0]!, evidenceIds: [] },
  ]) {
    const compiled = compileAssuranceDefinition({
      ...definition, representations: [mapping],
    }, domainDigest);
    assert.equal(compiled._tag, "AssuranceDefinition");
    if (compiled._tag !== "AssuranceDefinition") continue;
    assert.equal(kernel.gateRepresentation(compiled.problem).status, "blocked");
  }
});


test("G-VARIANT refuses fictional killer IDs even with a self-consistent campaign", () => {
  const { plan, killed } = variantFixture();
  assert.deepEqual(plan.variants[0]?.allowedKillerIds, ["test:a"]);
  const invented = kernel.createVariantCampaignResult(plan, [{
    ...killed, killerIds: ["test:does-not-exist"],
  }]);
  const evidence = independentFixtureVerification(plan, invented);
  assert.equal(kernel.gateVariant(plan, invented, evidence).status, "failed");
  assert.match(kernel.gateVariant(plan, invented, evidence).blockers.join(","),
    /undeclared-killer:test:does-not-exist/);
  assert.equal(kernel.gateVariant(plan, invented, {
    ...evidence, trustedVerifier: () => true,
  }).status, "failed");
});

test("G-VARIANT never treats claims or digests as runner attestation by default", () => {
  const { plan, killed } = variantFixture();
  const campaign = kernel.createVariantCampaignResult(plan, [killed]);
  assert.equal(kernel.gateVariant(plan, campaign).status, "blocked");
  assert.match(kernel.gateVariant(plan, campaign).blockers.join(","),
    /missing-independent-variant-verifier/);
  const evidence = independentFixtureVerification(plan, campaign);
  assert.equal(kernel.gateVariant(plan, campaign, {
    receipts: [], trustedVerifier: () => true,
  }).status, "blocked");

  const untrusted = kernel.gateVariant(plan, campaign, {
    ...evidence, trustedVerifier: () => false,
  });
  assert.equal(untrusted.status, "blocked");
  assert.match(untrusted.blockers.join(","), /untrusted-variant-execution-receipt/);
  assert.equal(kernel.gateVariant(plan, campaign, {
    ...evidence, trustedVerifier: () => { throw Error("not trusted"); },
  }).status, "blocked");

  const altered = evidence.receipts[0]!;
  for (const receipt of [
    { ...altered, candidateDigest: "different-candidate" },
    { ...altered, campaignDigest: "different-campaign" },
    { ...altered, oracleDigest: "different-oracle" },
  ]) {
    const decision = kernel.gateVariant(plan, campaign, {
      ...evidence, receipts: [receipt],
    });
    assert.equal(decision.status, "failed");
    assert.match(decision.blockers.join(","), /stale-variant-execution-receipt/);
  }
  const extra = { ...altered, killerId: "test:unplanned" };
  assert.equal(kernel.gateVariant(plan, campaign, {
    ...evidence, receipts: [altered, extra],
  }).status, "failed");
  assert.equal(kernel.gateVariant(plan, campaign, {
    ...evidence, receipts: [altered, altered],
  }).status, "failed");
  assert.equal(kernel.gateVariant(plan, campaign, {
    ...evidence, receipts: [{ ...altered, executionDigest: "not-a-digest" }],
  }).status, "failed");
  assert.equal(kernel.gateVariant(plan, campaign, evidence).status, "passed");
});

test("G-VARIANT blocks kills when no verification suite is declared in the frozen plan", () => {
  const { contract } = compiledFixture();
  const missingSuites = {
    ...contract,
    semantic: {
      ...contract.semantic,
      basisRows: contract.semantic.basisRows.map(row => ({
        ...row, suites: [],
      })),
    },
  };
  const plan = kernel.compileVariantPlan({
    contract: missingSuites,
    candidateDigest: "candidate",
    changedFiles: ["src/a.ts"],
  });
  assert.deepEqual(plan.variants[0]?.allowedKillerIds, []);
  const result = kernel.createVariantCampaignResult(plan, [{
    variantId: plan.variants[0]!.id,
    disposition: "killed",
    killerIds: ["test:a"],
    oracleDigest: plan.variants[0]!.oracleDigest,
  }]);
  assert.equal(kernel.gateVariant(plan, result,
    independentFixtureVerification(plan, result)).status, "failed");
});


test("G-VARIANT catches a campaign claiming a different bound plan even with matching self-hash", () => {
  const { plan, killed } = variantFixture();
  const original = kernel.createVariantCampaignResult(plan, [killed]);
  const wrongPlanDigest = "different-plan";
  const body = {
    schema: original.schema,
    planDigest: wrongPlanDigest,
    results: original.results,
    authority: "none" as const,
  };
  const campaign = {
    ...original,
    ...body,
    digest: domainDigest("variant-campaign-result.v1", body),
  };
  const verification = independentFixtureVerification(plan, campaign);
  const gate = kernel.gateVariant(plan, campaign, verification);
  assert.equal(gate.status, "failed");
  assert.match(gate.blockers.join(","), /campaign-plan-digest-mismatch/);
});

test("G-LAW rejects unowned killer even when concrete stage itself is present", () => {
  const mutation = definition.mutations[0]!;
  const compiled = compileAssuranceDefinition({
    ...definition,
    mutations: [{ ...mutation, fullyOwnedKiller: false }],
  }, domainDigest);
  assert.equal(compiled._tag, "AssuranceDefinition");
  if (compiled._tag !== "AssuranceDefinition") return;
  const decision = kernel.gateLaw(compiled.problem);
  assert.equal(decision.status, "blocked");
  assert.match(decision.blockers.join(","), /no-fully-owned-killer/);
});
