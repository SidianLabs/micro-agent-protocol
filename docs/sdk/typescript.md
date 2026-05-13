---
sidebar_position: 1
title: TypeScript SDK
---

# TypeScript SDK

The official TypeScript/JavaScript SDK for MAP Protocol.

## Installation

```bash
npm install @mapprotocol/sdk
```

## Requirements

- Node.js 18.0 or higher
- TypeScript 5.6 or higher (optional, but recommended)

## Usage

```typescript
import { 
  MapAssistantClient,
  createSigner,
  HMACSigner,
  RSASigner,
  RiskLevel,
  VisibilityMode,
} from '@mapprotocol/sdk';

// Create a client
const client = MapAssistantClient.forBaseUrl('https://api.mapprotocol.ai');

// Configure signing (HMAC)
client.configureSigning('key-id', 'secret-key');

// Or use RSA signer
const signer = createSigner({ type: 'rsa', privateKey: process.env.PRIVATE_KEY });
client.configureSigner(signer);

// Dispatch a task
const response = await client.dispatch({
  capability: 'payment.process',
  envelope: {
    task_id: crypto.randomUUID(),
    requester_identity: { type: 'user', id: 'user-123' },
    target_agent: 'agent-payment',
    intent: 'Process payment',
    constraints: { common: { max_amount: 1000 } },
    risk_class: RiskLevel.MEDIUM,
    delegation_token: 'tok_xxx',
    requested_output_mode: VisibilityMode.FULL,
  },
});

// Get task status
const task = await client.getTask('task-123');

// List tasks
const { tasks } = await client.listTasks({ tenant_id: 'tenant-acme' });

// List agents
const { agents } = await client.listAgents({ domain: 'payment' });
```

## API Reference

### MapAssistantClient

The main client class for interacting with MAP Protocol.

#### `forBaseUrl(baseUrl: string, options?: Partial<MapClientOptions>): MapAssistantClient`

Factory method to create a client for a given base URL.

#### `configureSigning(keyId: string, secret: string): void`

Configure HMAC signing for requests.

#### `dispatch(request: DispatchRequest, options?: DispatchOptions): Promise<{ result: ResultPackage; receipt?: ExecutionReceipt }>`

Dispatch a task to a micro-agent. `DispatchRequest` may include `negotiation` for invocation-time preferences such as `schema_version` and `delivery_mode`.

#### `approve(request: ApprovalRequest): Promise<{ result: ResultPackage; receipt?: ExecutionReceipt }>`

Approve a pending task. `ApprovalRequest` supports the same `negotiation` shape as dispatch.

#### `getTask(taskId: string, options?: GetTaskOptions): Promise<TaskRecord>`

Get a task by ID.

#### `listTasks(options?: ListTasksOptions): Promise<{ tasks: TaskRecord[]; pagination?: {...} }>`

List tasks with optional filters.

#### `listAgents(filters?: ListAgentsOptions): Promise<{ agents: AgentDescriptor[] }>`

List agents with optional filters.

#### `getHealth(): Promise<{ status: string }>`

Get the health status of the service.

#### `getStatus(): Promise<Record<string, unknown>>`

Get the current runtime status and effective non-secret config from the reference MAP server.

## Validators

The SDK includes validators for all MAP protocol objects. These validators now compile against generated schema artifacts synced from the repository-level canonical `schemas/` directory, so the package no longer maintains a second handwritten schema copy for the core MAP wire objects.

```typescript
import { 
  validateTaskEnvelope,
  validateDispatchRequest,
  validateApprovalRequest,
  validateResultPackage,
  validateExecutionReceipt,
  validateDelegationToken,
} from '@mapprotocol/sdk';

try {
  validateTaskEnvelope(someObject);
} catch (error) {
  console.error('Invalid task envelope:', error.message);
}
```

## Error Handling

```typescript
import { MapError, MapAPIError, MapValidationError } from '@mapprotocol/sdk';

try {
  await client.dispatch(request);
} catch (error) {
  if (error instanceof MapAPIError) {
    console.error(`API Error: ${error.code} - ${error.message}`);
    console.error(`Retryable: ${error.retryable}`);
    console.error(`Status: ${error.status}`);
  } else if (error instanceof MapValidationError) {
    console.error(`Validation Error: ${error.message}`);
  } else if (error instanceof MapError) {
    console.error(`MAP Error: ${error.message}`);
  }
}
```
