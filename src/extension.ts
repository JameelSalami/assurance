import { canonicalDigest, compileExtensionManifest, type ExtensionManifest } from "@durable-systems/contract";

const sha = /^sha256:[0-9a-f]{64}$/;

export interface ExtensionCheckReceipt {
  readonly schema: "assurance.extension-check/v1";
  readonly manifestDigest: string;
  readonly checkId: string;
  readonly checkerDigest: string;
  readonly evidenceDigest: string;
  readonly disposition: "passed" | "failed" | "unknown" | "skipped";
  readonly authority: "none";
}

export interface ExtensionQualification {
  readonly schema: "assurance.extension-qualification/v1";
  readonly manifestDigest: string;
  readonly status: "passed" | "failed" | "blocked";
  readonly requiredChecks: readonly string[];
  readonly evidenceDigests: readonly string[];
  readonly blockers: readonly string[];
  readonly authority: "none";
  readonly digest: string;
}

/**
 * Trust comes from the caller-owned verifier, not the extension or the agent.
 * A declaration or a self-reported 'passed' outcome is never sufficient.
 * Only structural conformance/evidence admission is checked here; no effects
 * are performed, no tests are launched, and no authority is granted.
 */
export function qualifyExtension(
  manifest: ExtensionManifest,
  receipts: readonly ExtensionCheckReceipt[],
  trustedVerifier: (receipt: ExtensionCheckReceipt) => boolean,
): ExtensionQualification {
  const source = manifest && typeof manifest === "object" ? manifest : null;
  const manifestDigest = source?.digest;
  const recognized = source === null
    ? null
    : compileExtensionManifest((({ digest, ...data }) => data)(source));
  const validManifest = recognized !== null &&
    recognized._tag === "ExtensionManifest" &&
    recognized.manifest.digest === manifestDigest;
  const blockers: string[] = [];
  let explicitlyFailed = false;
  const evidence: string[] = [];
  const expected = validManifest ? manifest.requiredChecks : [];
  if (!validManifest) blockers.push("invalid-extension-manifest");
  if (!Array.isArray(receipts)) blockers.push("invalid-receipt-set");
  if (typeof trustedVerifier !== "function") blockers.push("no-trusted-verifier");

  const byId = new Map<string, ExtensionCheckReceipt>();
  for (const receipt of Array.isArray(receipts) ? receipts : []) {
    if (
      receipt === null || typeof receipt !== "object" ||
      Object.keys(receipt).sort().join(",") !==
        "authority,checkId,checkerDigest,disposition,evidenceDigest,manifestDigest,schema" ||
      receipt.schema !== "assurance.extension-check/v1" ||
      receipt.authority !== "none" ||
      typeof receipt.checkId !== "string" || !receipt.checkId ||
      typeof receipt.checkerDigest !== "string" || !sha.test(receipt.checkerDigest) ||
      typeof receipt.evidenceDigest !== "string" || !sha.test(receipt.evidenceDigest) ||
      !["passed", "failed", "unknown", "skipped"].includes(receipt.disposition) ||
      receipt.manifestDigest !== manifestDigest ||
      !expected.includes(receipt.checkId)
    ) {
      blockers.push("invalid-or-unexpected-check");
      continue;
    }
    if (byId.has(receipt.checkId)) blockers.push("duplicate-check:" + receipt.checkId);
    byId.set(receipt.checkId, receipt);
  }

  for (const checkId of expected) {
    const receipt = byId.get(checkId);
    if (!receipt) {
      blockers.push("missing-check:" + checkId);
      continue;
    }
    if (receipt.disposition === "failed") {
      explicitlyFailed = true;
      blockers.push("failed-check:" + checkId);
    } else if (receipt.disposition !== "passed") {
      blockers.push("unverified-check:" + checkId);
    }
    let trusted = false;
    try {
      trusted = typeof trustedVerifier === "function" &&
        trustedVerifier(receipt) === true;
    } catch {
      trusted = false;
    }
    if (!trusted) blockers.push("untrusted-evidence:" + checkId);
    if (trusted && receipt.disposition === "passed") evidence.push(receipt.evidenceDigest);
  }

  const status = blockers.length === 0 ? "passed" as const :
    explicitlyFailed ? "failed" as const : "blocked" as const;
  const body = {
    schema: "assurance.extension-qualification/v1" as const,
    manifestDigest: typeof manifestDigest === "string" ? manifestDigest : "",
    status,
    requiredChecks: Object.freeze([...expected].sort()),
    evidenceDigests: Object.freeze([...new Set(evidence)].sort()),
    blockers: Object.freeze([...new Set(blockers)].sort()),
    authority: "none" as const,
  };
  const digest = canonicalDigest(body);
  if (digest._tag !== "Digest") {
    throw new Error("extension qualification digest refused");
  }
  return Object.freeze({ ...body, digest: digest.digest });
}