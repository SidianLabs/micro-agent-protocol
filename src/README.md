<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Reference Scaffold

This folder contains a minimal TypeScript scaffold for a MAP reference implementation.

It is intentionally small and transport-agnostic. The goal is to make the protocol concrete enough to build against without prematurely locking the project into one deployment model.

## Layout

- `src/types.ts`: core MAP types mirrored from the schema layer
- `src/control-plane/registry.ts`: in-memory descriptor registry
- `src/control-plane/policy.ts`: example policy evaluator contract
- `src/control-plane/delegation.ts`: task-scoped delegation token issuer
- `src/control-plane/orchestrator.ts`: simple delegation flow
- `src/runtime/micro-agent.ts`: micro-agent contract and base execution path
- `src/runtime/payment-agent.ts`: example payment-focused micro-agent
- `src/runtime/dbread-agent.ts`: example database-read micro-agent
- `src/validation/schema-validator.ts`: runtime JSON Schema validation using Ajv
- `src/server.ts`: importable HTTP server factory for discovery and dispatch
- `src/server-main.ts`: runnable HTTP server entrypoint
- `src/demo-server-main.ts`: runnable demo server entrypoint that opts into bundled example agents
- `src/runtime/example-agents.ts`: opt-in demo agents used by demos and conformance runs
- `src/demo-payment.ts`: sample client that sends a payment task through the server
- `src/demo-db-read.ts`: sample client that sends a database-read task through the server

## Notes

- This scaffold is not yet a production runtime.
- `createReferenceApp()` is framework-first and does not register example agents unless `includeExampleAgents: true` or explicit `agents` are provided.
- `createMapHandler()` and `createMapServer()` are now generic by default. Use the demo entrypoint or pass `includeExampleAgents: true` if you want bundled payment/db examples.
- Cryptographic signing and verification are implemented for descriptors, signed HTTP requests, delegation tokens, receipts, audit checkpoints/exports, and conformance exports.
- Persistence supports JSON file and SQLite-backed stores for task, receipt, dead-letter, metrics, and audit data.
- The HTTP layer includes readiness/health/status, discovery, idempotent dispatch/approve, runtime controls, pagination/ETag contracts, alerts/metrics, audit verification/export, and conformance export.
- Server configuration loading and reusable HTTP helpers live under `src/server/` so the top-level server composition is easier to split further.
- This remains a reference implementation and does not yet include multi-region failover, production KMS/HSM integration, or certification-grade interop evidence.
