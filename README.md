# Assurance

**Assurance** implements reusable **non-authoritative** verification gates for
consumer-owned contracts, laws, frozen fault models, variants, and evidence
coverage. It uses [Contract](https://github.com/jameelsalami/contract) for canonical
identity and extension manifest declarations, but it does not require a
Contract *source checkout*. See [ASSURANCE.md](ASSURANCE.md) for the gate
semantics.

## Installation and dependency contract

Assurance is ESM-only and requires Node.js 20.19+. Install Contract
**0.1.0** alongside Assurance **0.1.0**. The published package identities are
planned as `@durable-systems/contract` and `@durable-systems/assurance`; both remain
unpublished until repository and npm namespace clearance is complete.

After publication:

```sh
npm install @durable-systems/contract@0.1.0 @durable-systems/assurance@0.1.0
```

Assurance declares **`@durable-systems/contract@0.1.0` as a required peer**
and pins its **development dependency to the exact registry version
`0.1.0`** in `package.json`. Neither is a sibling-path dependency.

**Prepublication lockfile bootstrap:** Contract is not yet present in the
public npm registry. Until its first publication, this repository keeps an
integrity-checked `vendor/durable-systems-contract-0.1.0.tgz` and the checked-in
`package-lock.json` intentionally resolves that version from the local archive.
Consequently, clean `npm ci`, GitHub CI and lifecycle `npm pack` work from
a standalone checkout **without claiming the dependency came from npm**.
The vendor tarball never enters Assurance's distributed tarball.

All four independent GitHub repositories may be pushed together. npm
publication still has an install-time order: publish Contract before
Assurance. Once Contract `0.1.0` is available, regenerate the Assurance
lockfile against **the actual published registry package**, remove the now
unneeded vendor archive, and repeat the full source, CI and tarball-consumer
verification. The final release archive SHA-256 will change when
`private: true` is removed.

From this independent source repository (without a neighboring checkout):

```sh
npm ci
npm run verify             # typecheck, 14 tests, production build
npm run verify:install     # lifecycle pack + unrelated two-tarball consumer
```

For a prerelease consumer, pack Contract separately and install its tarball
**together with** the Assurance tarball. Both tarballs expose JavaScript and
TypeScript declarations from their package-root exports. Neither a sibling checkout nor a custom module search path is needed.

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
- **G-VARIANT:** every required admitted non-equivalent variant must be recorded
  as independently killed with a named killer. Survival, skips, duplicates,
  stale or missing campaign entries never count as success.
- **G-COVERAGE:** every owned stage needs a closed state and identified evidence.
  Campaign and coverage receipts bind the originating contract/request.

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
copy of Contract in its npm tarball. The source checkout retains an
integrity-pinned development bootstrap archive until Contract is published.
The upstream source rights and any required notice retention have not been
independently cleared by these informational references.
