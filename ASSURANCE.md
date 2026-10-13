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
