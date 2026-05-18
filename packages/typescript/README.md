<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol TypeScript SDK

Official TypeScript/Node.js SDK for Micro Agent Protocol (MAP).

**Status:** Developer preview.

This is the strongest SDK surface in the repo today, but it is still a `0.x` package and the broader release story around it is still settling.

## Installation

Install from npm:

```bash
npm install @sidianlabs/map-client
```

## Quick Start

```typescript
import { MapAssistantClient } from '@sidianlabs/map-client';

const client = new MapAssistantClient({
  baseUrl: 'http://localhost:8787',
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
  baseUrl: 'http://localhost:8787',  // Required
  timeout: 30_000,                          // Default 30s
  retryAttempts: 3,                         // Default 3
  retryDelayMs: 1000,                        // Default 1s
  retryMaxDelayMs: 30000,                    // Default 30s
  retryJitter: 0.1,                         // Default 0.1 (10%)
  defaultHeaders: { 'x-custom-header': 'value' },
});
```

## Signers

### HMAC Signer

```typescript
import { HMACSigner } from '@sidianlabs/map-client';

const signer = new HMACSigner('secret-key', 'key-id');
```

### RSA Signer

```typescript
import { RSASigner } from '@sidianlabs/map-client';

const signer = new RSASigner(privateKeyPEM, 'key-id');
```

### HTTP Signer (for signed HTTP requests)

```typescript
import { HTTPSigner } from '@sidianlabs/map-client';

const signer = new HTTPSigner('key-id', 'secret');
client.configureSigning('key-id', 'secret');
```

## WebSocket Transport

For real-time dispatch and task status streaming:

```typescript
import { WebSocketTransport } from '@sidianlabs/map-client';

// Create transport
const transport = new WebSocketTransport('ws://localhost:8787', {
  timeout: 30000,
  reconnect: true,
  reconnectIntervalMs: 1000,
  maxReconnectAttempts: 5,
  pingIntervalMs: 30000,
});

// Connect
await transport.connect();

// Dispatch a task
const result = await transport.dispatch({
  capability: 'payment.process',
  envelope: {
    task_id: 'task-123',
    requester_identity: { type: 'user', id: 'user-1' },
    target_agent: 'agent-payment',
    intent: 'Process payment',
    constraints: {},
    risk_class: 'low',
    requested_output_mode: 'full',
  },
});

// Stream task status updates
for await (const update of await transport.streamTaskStatus('task-123')) {
  console.log('Task status:', update.status, update.message);
  if (update.status === 'completed' || update.status === 'failed') {
    break;
  }
}

// Close connection
transport.close();
```

## Batch Execution

Execute multiple dispatches in parallel or sequentially:

```typescript
const batchRequest = {
  requests: [
    {
      capability: 'payment.process',
      envelope: { /* ... */ },
    },
    {
      capability: 'payment.validate',
      envelope: { /* ... */ },
    },
  ],
  parallel: true, // Execute in parallel (default: false - sequential)
};

const batchResult = await client.dispatchBatch(batchRequest);

console.log(`Completed: ${batchResult.results.length}`);
console.log(`Failed: ${batchResult.errors.length}`);

for (const error of batchResult.errors) {
  console.log(`Request ${error.index} failed: ${error.error.message}`);
}
```

## Error Handling

```typescript
import {
  MapError,
  MapAPIError,
  MapRetryableError,
  ErrorCode,
  ERROR_CODE_RETRYABLE_MAP,
} from '@sidianlabs/map-client';

try {
  await client.dispatch({ ... });
} catch (error) {
  if (error instanceof MapAPIError) {
    console.log(`Error: ${error.code} - ${error.message}`);
    console.log(`Status: ${error.status}`);
    console.log(`Retryable: ${error.retryable}`);
    console.log(`Retryable flag: ${ERROR_CODE_RETRYABLE_MAP[error.code]}`);
  } else if (error instanceof MapRetryableError) {
    console.log(`Retry after ${error.retryAfterMs}ms`);
  } else if (error instanceof MapError) {
    console.log(`General error: ${error.message}`);
  }
}
```

### Error Codes

All error codes are typed and exported:

