# Real StrykerJS → Assurance G-VARIANT demo

Requires Node.js **22+** for this example (Assurance's core works on Node
20.19+). From the Assurance repository root:

```sh
npm run build
cd examples/stryker-gate
npm install
npm run qualify
```

This runs a pinned **StrykerJS 10.0.0** process against the 3 `node:test`
tests for a pricing threshold, consumes its actual JSON report, maps **all**
six mutants against the frozen Assurance plan, checks Stryker's test inventory,
and requires the local host to confirm it just executed the named runner on the
exact candidate source. The mutation-testing command runner identifies the
whole test suite as ID `"0"` (`All tests`); it does **not** provide the identity
of individual killing tests. The frozen Assurance suite matches this honest
granularity.

A regression demonstration: remove the test asserting that `price(100,10)`
equals 90, rerun `npm run qualify`, and watch the boundary mutant survive
and G-VARIANT refuse qualification. Restore that test and qualification passes.

**Trust boundary:** This is a *local process witnessed* integration, not a
cryptographically signed remote CI attestation. A compromised host can fake
the process or report. For production, the host callback must independently
verify runner provenance, the candidate commit, source digests, CI job identity,
test inventory and tamper-evident logs. Assurance never grants execution
permission or launches production effects.
