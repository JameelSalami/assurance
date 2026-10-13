import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bridgeStrykerReport, createDomainDigest, createAssuranceKernel
} from "../../dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const sha = bytes => "sha256:"+createHash("sha256").update(bytes).digest("hex");
const executable = join(root,"node_modules",".bin","stryker");
if (!existsSync(executable)) {
  throw Error("Install this example's pinned Stryker CLI with npm install first.");
}
const candidate = sha(readFileSync(join(root,"src","price.js")));
const config = readFileSync(join(root,"stryker.config.json"));
const packageManifest = readFileSync(join(root,"package.json"));
const runnerDigest = sha(Buffer.concat([config,packageManifest]));
const completed = spawnSync(executable, ["run"], {
  cwd:root, stdio:"inherit", shell:false, timeout:90_000
});
if (completed.error || completed.status !== 0) {
  throw Error("Stryker subprocess did not complete successfully");
}
const rawReport = readFileSync(join(root,"reports","mutation","mutation.json"),"utf8");
const originalDigest = sha(rawReport);
const report = JSON.parse(rawReport);
if (report.framework?.version !== "10.0.0") throw Error("Unexpected Stryker version");

// The plan is frozen independently of the report contents; these six IDs
// are pinned to the specific source fixture and Stryker version.
const mutationIds = Array.from({length:6},(_,i)=>"M"+i);
const domainDigest = createDomainDigest("stryker-integration-example");
const kernel = createAssuranceKernel({domainDigest,schemas:{
  invariantPlan:"demo.invariant/v1",
  variantPlan:"demo.variant/v1",
  variantCampaignResult:"demo.campaign/v1",
  coverageResult:"demo.coverage/v1"
}});
const source={object:"src/price.js",clause:"discount-boundary"};
const semantic={
  laws:[{
    id:"pricing-law",source,status:"mapped-current",
    faultModelBinding:"direct-source",mutationIds,
    verificationRows:["verification:V1"]
  }],
  mutations:mutationIds.map(id=>({
    id,source,operator:"StrykerJS",equivalence:"non-equivalent-required-kill",
    expectedKillers:["suite:all"],concreteKillers:[{
      caseId:"suite:all",fullyOwned:true,
      stages:[{owners:["example"],procedure:"npm test",procedureIndex:0}]
    }],fullyOwnedKiller:true
  })),
  ownedStages:[],deferredStages:[],
  basisRows:[{
    id:"V1",kind:"verification",suites:["0"],
    verificationClasses:["mutation"]
  }]
};
const plan = kernel.compileVariantPlan({
  contract:{digest:domainDigest("example-claims.v1",semantic),semantic},
  candidateDigest:candidate,changedFiles:["src/price.js"]
});
const mutantIds=Object.fromEntries(mutationIds.map((id,i)=>["variant:"+id,String(i)]));
const bridged=bridgeStrykerReport({
  plan,mutantIds,makeCampaign:(p,results)=>kernel.createVariantCampaignResult(p,results),
  report:{
    jsonReport:rawReport,runnerDigest,
    // Trust is limited to this host process having just executed the pinned
    // Stryker binary on the candidate, with its captured immutable bytes.
    // It is not a signature or remotely authenticated attestation.
    verifyReportOrigin: attestation =>
      completed.status===0 && attestation.frameworkVersion==="10.0.0" &&
      attestation.reportDigest===originalDigest &&
      attestation.candidateDigest===candidate &&
      attestation.runnerDigest===runnerDigest
  }
});
const gate=kernel.gateVariant(plan,bridged.campaign,bridged.verification);
console.log(JSON.stringify({
  strykerStatuses:bridged.statusCounts,
  runnerTestInventory:bridged.testInventory,
  reportDigest:bridged.reportDigest,
  gate:gate.status, blockers:gate.blockers
},null,2));
if(gate.status!=="passed")process.exitCode=1;
