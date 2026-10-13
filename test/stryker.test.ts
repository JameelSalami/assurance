import assert from "node:assert/strict";
import test from "node:test";
import {
  bridgeStrykerReport, createAssuranceKernel, createDomainDigest
} from "../src/index.js";
import type { VariantResult } from "../src/types.js";

const domainDigest = createDomainDigest("stryker-bridge-test");
const kernel = createAssuranceKernel({
  domainDigest,
  schemas:{
    invariantPlan:"test.invariant/v1",
    variantPlan:"test.variant/v1",
    variantCampaignResult:"test.campaign/v1",
    coverageResult:"test.coverage/v1",
  }
});
const codeDigest = "sha256:"+"a".repeat(64);
const runnerDigest = "sha256:"+"b".repeat(64);
const plan = kernel.compileVariantPlan({
  contract: {
    digest:"sha256:"+"c".repeat(64),
    semantic: {
      laws:[{
        id:"pricing",source:{object:"price",clause:"threshold"},
        status:"mapped-current",faultModelBinding:"direct-source",
        mutationIds:["M0","M1"],verificationRows:["verification:V1"]
      }],
      mutations:["M0","M1"].map(id => ({
        id,source:{object:"price",clause:"threshold"},
        operator:"stryker-operator",equivalence:"non-equivalent-required-kill",
        expectedKillers:["test:a"],concreteKillers:[],fullyOwnedKiller:true
      })),
      ownedStages:[],deferredStages:[],
      basisRows:[{id:"V1",kind:"verification",suites:["0"],verificationClasses:["mutation"]}]
    }
  },
  candidateDigest: codeDigest,
  changedFiles:["src/price.js"]
});

const report = (secondStatus:"Killed"|"Survived"="Killed") => JSON.stringify({
  schemaVersion:"1.0",framework:{name:"StrykerJS",version:"10.0.0"},
  files:{"src/price.js":{language:"javascript",mutants:[
    {id:"0",mutatorName:"EqualityOperator",status:"Killed",killedBy:["0"]},
    {id:"1",mutatorName:"ConditionalExpression",status:secondStatus,
      ...(secondStatus==="Killed"?{killedBy:["0"]}:{})}
  ]}},
  testFiles:{"":{tests:[{id:"0",name:"All tests"}]}}
});
const make = (jsonReport:string, trusted:(arg:{reportDigest:string})=>boolean) =>
  bridgeStrykerReport({
    plan, mutantIds:{"variant:M0":"0","variant:M1":"1"},
    report:{jsonReport,runnerDigest,verifyReportOrigin:trusted},
    makeCampaign:(p,results:readonly VariantResult[]) =>
      kernel.createVariantCampaignResult(p,results)
  });

test("real Stryker JSON reporter schema maps all declared mutants and runner test inventory", () => {
  const result=make(report(),()=>true);
  assert.deepEqual(result.testInventory,["0"]);
  assert.equal(result.statusCounts.Killed,2);
  assert.equal(result.campaign.results.length,2);
  assert.equal(kernel.gateVariant(plan,result.campaign,result.verification).status,"passed");
  // Independent origin verifier cannot be omitted or trivially replaced.
  const untrusted=make(report(),()=>false);
  assert.equal(kernel.gateVariant(plan,untrusted.campaign,untrusted.verification).status,"blocked");
});

test("Stryker survives, invented killers, truncated reports and mismatched plans never pass", () => {
  const surviving=make(report("Survived"),()=>true);
  assert.equal(surviving.statusCounts.Survived,1);
  assert.equal(kernel.gateVariant(plan,surviving.campaign,surviving.verification).status,"failed");
  const tampered=JSON.parse(report());
  tampered.files["src/price.js"].mutants[0].killedBy=["fictional"];
  assert.throws(()=>make(JSON.stringify(tampered),()=>true),/unverified-stryker-killer/);
  const truncated=JSON.parse(report());
  truncated.files["src/price.js"].mutants.pop();
  assert.throws(()=>make(JSON.stringify(truncated),()=>true),/mapping-incomplete/);
  const extra=JSON.parse(report());
  extra.files["src/price.js"].mutants.push({id:"extra",status:"Survived"});
  assert.throws(()=>make(JSON.stringify(extra),()=>true),/mapping-incomplete/);
});
