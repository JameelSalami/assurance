import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDigest, compileExtensionManifest } from "@durable-systems/contract";
import { qualifyExtension, type ExtensionCheckReceipt } from "../src/index.js";

function digest(value: unknown): string {
  const x = canonicalDigest(value);
  if (x._tag !== "Digest") throw Error(x.reason);
  return x.digest;
}
const declared = compileExtensionManifest({
  schema: "contract.extension-manifest/v1",
  id: "user.storage",
  version: "1.0.0",
  foundation: "state",
  interface: { id: "state/StateRuntimeStore", version: "v1" },
  capabilities: ["atomic-commit", "verified-history"],
  requiredChecks: ["recovery", "concurrency", "tamper-refusal"],
  configurationSchemaDigest: null,
  authority: "none",
});
if (declared._tag !== "ExtensionManifest") throw Error("manifest fixture invalid");
const manifest = declared.manifest;

const receipts: ExtensionCheckReceipt[] = manifest.requiredChecks.map((checkId) => ({
  schema: "assurance.extension-check/v1",
  manifestDigest: manifest.digest,
  checkId,
  checkerDigest: digest({ checker: checkId }),
  evidenceDigest: digest({ evidence: checkId }),
  disposition: "passed",
  authority: "none",
}));

test("an application-owned verifier can qualify complete independent extension evidence", () => {
  const observed: string[] = [];
  const result = qualifyExtension(manifest, receipts, (receipt) => {
    observed.push(receipt.checkId);
    return receipts.some((known) => known.evidenceDigest === receipt.evidenceDigest &&
      known.checkerDigest === receipt.checkerDigest &&
      known.checkId === receipt.checkId);
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(observed.sort(), [...manifest.requiredChecks].sort());
  assert.equal(result.authority, "none");
  assert.deepEqual(result.requiredChecks, [...manifest.requiredChecks]);
  assert.equal(result.evidenceDigests.length, receipts.length);
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(
    qualifyExtension(manifest, [...receipts].reverse(), () => true),
    qualifyExtension(manifest, receipts, () => true)
  );
});

test("a self-reported pass without trusted verification is blocked", () => {
  const failed = qualifyExtension(manifest, receipts, () => false);
  assert.equal(failed.status, "blocked");
  assert.ok(failed.blockers.some((blocker) => blocker.startsWith("untrusted-evidence:")));
  assert.equal(qualifyExtension(manifest, receipts, () => { throw Error("verifier offline"); }).status, "blocked");
  assert.equal(qualifyExtension(manifest, receipts.slice(1), () => true).status, "blocked");
});

test("surviving cases, unknown, skipped, forged and duplicate receipts never qualify", () => {
  const first = receipts[0]!;
  const cases: readonly [readonly ExtensionCheckReceipt[], "failed" | "blocked"][] = [
    [[{ ...first, disposition: "failed" }, ...receipts.slice(1)], "failed"],
    [[{ ...first, disposition: "skipped" }, ...receipts.slice(1)], "blocked"],
    [[{ ...first, disposition: "unknown" }, ...receipts.slice(1)], "blocked"],
    [[{ ...first, manifestDigest: digest("counterfeit") }, ...receipts.slice(1)], "blocked"],
    [[{ ...first, checkerDigest: "bad" }, ...receipts.slice(1)], "blocked"],
    [[{ ...first, authority: "execute" } as unknown as ExtensionCheckReceipt, ...receipts.slice(1)], "blocked"],
    [[...receipts, first], "blocked"],
    [[...receipts, { ...first, checkId: "unauthorized-check" }], "blocked"],
  ];
  for (const [rows, expected] of cases) {
    const result = qualifyExtension(manifest, rows, () => true);
    assert.equal(result.status, expected, expected);
    assert.notEqual(result.blockers.length, 0);
  }
});

test("tampered extension manifests cannot use otherwise valid receipts", () => {
  const altered = { ...manifest, requiredChecks: ["weakened"] };
  assert.equal(qualifyExtension(altered, receipts, () => true).status, "blocked");
  assert.equal(qualifyExtension({ ...manifest, digest: digest("forged") }, receipts, () => true).status, "blocked");
});