```typescript
type ErrorCode =
  | 'agent_not_found'
  | 'agent_disabled'
  | 'capability_not_found'
  | 'capability_disabled'
  | 'policy_denied'
  | 'approval_required'
  | 'approval_denied'
  | 'approval_expired'
  | 'invalid_delegation_token'
  | 'token_expired'
  | 'token_invalid_signature'
  | 'token_missing_scope'
  | 'schema_validation_failed'
  | 'schema_version_unsupported'
  | 'schema_negotiation_failed'
  | 'tenant_mismatch'
  | 'rate_limit_exceeded'
  | 'request_timeout'
  | 'internal_error'
  | 'invalid_request'
  | 'idempotency_conflict'
  | 'resource_not_found'
  | 'unauthorized'
  | 'forbidden';
```

## OpenTelemetry Tracing

Integrated tracing support for distributed request tracking:

```typescript
import {
  Tracer,
  InMemorySpanExporter,
  SpanKind,
  SpanStatus,
} from '@sidianlabs/map-client';

// Create tracer with exporter
const tracer = new Tracer({
  serviceName: 'my-agent-service',
  exporter: new InMemorySpanExporter(),
  sampleRate: 1.0, // Sample all spans
});

// Create a scoped span (automatically ended)
const result = tracer.startScopedSpan(
  'dispatchPayment',
  (span) => {
    span.tags['task.id'] = 'task-123';
    span.tags['capability'] = 'payment.process';
    return client.dispatch(request);
  },
  { kind: SpanKind.CLIENT }
);

// Async scoped span
const asyncResult = await tracer.startScopedSpanAsync(
  'fetchAgents',
  async (span) => {
    span.tags['query.domain'] = 'finance';
    return client.listAgents({ domain: 'finance' });
  },
  { kind: SpanKind.CLIENT }
);

// Manual span management
const span = tracer.startSpan('myOperation', {
  kind: SpanKind.INTERNAL,
  tags: { 'custom.tag': 'value' },
});

// ... do work ...

tracer.setSpanTag(span, 'result.status', 'success');
tracer.addSpanLog(span, 'checkpoint', 'operation completed');

tracer.endSpan(span, { status: SpanStatus.OK });
```

### Span Kinds

```typescript
type SpanKind = 'client' | 'server' | 'producer' | 'consumer' | 'internal';
```

### Span Status

```typescript
type SpanStatus = 'ok' | 'error' | 'uninstrumented';
```

## Prometheus Metrics

Collect and export metrics in Prometheus format:

```typescript
import { PrometheusMetricsCollector } from '@sidianlabs/map-client';

const metrics = new PrometheusMetricsCollector({
  prefix: 'map',
  defaultLabels: { service: 'my-agent' },
});

// Record metrics
metrics.counterIncrement('dispatch_total', 1, { capability: 'payment' });
metrics.gaugeSet('active_tasks', 5);
metrics.histogramObserve('request_duration_ms', 150);

// Export in Prometheus text format
const prometheusOutput = metrics.export();
console.log(prometheusOutput);

// Export as JSON
const jsonOutput = metrics.exportJSON();

// Reset all metrics
metrics.reset();
```

Example Prometheus output:
```
# TYPE map_dispatch_total counter
# HELP map_dispatch_total counter metric
map_dispatch_total{capability="payment"} 1
# TYPE map_active_tasks gauge
map_active_tasks{service="my-agent"} 5
```

## Health Checks

Configurable health checks for monitoring:

```typescript
import {
  HealthCheckBuilder,
  HTTPHealthCheck,
  WebSocketHealthCheck,
  FunctionalHealthCheck,
} from '@sidianlabs/map-client';

// Build health checks
const healthChecker = new HealthCheckBuilder()
  .withServiceName('payment-agent')
  .withVersion({ protocol: '1.0', schema: '1.0', transport: '1.0' })
  .addHTTP('api', 'http://localhost:8787/health')
  .addWebSocket('ws', 'ws://localhost:8787')
  .addCheck('custom', async () => {
    // Custom health check logic
    return {
      status: 'pass',
      message: 'Custom check passed',
      timestamp: new Date().toISOString(),
    };
  })
  .build();

// Run health checks
const status = await healthChecker.checkAll();
console.log(`Overall status: ${status.status}`);
console.log(`Uptime: ${status.uptime_ms}ms`);

for (const [name, check] of Object.entries(status.checks)) {
  console.log(`${name}: ${check.status} - ${check.message}`);
}
```

