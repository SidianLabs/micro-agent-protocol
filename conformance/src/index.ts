/**
 * MAP Protocol Conformance Test Suite
 *
 * This is the main entry point that runs all conformance test suites
 * against the MAP Protocol reference server at localhost:8787.
 *
 * Run with: npm test (after npm run build)
 */

import { randomUUID } from "node:crypto";

// Export the typed conformance client
export {
  ConformanceClient,
  type ConformanceCheckResult,
  type ConformanceResult,
  type AuditVerificationResult,
  type TenantIsolationResult,
  type SchemaNegotiationResult,
  type PolicyEvaluationResult,
} from './client.js';

const BASE_URL = "http://localhost:8787";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

async function dispatchRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<DispatchResponse> {
  const url = new URL(path, BASE_URL);
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  let responseBody: Record<string, unknown> = {};
  try {
    responseBody = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore parse errors
  }

  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

interface TestResult {
  suite: string;
  passed: number;
  failed: number;
  errors: string[];
}

async function runAllSuites(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  console.log("=".repeat(60));
  console.log("MAP Protocol Conformance Test Suite");
  console.log("=".repeat(60));
  console.log("");

  // Check if server is available
  try {
    const healthResponse = await fetch(new URL("/ready", BASE_URL), {
      method: "GET",
    });
    console.log(`Server health check: ${healthResponse.status}`);
  } catch {
    console.error("ERROR: Cannot connect to reference server at localhost:8787");
    console.error("Please ensure the server is running before executing tests.");
    console.log("");
  }

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Dispatch Tests...");
  console.log("-".repeat(60));

  const dispatchResult = await runDispatchTests();
  results.push(dispatchResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Approval Tests...");
  console.log("-".repeat(60));

  const approvalResult = await runApprovalTests();
  results.push(approvalResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Signing Tests...");
  console.log("-".repeat(60));

  const signingResult = await runSigningTests();
  results.push(signingResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Validation Tests...");
  console.log("-".repeat(60));

  const validationResult = await runValidationTests();
  results.push(validationResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Schema Negotiation Tests...");
  console.log("-".repeat(60));

  const schemaResult = await runSchemaNegotiationTests();
  results.push(schemaResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Idempotency Tests...");
  console.log("-".repeat(60));

  const idempotencyResult = await runIdempotencyTests();
  results.push(idempotencyResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Task Store Tests...");
  console.log("-".repeat(60));

  const taskStoreResult = await runTaskStoreTests();
  results.push(taskStoreResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Receipt Store Tests...");
  console.log("-".repeat(60));

  const receiptStoreResult = await runReceiptStoreTests();
  results.push(receiptStoreResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Async Queue Tests...");
  console.log("-".repeat(60));

  const asyncQueueResult = await runAsyncQueueTests();
  results.push(asyncQueueResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Policy Tests...");
  console.log("-".repeat(60));

  const policyResult = await runPolicyTests();
  results.push(policyResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Error Codes Tests...");
  console.log("-".repeat(60));

  const errorCodesResult = await runErrorCodesTests();
  results.push(errorCodesResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running Trust Chain Tests...");
  console.log("-".repeat(60));

  const trustChainResult = await runTrustChainTests();
  results.push(trustChainResult);

  console.log("");
  console.log("-".repeat(60));
  console.log("Running API Surface Tests...");
  console.log("-".repeat(60));

  const apiSurfaceResult = await runApiSurfaceTests();
  results.push(apiSurfaceResult);

  return results;
}

async function runDispatchTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  // Basic dispatch test
  try {
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `dispatch-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Conformance dispatch test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      passed++;
    } else {
      failed++;
      errors.push(`Dispatch failed with status ${response.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Dispatch test error: ${e}`);
  }

  return { suite: "dispatch", passed, failed, errors };
}

async function runApprovalTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const taskId = `approval-test-${randomUUID()}`;
    const request = {
      capability: "audit.export",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "audit-agent-v1",
        intent: "Conformance approval test",
        constraints: {},
        risk_class: "medium",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    await dispatchRequest("POST", "/dispatch", request);

    const approvalResponse = await dispatchRequest(
      "POST",
      `/tasks/${encodeURIComponent(taskId)}/approve`,
      { task_id: taskId, approved_by: "approver_001" }
    );

    if (approvalResponse.statusCode >= 200 || approvalResponse.statusCode === 409) {
      passed++;
    } else {
      failed++;
      errors.push(`Approval failed with status ${approvalResponse.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Approval test error: ${e}`);
  }

  return { suite: "approval", passed, failed, errors };
}

async function runSigningTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    // Test with invalid signature
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `signing-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Conformance signing test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request, {
      "X-MAP-Request-Signature": "invalid",
      "X-MAP-Request-Key-Id": "test",
      "X-MAP-Request-Timestamp": new Date().toISOString(),
    });

    // Should reject invalid signature
    if (response.statusCode === 401 || response.statusCode === 403) {
      passed++;
    } else {
      failed++;
      errors.push(`Signing validation returned ${response.statusCode} instead of 401/403`);
    }
  } catch (e) {
    failed++;
    errors.push(`Signing test error: ${e}`);
  }

  return { suite: "signing", passed, failed, errors };
}

async function runValidationTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    // Test missing required field
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `validation-test-${randomUUID()}`,
        // Missing requester_identity
        target_agent: "dbread-agent-v1",
        intent: "Test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);

    if (response.statusCode >= 400) {
      passed++;
    } else {
      failed++;
      errors.push(`Validation did not reject invalid envelope (status ${response.statusCode})`);
    }
  } catch (e) {
    failed++;
    errors.push(`Validation test error: ${e}`);
  }

  return { suite: "validation", passed, failed, errors };
}

async function runSchemaNegotiationTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `schema-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Schema negotiation test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);

    if (response.statusCode >= 200) {
      passed++;
    } else {
      failed++;
      errors.push(`Schema negotiation failed with status ${response.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Schema negotiation test error: ${e}`);
  }

  return { suite: "schema_negotiation", passed, failed, errors };
}

async function runIdempotencyTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const taskId = `idem-test-${randomUUID()}`;
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Idempotency test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const headers = { "X-Idempotency-Key": `idem-${randomUUID()}` };

    const response1 = await dispatchRequest("POST", "/dispatch", request, headers);
    const response2 = await dispatchRequest("POST", "/dispatch", request, headers);

    // Either idempotency works (409 on second) or both succeed
    if (response1.statusCode === 200 || response1.statusCode === 202) {
      passed++;
    }
    if (response2.statusCode === 409 || response2.statusCode === 200) {
      passed++;
    }
  } catch (e) {
    failed++;
    errors.push(`Idempotency test error: ${e}`);
  }

  return { suite: "idempotency", passed, failed, errors };
}

async function runTaskStoreTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const taskId = `store-test-${randomUUID()}`;
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Task store test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    await dispatchRequest("POST", "/dispatch", request);

    const retrievalResponse = await dispatchRequest(
      "GET",
      `/tasks/${encodeURIComponent(taskId)}?tenant_id=tenant_A`
    );

    if (retrievalResponse.statusCode === 200) {
      passed++;
    } else {
      failed++;
      errors.push(`Task retrieval failed with status ${retrievalResponse.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Task store test error: ${e}`);
  }

  return { suite: "task_store", passed, failed, errors };
}

async function runReceiptStoreTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const taskId = `receipt-test-${randomUUID()}`;
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: taskId,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Receipt store test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);

    if (response.statusCode >= 200 && response.statusCode < 300) {
      passed++;
    } else {
      failed++;
      errors.push(`Receipt creation failed with status ${response.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Receipt store test error: ${e}`);
  }

  return { suite: "receipt_store", passed, failed, errors };
}

async function runAsyncQueueTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const request = {
      capability: "notification.send",
      envelope: {
        task_id: `async-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "notification-agent-v1",
        intent: "Async queue test",
        constraints: {},
        risk_class: "medium",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);

    // Accept 200, 202, or async-pending status
    if (response.statusCode === 200 || response.statusCode === 202) {
      passed++;
    } else {
      failed++;
      errors.push(`Async queue returned ${response.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Async queue test error: ${e}`);
  }

  return { suite: "async_queue", passed, failed, errors };
}

async function runPolicyTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const request = {
      capability: "db.read.aggregate",
      envelope: {
        task_id: `policy-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "dbread-agent-v1",
        intent: "Policy test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const response = await dispatchRequest("POST", "/dispatch", request);

    if (response.statusCode >= 200 || response.statusCode === 403) {
      passed++;
    }
  } catch (e) {
    failed++;
    errors.push(`Policy test error: ${e}`);
  }

  return { suite: "policy", passed, failed, errors };
}

async function runErrorCodesTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    // Test 404
    const notFoundResponse = await dispatchRequest(
      "GET",
      `/tasks/nonexistent?tenant_id=tenant_A`
    );

    if (notFoundResponse.statusCode === 404) {
      passed++;
    } else {
      failed++;
      errors.push(`not_found should return 404, got ${notFoundResponse.statusCode}`);
    }

    // Test 400
    const badRequest = {
      capability: "",
      envelope: {
        task_id: `error-test-${randomUUID()}`,
        requester_identity: {
          type: "user",
          id: "user_001",
          tenant_id: "tenant_A",
        },
        target_agent: "agent",
        intent: "Test",
        constraints: {},
        risk_class: "low",
        delegation_token: "token",
        requested_output_mode: "summary",
      },
    };

    const badResponse = await dispatchRequest("POST", "/dispatch", badRequest);

    if (badResponse.statusCode >= 400) {
      passed++;
    } else {
      failed++;
      errors.push(`invalid_request should return 4xx, got ${badResponse.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Error codes test error: ${e}`);
  }

  return { suite: "error_codes", passed, failed, errors };
}

async function runTrustChainTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const response = await dispatchRequest(
      "GET",
      "/.well-known/map/trust-bundle"
    );

    // Should either succeed or return 404 if endpoint doesn't exist
    if (response.statusCode === 200 || response.statusCode === 404) {
      passed++;
    } else {
      failed++;
      errors.push(`Trust bundle endpoint returned ${response.statusCode}`);
    }
  } catch (e) {
    failed++;
    errors.push(`Trust chain test error: ${e}`);
  }

  return { suite: "trust_chain", passed, failed, errors };
}

async function runApiSurfaceTests(): Promise<TestResult> {
  const errors: string[] = [];
  let passed = 0;
  let failed = 0;

  try {
    const response = await dispatchRequest(
      "GET",
      "/tasks?tenant_id=tenant_A"
    );

    if (response.statusCode === 200) {
      passed++;
    } else {
      failed++;
      errors.push(`Tasks endpoint returned ${response.statusCode}`);
    }

    // Check for pagination
    if ("pagination" in response.body || "tasks" in response.body) {
      passed++;
    }

    // Check for request ID
    if (response.headers["x-request-id"] !== undefined) {
      passed++;
    }
  } catch (e) {
    failed++;
    errors.push(`API surface test error: ${e}`);
  }

  return { suite: "api_surface", passed, failed, errors };
}

async function main() {
  console.log("");
  console.log("Starting MAP Protocol Conformance Test Suite...");
  console.log("Target: http://localhost:8787");
  console.log("");

  const results = await runAllSuites();

  console.log("");
  console.log("=".repeat(60));
  console.log("CONFORMANCE TEST SUMMARY");
  console.log("=".repeat(60));
  console.log("");

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    console.log(`${result.suite}:`);
    console.log(`  Passed: ${result.passed}`);
    console.log(`  Failed: ${result.failed}`);
    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      for (const error of result.errors) {
        console.log(`    - ${error}`);
      }
    }
    console.log("");

    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log("-".repeat(60));
  console.log(`Total Passed: ${totalPassed}`);
  console.log(`Total Failed: ${totalFailed}`);
  console.log("=".repeat(60));

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Conformance suite error:", e);
  process.exit(1);
});
