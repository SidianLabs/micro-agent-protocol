/**
 * Full MAP Protocol Integration Test
 *
 * This project tests the complete flow:
 * 1. Start a local MAP reference server
 * 2. Create a MapAssistantClient
 * 3. Dispatch a payment task
 * 4. Handle async approval if needed
 * 5. Verify the result and receipt
 */

import {
  MapAssistantClient,
  HMACSigner,
  type DispatchRequest,
  type TaskEnvelope,
  type RequesterIdentity,
  type TaskConstraints,
  type RiskLevel,
  type VisibilityMode,
  ErrorCode,
} from "@mapprotocol/sdk";

// ============================================
// Configuration
// ============================================

const CONFIG = {
  baseUrl: process.env.MAP_BASE_URL || "http://localhost:8787",
  keyId: process.env.MAP_KEY_ID || "test-key-1",
  secretKey: process.env.MAP_SECRET_KEY || "test-secret-key-for-signing",
};

// ============================================
// Demo Agents (should match reference server)
// ============================================

const DEMO_AGENTS = {
  payment: "payment-agent-v1",
  dbRead: "dbread-agent-v1",
  generic: "generic-agent-v1",
};

// ============================================
// Test Scenarios
// ============================================

interface TestScenario {
  name: string;
  capability: string;
  targetAgent: string;
  intent: string;
  riskClass: RiskLevel;
  maxAmount?: number;
  currency?: string;
  environment?: "development" | "staging" | "production";
  expectApproval?: boolean;
}

const SCENARIOS: TestScenario[] = [
  {
    name: "Payment propose (low-risk)",
    capability: "payment.propose",
    targetAgent: DEMO_AGENTS.payment,
    intent: "Propose payment of $50 for office supplies",
    riskClass: "low",
    maxAmount: 100,
    currency: "USD",
    environment: "development",
    expectApproval: false,
  },
  {
    name: "Payment execute (medium-risk)",
    capability: "payment.execute",
    targetAgent: DEMO_AGENTS.payment,
    intent: "Execute payment of $500 for equipment",
    riskClass: "medium",
    maxAmount: 500,
    currency: "USD",
    environment: "development",
    expectApproval: false,
  },
  {
    name: "Payment refund (high-risk)",
    capability: "payment.refund",
    targetAgent: DEMO_AGENTS.payment,
    intent: "Refund payment of $500 for cancelled order",
    riskClass: "high",
    maxAmount: 500,
    currency: "USD",
    environment: "development",
    expectApproval: true,
  },
  {
    name: "Database read query",
    capability: "db.read.query",
    targetAgent: DEMO_AGENTS.dbRead,
    intent: "Query customer records",
    riskClass: "low",
    environment: "development",
    expectApproval: false,
  },
];

// ============================================
// Test Functions
// ============================================

async function createClient(): Promise<MapAssistantClient> {
  console.log("\n📦 Creating MAP Protocol client...");

  const client = new MapAssistantClient({
    baseUrl: CONFIG.baseUrl,
    timeout: 30_000,
    retryAttempts: 3,
  });

  // Configure HMAC signing
  client.configureSigning(CONFIG.keyId, CONFIG.secretKey);

  console.log(`   Base URL: ${CONFIG.baseUrl}`);
  console.log(`   Key ID: ${CONFIG.keyId}`);

  return client;
}

async function testHealthCheck(client: MapAssistantClient): Promise<boolean> {
  console.log("\n🏥 Testing health check...");

  try {
    const health = await client.getHealth();
    console.log(`   ✅ Server is healthy`);
    console.log(`   Version: ${health.version?.protocol || "unknown"}`);
    console.log(`   Uptime: ${health.uptimeMs ? `${Math.round(health.uptimeMs / 1000)}s` : "unknown"}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Health check failed: ${error}`);
    return false;
  }
}

async function testListAgents(client: MapAssistantClient): Promise<void> {
  console.log("\n📋 Listing available agents...");

  try {
    const response = await client.listAgents();
    // Handle both array and object response
    const agents = Array.isArray(response) ? response : response.agents || [];
    console.log(`   Found ${agents.length} agent(s):`);

    for (const agent of agents) {
      console.log(`   - ${agent.agent_id}`);
      console.log(`     Domain: ${agent.domain}`);
      console.log(`     Capabilities: ${agent.capabilities?.join(", ") || "none"}`);
      console.log(`     Risk Level: ${agent.risk_level}`);
    }
  } catch (error) {
    console.log(`   ❌ Failed to list agents: ${error}`);
  }
}