### Health Check Types

```typescript
// HTTP health check
new HTTPHealthCheck('api', 'https://api.example.com/health', {
  timeoutMs: 5000,
  expectedStatus: 200,
});

// WebSocket health check
new WebSocketHealthCheck('ws', 'wss://ws.example.com', {
  timeoutMs: 5000,
});

// TCP health check
new TCPHealthCheck('database', 'db.example.com', 5432, {
  timeoutMs: 5000,
});

// Custom functional check
new FunctionalHealthCheck('custom', async () => {
  return { status: 'pass', timestamp: new Date().toISOString() };
});
```

## Observability Manager

Convenience class for integrated observability:

```typescript
import { ObservabilityManager, LogLevel } from '@sidianlabs/map-client';

const obs = new ObservabilityManager({
  serviceName: 'payment-agent',
  logLevel: LogLevel.INFO,
});

// Record task lifecycle
obs.recordTaskDispatch('task-123', 'payment.process', 'medium');
obs.recordTaskComplete('task-123', 150, 'completed');
obs.recordTaskFailed('task-456', 'agent_not_found');
obs.recordPolicyCheck('task-789', 'amount_limit', 'pass');
obs.recordAgentInvocation('agent-payment', 'payment.process', 120);
```

## Storage Adapters

```typescript
import { SQLiteStorage } from '@sidianlabs/map-client';

// Use SQLite for persistence
const storage = new SQLiteStorage('./map.db');

// Or in-memory for testing
import { InMemoryStorage } from '@sidianlabs/map-client';
const storage = new InMemoryStorage();
```

## Logging

```typescript
import { MAPLogger, LogLevel } from '@sidianlabs/map-client';

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
} from '@sidianlabs/map-client';

try {
  validateTaskEnvelope(envelope);
  // Valid - proceed
} catch (error) {
  console.log('Validation failed:', error.message);
}
```

## Policy Engine

```typescript
import { PolicyEngine, PolicyContext } from '@sidianlabs/map-client';

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

## Full Example

```typescript
import {
  MapAssistantClient,
  WebSocketTransport,
  MAPLogger,
  LogLevel,
  PrometheusMetricsCollector,
  HealthCheckBuilder,
  Tracer,
  SpanKind,
} from '@sidianlabs/map-client';

async function main() {
  // Setup observability
  const logger = new MAPLogger('payment-agent', LogLevel.INFO);
  const metrics = new PrometheusMetricsCollector({ prefix: 'payment' });
  const tracer = new Tracer({ serviceName: 'payment-agent' });
  const healthChecker = new HealthCheckBuilder()
    .addHTTP('api', 'http://localhost:8787/health')
    .build();

  // Create client
  const client = new MapAssistantClient({
    baseUrl: 'http://localhost:8787',
    timeout: 30_000,
    retryAttempts: 3,
  });

  client.configureSigning('key-id', process.env.SIGNING_SECRET!);

  // Run health check
  const health = await healthChecker.checkAll();
  console.log('Health:', health.status);

  // Dispatch with tracing
  const span = tracer.startSpan('dispatchPayment', { kind: SpanKind.CLIENT });
  tracer.setSpanTag(span, 'capability', 'payment.process');

  try {
    const result = await client.dispatch({
      capability: 'payment.process',
      envelope: { /* ... */ },
    });

    metrics.counterIncrement('dispatch.success');
    tracer.setSpanTag(span, 'result.status', 'success');
    console.log('Result:', result);

    return result;
  } catch (error) {
    metrics.counterIncrement('dispatch.error');
    tracer.recordError(span, error as Error);
    throw error;
  } finally {
    tracer.endSpan(span);
  }
}

main().catch(console.error);
```

## Related

- [Main README](../../README.md)
- [Protocol specification](../../docs/protocol-spec.md)
- [Preview status guide](../../docs/preview-status.md)

## License

Apache 2.0 - see LICENSE file for details.
