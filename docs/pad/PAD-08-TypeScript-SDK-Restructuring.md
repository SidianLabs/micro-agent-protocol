# PAD-08: TypeScript SDK Package Restructuring

**Project:** MAP Protocol Open Source Release  
**Status:** Complete  
**Last Updated:** 2026-03-30

## 1. Overview

The TypeScript SDK was restructured to follow modern JavaScript/TypeScript best practices with ESM modules and proper type exports.

## 2. Package Structure

```
packages/typescript/
├── src/
│   ├── index.ts              # Main exports
│   ├── client.ts             # MapAssistantClient
│   ├── errors.ts             # Error classes
│   ├── signing.ts            # RSA/HMAC signers
│   ├── signing-http.ts       # HTTP request signing
│   ├── types.ts              # Type definitions
│   ├── validators.ts         # JSON Schema validators
│   ├── observability/
│   │   └── index.ts          # Logger, Metrics, Tracer
│   ├── storage/
│   │   └── index.ts          # TaskStore, ReceiptStore
│   ├── webhooks/
│   │   └── index.ts          # WebhookDispatcher
│   └── policy/
│       └── index.ts          # PolicyEngine
├── test/
│   └── validators.test.ts    # Unit tests
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

## 3. Exports

### 3.1 Main Package

```typescript
import {
  MapAssistantClient,
  MapClientOptions,
  RiskLevel,
  VisibilityMode,
  validateTaskEnvelope,
  MapError,
  MapAPIError,
} from '@mapprotocol/sdk';
```

### 3.2 Submodule Exports

```typescript
import { MAPLogger, MetricsCollector } from '@mapprotocol/sdk/observability';
import { InMemoryTaskStore } from '@mapprotocol/sdk/storage';
import { WebhookDispatcher } from '@mapprotocol/sdk/webhooks';
import { PolicyEngine } from '@mapprotocol/sdk/policy';
```

## 4. Module Format

- **Format**: ESM (ES Modules)
- **Target**: Node.js 18+
- **Module Resolution**: Bundler
- **Type System**: TypeScript with declaration files

## 5. Key Classes

### 5.1 MapAssistantClient

```typescript
const client = MapAssistantClient.forBaseUrl('https://api.mapprotocol.ai');
client.configureSigning('key-id', 'secret');

const result = await client.dispatch({
  capability: 'payment.process',
  envelope: { ... }
});
```

### 5.2 Observability

```typescript
const observer = new ObservabilityManager({
  serviceName: 'my-service',
  logLevel: LogLevel.INFO,
});

observer.recordTaskDispatch(taskId, 'payment.process', 'medium');
observer.recordTaskComplete(taskId, 150, 'completed');
```

### 5.3 Storage

```typescript
const store = new CompositeStore();
await store.tasks.save(taskRecord);
await store.receipts.save(receipt);
```

### 5.4 Webhooks

```typescript
const dispatcher = new WebhookDispatcher();
dispatcher.registerEndpoint({
  id: 'endpoint-1',
  url: 'https://my-server.com/webhooks',
  events: [WebhookEventType.TASK_COMPLETED],
  secret: 'secret',
  enabled: true,
});
```

### 5.5 Policy

```typescript
const engine = new PolicyEngine();
engine.addRule({
  id: 'high-risk-approval',
  name: 'High Risk Requires Approval',
  target: { risk_class: ['high', 'critical'] },
  effect: PolicyEffect.CHALLENGE,
  priority: 100,
});
```

## 6. Build Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## 7. Testing

```bash
npm install
npm run check    # Type check
npm run build     # Build
npm run test      # Run tests
```

Tests use Node.js built-in test runner with 9 passing tests covering validators.