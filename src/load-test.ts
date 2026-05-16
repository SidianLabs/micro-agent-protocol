/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from "node:perf_hooks";
import { createMapServer } from "./server/index.js";
import { createExampleAgents } from "./fixtures/agents.js";

interface LoadResult {
  total: number;
  succeeded: number;
  failed: number;
  duration_ms: number;
  throughput_rps: number;
  p95_ms: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

async function run(): Promise<void> {
  const totalRequests = Math.max(
    1,
    Number(process.env.MAP_LOAD_TOTAL_REQUESTS ?? 200),
  );
  const concurrency = Math.max(
    1,
    Number(process.env.MAP_LOAD_CONCURRENCY ?? 20),
  );
  const baseUrl = `http://127.0.0.1:${Number(process.env.MAP_LOAD_PORT ?? 8877)}`;
  const server = createMapServer({
    deploymentProfile: "open",
    enforceSignedRequests: false,
    requireTenant: true,
    agents: createExampleAgents(),
  });

  await new Promise<void>((resolve) =>
    server.listen(Number(process.env.MAP_LOAD_PORT ?? 8877), resolve),
  );
  const latencies: number[] = [];
  let succeeded = 0;
  let failed = 0;
  let launched = 0;

  const startedAt = performance.now();
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (true) {
      const current = launched;
      if (current >= totalRequests) {
        return;
      }
      launched += 1;
      const taskId = `task_load_${current}`;
      const requestBody = {
        capability: "db.read.aggregate",
        envelope: {
          task_id: taskId,
          requester_identity: {
            type: "user",
            id: "load_user",
            tenant_id: "tenant_load",
          },
          target_agent: "dbread-agent-v1",
          intent: "Load-test request",
          constraints: {
            common: { environment: "staging", redaction_level: "basic" },
            domain: { dataset: "incident_metrics", service: "payments" },
          },
          risk_class: "medium",
          delegation_token: "placeholder",
          requested_output_mode: "summary",
        },
      };

      const reqStarted = performance.now();
      try {
        const res = await fetch(`${baseUrl}/dispatch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        if (res.ok || res.status === 202) {
          succeeded += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      } finally {
        latencies.push(performance.now() - reqStarted);
      }
    }
  });

  await Promise.all(workers);
  const durationMs = performance.now() - startedAt;
  const result: LoadResult = {
    total: totalRequests,
    succeeded,
    failed,
    duration_ms: Number(durationMs.toFixed(2)),
    throughput_rps: Number(((totalRequests / durationMs) * 1000).toFixed(2)),
    p95_ms: Number(percentile(latencies, 95).toFixed(2)),
  };

  const metrics = await fetch(`${baseUrl}/metrics?tenant_id=tenant_load`).then(
    (res) => res.json(),
  );
  console.log(
    JSON.stringify(
      {
        load_result: result,
        tenant_metrics_snapshot: metrics.metrics?.tasks ?? {},
      },
      null,
      2,
    ),
  );

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void run();
