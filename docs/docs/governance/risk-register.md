<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Risk Register

## Severity Model

- `Critical`: protocol trust or isolation failure risk
- `High`: production correctness/availability risk
- `Medium`: ecosystem or operability friction
- `Low`: documentation/process inconsistency

## Active Risks

1. `Critical` - asymmetric trust not default-enforced for all production deployments.
2. `Critical` - no independently implemented provider/consumer pair validated against frozen conformance contract.
3. `High` - multi-region failover strategy and drills are not implemented.
4. `High` - SLO/error-budget automation is not implemented.
5. `High` - immutable audit retention posture for `regulated` profile is incomplete.
6. `Medium` - governance docs have recently been reconciled but ongoing drift control is not yet automated.
7. `Medium` - non-TypeScript SDKs exist, but canonical HTTP contract alignment remains open for Python/Go.
8. `Medium` - certification model and evidence workflow are not yet published.

## Mitigations

- Steps 19-30: trust hardening (profile enforcement, key lifecycle, replay resilience).
- Steps 45-48: scale and operations hardening (regional failover + SLO operations).
- Steps 55-59: SDK compatibility + interop/certification evidence.
- Step 4 and governance cadence: documentation drift cleanup and recurring coherence checks.
