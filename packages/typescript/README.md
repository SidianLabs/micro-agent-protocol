# MAP Protocol TypeScript SDK

Official TypeScript/Node.js SDK for Micro Agent Protocol (MAP).

**Status:** Preview source package. API may change in 0.x releases.

## Installation

This package is not published to npm yet. Use it from the repository source:

```bash
npm install
npm run build
```

## Quick Start

```typescript
import { MapAssistantClient, HMACSigner } from './src';

const signer = new HMACSigner('your-secret-key', 'key-id');

const client = new MapAssistantClient({
  baseURL: 'https://api.mapprotocol.ai',
  signer,
  timeout: 30_000,
});

// Check health
const health = await client.getHealth();
console.log(`Connected to MAP Protocol API ${health.version}`);

// Dispatch a task
const result = await client.dispatch({
  capability: 'payment.process',
  envelope: {
    task_id: 'task-123',
    requester_identity: { type: 'user', id: 'user-1' },
    target_agent: 'agent-payment',
    intent: 'Process payment of $100',
    constraints: {
      common: { max_amount: 1000, currency: 'USD' },
      domain: { payment_type: 'direct' },
    },
    risk_class: 'medium',
    requested_output_mode: 'full',
  },
});

console.log('Result:', result);
```

## Client Options

```typescript
const client = new MapAssistantClient({
  baseURL: 'https://api.mapprotocol.ai',  // Default
  signer,                                   // Required for signed requests
  timeout: 30_000,                          // Default 30s
  retryConfig: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
  },
});
```

## Signers

### HMAC Signer

```typescript
import { HMACSigner } from '@mapprotocol/sdk/signing';

const signer = new HMACSigner('secret-key', 'key-id');
```

### RSA Signer

```typescript
import { RSASigner } from '@mapprotocol/sdk/signing';

const signer = new RSASigner(privateKeyPEM, 'key-id');
```

## Error Handling

```typescript
import {
  MapError,
  MapAPIError,
  MapRetryableError,
  ErrorCode,
  ERROR_CODE_RETRYABLE_MAP,
} from '@mapprotocol/sdk';

try {
  await client.dispatch({ ... });
} catch (error) {
  if (error instanceof MapAPIError) {
    console.log(`Error: ${error.code} - ${error.message}`);
    console.log(`Retryable: ${ERROR_CODE_RETRYABLE_MAP[error.code]}`);
  } else if (error instanceof MapRetryableError) {
    // Handle retryable error
    console.log(`Retry after ${error.retryAfterMs}ms`);
  }
}
```

## Storage Adapters

```typescript
import { SQLiteStorage } from '@mapprotocol/sdk';

// Use SQLite for persistence
const storage = new SQLiteStorage('./map.db');

// Or in-memory for testing
import { InMemoryStorage } from '@mapprotocol/sdk';
const storage = new InMemoryStorage();
```

## Logging

```typescript
import { MAPLogger, LogLevel } from '@mapprotocol/sdk';

const logger = new MAPLogger({
  level: LogLevel.INFO,
  prefix: '[MAP]',
});

client.setLogger(logger);
```

## Validation

```typescript
import {
  validateTaskEnvelope,
  validateDispatchRequest,
  validateExecutionReceipt,
} from '@mapprotocol/sdk';

try {
  validateTaskEnvelope(envelope);
  // Valid - proceed
} catch (error) {
  console.log('Validation failed:', error.message);
}
```

## Policy Engine

```typescript
import { PolicyEngine, PolicyContext } from '@mapprotocol/sdk';

const engine = new PolicyEngine(policyRules);

const result = engine.evaluate({
  task: envelope,
  requester: { type: 'user', id: 'user-1' },
  agent: agentDescriptor,
});

if (!result.allowed) {
  console.log('Policy denied:', result.reason);
}
```

## TypeScript Support

This SDK requires TypeScript 5.6+ and targets Node.js 18+.

## Known Issues

- WebSocket transport not yet implemented
- Full protocol spec alignment in progress (~80%)

## Related

- [Main README](../../README.md)
- [Protocol specification](../../docs/protocol-spec.md)
- [Preview status guide](../../docs/preview-status.md)

## License

Apache 2.0 - see LICENSE file for details.
