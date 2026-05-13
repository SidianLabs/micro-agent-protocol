import { Readable } from "node:stream";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createMapHandler } from "./server.js";
import { signHttpRequest } from "./security/signing.js";
import { createExampleAgents } from "../../demo/agents/index.js";

interface DispatchResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

class MockResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = "";

  writeHead(statusCode: number, headers: Record<string, string>): this {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  end(chunk?: string): this {
    this.body = chunk ?? "";
    return this;
  }
}

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Readable & { method: string; url: string; headers: Record<string, string> } {
  const payload = body === undefined ? [] : [JSON.stringify(body)];
  const req = Readable.from(payload) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function createDispatcher(options?: Parameters<typeof createMapHandler>[0]) {
  const handler = createMapHandler({
    ...options,
    agents: createExampleAgents(),
  });
  return async (
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<DispatchResponse> => {
    const req = makeRequest(method, url, body, headers);
    const res = new MockResponse();
    await handler(req as never, res as never);
    return {
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body ? (JSON.parse(res.body) as Record<string, unknown>) : {},
    };
  };
}

function withEnv<T>(
  values: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

interface ConformanceCheck {
  name: string;
  ok: boolean;
  details?: string;
}

function makeDispatchBody(input: { taskId: string; tenantId?: string }) {
  return {
    capability: "db.read.aggregate",
    envelope: {
      task_id: input.taskId,
      requester_identity: {
        type: "user",
        id: "profile_conformance_user",
        ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
      },
      target_agent: "dbread-agent-v1",
      intent: "Profile conformance task",
      constraints: {
        common: { environment: "staging", redaction_level: "basic" },
        domain: { dataset: "incident_metrics", service: "payments" },
      },
      risk_class: "medium",
      delegation_token: "placeholder",
      requested_output_mode: "summary",
    },
  };
}

async function run(): Promise<void> {
  const checks: ConformanceCheck[] = [];

  const openDispatch = createDispatcher({
    deploymentProfile: "open",
    enforceSignedRequests: false,
    requireTenant: false,
  });
  const openResponse = await openDispatch(
    "POST",
    "/dispatch",
    makeDispatchBody({ taskId: `task_open_${randomUUID()}` }),
  );
  checks.push({
    name: "open_profile_allows_unsigned_dispatch",
    ok: openResponse.statusCode === 200 || openResponse.statusCode === 202,
  });

  const verifiedDispatchUnsigned = createDispatcher({
    deploymentProfile: "verified",
    enforceSignedRequests: true,
    requireTenant: true,
  });
  const verifiedUnsigned = await verifiedDispatchUnsigned(
    "POST",
    "/dispatch",
    makeDispatchBody({
      taskId: `task_verified_unsigned_${randomUUID()}`,
      tenantId: "tenant_A",
    }),
  );
  checks.push({
    name: "verified_profile_rejects_unsigned_dispatch",
    ok:
      verifiedUnsigned.statusCode === 401 ||
      verifiedUnsigned.statusCode === 403,
  });

  const { privateKey: verifiedPrivateKey, publicKey: verifiedPublicKey } =
    generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
  const verifiedPrivatePem = verifiedPrivateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const verifiedPublicPem = verifiedPublicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_verified_rs",
          alg: "RS256",
          private_key_pem: verifiedPrivatePem,
          public_key_pem: verifiedPublicPem,
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_verified_rs",
    },
    async () => {
      const verifiedDispatch = createDispatcher({
        deploymentProfile: "verified",
        enforceSignedRequests: true,
        requireTenant: true,
      });
      const ready = await verifiedDispatch("GET", "/ready");
      checks.push({
        name: "verified_profile_ready_compliant",
        ok: ready.statusCode === 200,
      });

      const body = makeDispatchBody({
        taskId: `task_verified_signed_${randomUUID()}`,
        tenantId: "tenant_A",
      });
      const rawBody = JSON.stringify(body);
      const signedHeaders = signHttpRequest({
        method: "POST",
        path: "/dispatch",
        timestamp: new Date().toISOString(),
        key_id: "kid_verified_rs",
        body: rawBody,
      });
      const response = await verifiedDispatch("POST", "/dispatch", body, {
        ...signedHeaders,
      });
      checks.push({
        name: "verified_profile_allows_signed_dispatch",
        ok: response.statusCode === 200 || response.statusCode === 202,
      });
    },
  );

  const regulatedNonCompliant = createDispatcher({
    deploymentProfile: "regulated",
    enforceSignedRequests: true,
    requireTenant: false,
  });
  const regulatedReadyFail = await regulatedNonCompliant("GET", "/ready");
  checks.push({
    name: "regulated_profile_detects_non_compliance",
    ok: regulatedReadyFail.statusCode === 503,
  });

  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privatePem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const publicPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  await withEnv(
    {
      MAP_SIGNING_KEYS: JSON.stringify([
        {
          kid: "kid_regulated_rs",
          alg: "RS256",
          private_key_pem: privatePem,
          public_key_pem: publicPem,
          status: "active",
          demo_only: false,
        },
      ]),
      MAP_SIGNING_ACTIVE_KID: "kid_regulated_rs",
    },
    async () => {
      const regulatedDispatch = createDispatcher({
        deploymentProfile: "regulated",
        enforceSignedRequests: true,
        requireTenant: true,
      });
      const ready = await regulatedDispatch("GET", "/ready");
      checks.push({
        name: "regulated_profile_ready_compliant",
        ok: ready.statusCode === 200,
      });

      const body = makeDispatchBody({
        taskId: `task_regulated_signed_${randomUUID()}`,
        tenantId: "tenant_A",
      });
      const rawBody = JSON.stringify(body);
      const signedHeaders = signHttpRequest({
        method: "POST",
        path: "/dispatch",
        timestamp: new Date().toISOString(),
        key_id: "kid_regulated_rs",
        body: rawBody,
      });
      const response = await regulatedDispatch("POST", "/dispatch", body, {
        ...signedHeaders,
      });
      checks.push({
        name: "regulated_profile_allows_signed_rs256_dispatch",
        ok: response.statusCode === 200 || response.statusCode === 202,
      });
    },
  );

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    suite: "deployment_profiles",
    total_checks: checks.length,
    passed_checks: checks.length - failed.length,
    failed_checks: failed.length,
    checks,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();
