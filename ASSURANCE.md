# Assurance

Assurance is the domain-neutral executable counterpart to Contract.

Contract answers:

> What is being claimed, bound, projected, or verified?

Assurance answers:

> What must be true before those claims may be treated as adequately represented and independently verified?

Projects own their semantics, source references, laws, frozen fault models, verification procedures, implementation adapters, and execution mechanisms.

Assurance owns only reusable gate mechanics:

- **GR / G-REP** — representation readiness;
- **GL / G-LAW** — law and independent fault-model adequacy;
- **GV / G-VARIANT** — implementation-variant survival;
- **GC / G-COVERAGE** — staged evidence closure.

Required admitted non-equivalent mutation survivors are zero.

Assurance does not execute project effects, mutate incumbent systems, infer missing semantics, or authorize deployment.

## Relationship

```text
project-owned meaning
       |
       v
    Contract
       |
       v
project-owned IR / implementation
       |
       v
   Assurance
  GR GL GV GC
```

Assurance depends on Contract for canonical identity. Contract does not depend on Assurance.


## G-VARIANT external-trust boundary

A variant campaign describes claimed outcomes; it cannot independently prove
that tests executed. A passing G-VARIANT disposition now requires both (1) a
killer ID frozen from the law's declared verification suites in the
VariantPlan and (2) an exact \`assurance.variant-kill-evidence/v1\` receipt for
each claimed killer, accepted by the caller's independently implemented
\`trustedVerifier\`. Missing receipts or no verifier block acceptance.
The callback must check externally retained test inventory, runner output and
provenance, not merely match user-supplied hashes. These receipts do not carry
signatures, and caller callbacks are not treated as trustworthy by default.

This remains a **gate**, not a mutation runner or identity authority.
