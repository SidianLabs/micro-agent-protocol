<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Assistant SDK (Reference)

## Purpose

The reference SDK provides a small assistant-facing client for MAP HTTP flows:

1. discover agents and runtime status
2. dispatch tasks
3. continue approval-gated tasks
4. retrieve tasks, receipts, alerts, and dead letters

## Location

- [`src/sdk/client.ts`](https://github.com/SidianLabs/micro-agent-protocol/blob/main/src/sdk/client.ts)

## Main APIs

- `MapAssistantClient.forBaseUrl(baseUrl, options?)`
- `listAgents({ domain?, capability? })`
- `dispatch(request, { idempotencyKey? })`
- `approve(request)`
- `getTask(taskId, { tenant_id? })`
- `listTasks({ tenant_id? })`
- `listTasksPage({ tenant_id?, limit?, cursor? })`
- `getReceipt(receiptId, { tenant_id? })`
- `listReceipts({ tenant_id? })`
- `listReceiptsPage({ tenant_id?, limit?, cursor? })`
- `listAuditEventsPage({ tenant_id?, limit?, cursor? })`
- `listAlerts({ tenant_id? })`
- `listAlertsPage({ tenant_id?, limit?, cursor? })`
- `listDeadLetters({ tenant_id? })`
- `listDeadLettersPage({ tenant_id?, limit?, cursor? })`
- `getConformanceExport()`
- `getTrustBundleExport()`
- `listAdminKeys({ includeRuntime?, includeRevoked? })`
- `getHealth()`
- `getStatus()`

## Transport Model

The SDK supports:

1. built-in fetch transport (`FetchMapTransport`)
2. custom transports implementing `MapClientTransport`

This allows assistant platforms to swap transport/auth logic without changing client call sites.

## Verification

SDK behavior is covered by:

- [`src/test/sdk-client.test.ts`](https://github.com/SidianLabs/micro-agent-protocol/blob/main/src/test/sdk-client.test.ts)