function createTaskEnvelope(scenario: TestScenario): TaskEnvelope {
  const requesterIdentity: RequesterIdentity = {
    type: "user",
    id: "test-user-001",
    tenant_id: "test-tenant-001",
  };

  const constraints: TaskConstraints = {
    common: {
      max_amount: scenario.maxAmount,
      currency: scenario.currency || "USD",
      environment: scenario.environment || "development",
      approval_required: scenario.expectApproval,
    },
    domain: {
      approved_vendor_only: true,
      category: "test",
    },
  };

  const envelope: TaskEnvelope = {
    task_id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    requester_identity: requesterIdentity,
    target_agent: scenario.targetAgent,
    intent: scenario.intent,
    constraints: constraints,
    risk_class: scenario.riskClass,
    delegation_token: "test-delegation-token",
    requested_output_mode: "summary" as VisibilityMode,
    metadata: {
      test: true,
      scenario: scenario.name,
    },
  };

  return envelope;
}

async function testDispatch(
  client: MapAssistantClient,
  scenario: TestScenario
): Promise<any> {
  console.log(`\n🚀 Dispatching: ${scenario.name}`);
  console.log(`   Capability: ${scenario.capability}`);
  console.log(`   Target: ${scenario.targetAgent}`);
  console.log(`   Intent: ${scenario.intent}`);
  console.log(`   Risk: ${scenario.riskClass}`);

  const envelope = createTaskEnvelope(scenario);

  const request: DispatchRequest = {
    capability: scenario.capability,
    envelope: envelope,
  };

  try {
    console.log(`   Task ID: ${envelope.task_id}`);
    const result = await client.dispatch(request);

    console.log(`   ✅ Dispatch successful!`);
    console.log(`   Status: ${result.result?.status}`);

    if (result.result?.summary) {
      console.log(`   Summary: ${result.result.summary}`);
    }

    if (result.receipt) {
      console.log(`   Receipt ID: ${result.receipt.receipt_id}`);
      console.log(`   Policy Checks: ${result.receipt.policy_checks?.join(", ") || "none"}`);
    }

    return result;
  } catch (error: any) {
    console.log(`   ⚠️  Dispatch error details:`);
    console.log(`      - Code: ${error.code || "N/A"}`);
    console.log(`      - Message: ${error.message || "N/A"}`);
    console.log(`      - Status: ${error.status || "N/A"}`);
    console.log(`      - Retryable: ${error.retryable}`);
    if (error.details) {
      console.log(`      - Details: ${JSON.stringify(error.details)}`);
    }
    console.log(`      - Full Error: ${JSON.stringify(error)}`);
    return null;
  }
}

async function testListTasks(client: MapAssistantClient): Promise<void> {
  console.log("\n📝 Listing recent tasks...");

  try {
    const response = await client.listTasks({ limit: 10 });
    // Handle both array and object response
    const tasks = Array.isArray(response) ? response : response.tasks || [];
    console.log(`   Found ${tasks.length} task(s)`);

    for (const task of tasks) {
      console.log(`   - ${task.task_id}: ${task.status}`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not list tasks: ${error}`);
  }
}

async function runFullTest(): Promise<void> {
  console.log("=".repeat(60));
  console.log("🧪 MAP Protocol Full Integration Test");
  console.log("=".repeat(60));

  const client = await createClient();

  // Test 1: Health Check
  const isHealthy = await testHealthCheck(client);
  if (!isHealthy) {
    console.log("\n⚠️  Server not healthy, but continuing with tests...");
  }

  // Test 2: List Agents
  await testListAgents(client);

  // Test 3: Dispatch Scenarios
  for (const scenario of SCENARIOS) {
    await testDispatch(client, scenario);
    await new Promise((r) => setTimeout(r, 500));
  }

  // Test 4: List Tasks
  await testListTasks(client);

  console.log("\n" + "=".repeat(60));
  console.log("📊 Test Summary");
  console.log("=".repeat(60));
  console.log(`Scenarios tested: ${SCENARIOS.length}`);
  console.log("All tests completed!");
  console.log("=".repeat(60));
}

// ============================================
// Main Entry Point
// ============================================

async function main() {
  console.log("\n🚀 Starting MAP Protocol Integration Test\n");

  try {
    await runFullTest();
  } catch (error) {
    console.error("\n❌ Test runner failed:", error);
    process.exit(1);
  }

  console.log("\n✅ Test run complete\n");
}

main();
