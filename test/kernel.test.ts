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
  assert.equal(kernel.gateVariant(plan, campaign).status, "passed");

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
  assert.equal(kernel.gateVariant(plan, good).status, "passed");
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
