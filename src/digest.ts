import { canonicalDigest } from "@durable-systems/contract";
import type { DomainDigest } from "./types.js";

export function createDomainDigest(namespace: string): DomainDigest {
  if (!/^[a-z0-9][a-z0-9.-]{0,127}$/.test(namespace)) {
    throw new Error("invalid-digest-namespace");
  }

  return (domain: string, value: unknown): string => {
    if (!/^[a-z0-9][a-z0-9.-]{0,127}$/.test(domain)) {
      throw new Error("invalid-digest-domain");
    }
    const result = canonicalDigest({
      namespace,
      domain,
      value,
    });
    if (result._tag !== "Digest") {
      throw new Error("assurance-digest-refused:" + result.reason);
    }
    const raw = result.digest.replace(/^sha256:/, "");
    if (!/^[0-9a-f]{64}$/.test(raw)) throw new Error("invalid-contract-digest");
    return raw;
  };
}
