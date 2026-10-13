# Assurance

**Assurance** implements reusable **non-authoritative** verification gates for
consumer-owned contracts, laws, frozen fault models, variants, and evidence
coverage. It uses [Contract](https://github.com/jameelsalami/contract) for canonical
identity and extension manifest declarations, but it does not require a
Contract *source checkout*. See [ASSURANCE.md](ASSURANCE.md) for the gate
semantics.

## Installation and dependency contract

Assurance is ESM-only and requires Node.js 20.19+. Install the public
`@durable-systems/contract@0.1.0` package alongside
`@durable-systems/assurance@0.1.0`.

Install from npm:

```sh
npm install @durable-systems/contract@0.1.0 @durable-systems/assurance@0.1.0
```

Assurance declares **`@durable-systems/contract@0.1.0` as a required peer**
and pins its **development dependency to the exact registry version
`0.1.0`** in `package.json`. Neither is a sibling-path dependency.

The checked-in lockfile resolves Contract **0.1.0 directly from the npm
registry**, with the published package's SHA-512 integrity. No development
vendor bootstrap tarball or sibling checkout is required. Clean `npm ci`,
GitHub CI and `npm pack` verify against the registry package.

From this independent source repository (without a neighboring checkout):

```sh
npm ci
npm run verify             # typecheck, tests, production build
npm run verify:install     # lifecycle pack + unrelated two-tarball consumer
```

For a standalone consumer, install the published Contract package
alongside the Assurance tarball, or install both from npm.
Both expose JavaScript and TypeScript declarations without a sibling
source checkout or custom module search path.

## Minimal JavaScript example

```js
import { compileExtensionManifest } from "@durable-systems/contract";
import { createDomainDigest, qualifyExtension } from "@durable-systems/assurance";

const digest = createDomainDigest("project-a");
console.log(digest("verification", { revision: 1 })); // 64 hex digits

const compiled = compileExtensionManifest({
  schema: "contract.extension-manifest/v1",
  id: "project-a.adapter", version: "0.1.0", foundation: "assurance",
  interface: { id: "project-a.gate", version: "1" },
  capabilities: ["inspect"], requiredChecks: ["conformance"],
  configurationSchemaDigest: null, authority: "none",
});
if (compiled._tag !== "ExtensionManifest") throw Error(compiled.reason);
const manifest = compiled.manifest;

// A real trustedVerifier must verify independently produced evidence.
// This illustrative callback is NOT suitable for production.
const result = qualifyExtension(manifest, [{
  schema: "assurance.extension-check/v1",
  manifestDigest: manifest.digest,
  checkId: "conformance",
  checkerDigest: manifest.digest, evidenceDigest: manifest.digest,
  disposition: "passed", authority: "none",
}], () => true);
console.log(result.status);
```

Do not treat the test-only callback as a trusted verifier. Production callers
must verify provenance and checker/evidence identities **outside** this library.

## Public API

All functions and exported types are available from `@durable-systems/assurance`.
Only the package root is public; internal `src/` and `dist/` paths are not
supported imports.

| API | Purpose |
| --- | --- |
| `createDomainDigest(namespace)` | Canonical, namespaced digest using Contract |
| `compileAssuranceDefinition(definition, domainDigest)` | Compile explicit representations, laws, mutations, stages, blockers and semantic identity |
| `createAssuranceKernel({ domainDigest, schemas })` | Provide four gates and typed invariant, variant-campaign, coverage and receipt operations |
| `qualifyExtension(manifest, receipts, trustedVerifier)` | Validate required independent checks for an exact Contract extension manifest |

The package also exports `AssuranceDefinition`, `AssuranceContract`,
`AssuranceProblem`, `AssuranceSchemas`, `ExtensionCheckReceipt`,
`ExtensionQualification`, and the other gate, variant, source, and coverage
types listed in `src/index.ts`.

## Four fail-closed gates

- **G-REP:** mapped representations must exist, be current, and be ready.
- **G-LAW:** declared laws need owned, concrete fault-model killers and verification.
- **G-VARIANT:** every required admitted non-equivalent variant must have a
  named killer belonging to the **frozen declared test suites**, and an
  independently checked execution receipt bound to the exact variant plan,
  campaign, candidate, oracle, runner and execution. Missing receipts or a
  missing trusted verifier block acceptance. Invented killer IDs, unexpected
  evidence, survivors, duplicates or stale campaigns fail closed. Calling
  \`gateVariant(plan, campaign)\` without external verification never counts
  a reported kill as independently proven.
- **G-COVERAGE:** every owned stage needs a closed state and identified evidence.
  Campaign and coverage receipts bind the originating contract/request.

A caller must supply \`gateVariant(plan, campaign, {
  receipts, trustedVerifier
})\` for positive G-VARIANT results. The verifier must independently
cross-check the named suite/test exists and killed the variant in a real
runner output, and that the runner/output hashes, candidate, oracle and
campaign identities match. A callback returning \`true\` unconditionally
is **not** a trusted verifier. The library does not invoke Stryker,
authenticate a signature, or turn a self-reported hash into evidence.

These gates classify *supplied evidence*, not independent proof that tests
were run. They do not execute mutations, deploy code, discover trusted
verifiers, authorize effects, grant credentials, or establish source ownership.
Applications own independent verification, authorization, and lifecycle
recovery procedures.

## Extension qualification boundary

`qualifyExtension(manifest, receipts, trustedVerifier)` checks exact manifest
binding, mandatory declared checks, uniqueness, receipt structure,
dispositions, and externally verified evidence. Extra, duplicate, skipped,
missing, invalid, untrusted, or failed checks block or fail closed.

The host must enforce its *own* mandatory baseline checks in addition to the
manifest's declared `requiredChecks`. An extension cannot choose a smaller
test set to declare itself conformant. A trusted application must independently
validate package integrity, isolation, conformance evidence, credentials,
current user permission, and recovery before any installation, migration,
or effect. Contract's proposed transitions and Assurance's digests all carry
`authority: "none"`.

For further semantics and the distinct ownership of each foundation, read
[ASSURANCE.md](ASSURANCE.md).

## License and provenance

Apache License 2.0, [LICENSE](LICENSE). This does not by itself establish
source provenance, copyright ownership, npm namespace access, or completion of
third-party attribution and NOTICE review.

## Related work, prior art and third-party attribution

These references document **overlapping established ideas**, not copied
source code, existing integrations, certification or external endorsement:

- [Stryker Mutator](https://stryker-mutator.io/docs/): mutation testing that
  runs altered code against tests and reports killed/surviving mutants.
  Assurance evaluates *externally supplied* evidence about required
  fault-model/variant killers; it **does not generate mutants or run tests**.
- [Open Policy Agent](https://www.openpolicyagent.org/docs): separates
  application policy decisions from enforcement, using the Rego policy
  language. Assurance exposes its own typed four-gate evidence classifications
  and **does not implement Rego or replace host authorization**.
- [Pact](https://docs.pact.io/): consumer-driven test execution for
  HTTP/message integration contracts. Assurance does not execute Pact suites
  or claim that its receipts demonstrate independently run Pact tests.
- [in-toto Attestation Framework](https://in-toto.io/docs/specs/):
  authenticated claims about artifacts. Assurance can check supplied
  verification references, but **a digest or gate result is not an authenticated
  attestation** without an independent verifier and trusted evidence.

Assurance requires the **separately installed**
`@durable-systems/contract@0.1.0` (Apache-2.0) peer; it does not ship a
copy of Contract in its npm tarball. Its source checkout installs the
published Contract package from the registry with pinned integrity. Separate
copyright attribution and NOTICE obligations remain applicable.

## Real Stryker mutation testing integration

The optional `bridgeStrykerReport` converts a real StrykerJS **JSON
report** into a frozen Assurance variant campaign and verified-execution
receipt references. Every reported mutant must be mapped to the declared
variant plan—surviving mutants cannot be silently cherry-picked away.
All `killedBy` IDs must exist in the report's test inventory and the frozen
allowed suites. Unknown, stale, partial or unrecognized reports fail closed.

Run [the Stryker end-to-end example](examples/stryker-gate/README.md)
on Node 22 or later. Its 6 real Stryker mutants are all caught after
the example adds the previously missing threshold-edge test.

`VerifiedStrykerRun.verifyReportOrigin` is a required **host-owned
trust callback**. Report SHA-256, mutant names and Stryker's own
`status: "Killed"` are not authenticated evidence by themselves. The
demo witnesses a direct local Stryker subprocess and validates its exact
report/candidate/runner identity, which is not equivalent to signed remote
CI provenance. Production deployments must independently verify trusted
runner and candidate identities and test inventory.
