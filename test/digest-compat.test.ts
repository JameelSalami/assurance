import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalDigest } from "@durable-systems/contract";
import { createDomainDigest } from "../src/index.js";

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");

test("Assurance domain digest uses Contract's locale-independent nested canonical identity", () => {
  const body = JSON.parse('{"10":"ten","2":"two","01":"leading","ä":2}');
  const base = '{"domain":"roundtrip","namespace":"compat","value":{"01":"leading","10":"ten","2":"two","ä":2}}';
  const expected = sha256(base);
  const actual = createDomainDigest("compat")("roundtrip", body);
  assert.equal(actual, expected);
  assert.deepEqual(canonicalDigest({ namespace: "compat", domain: "roundtrip", value: body }), {
    _tag: "Digest",
    digest: "sha256:" + expected,
  });
});
