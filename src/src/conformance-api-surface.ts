import { Readable } from "node:stream";
import { createMapHandler } from "./server.js";
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

interface ConformanceCheck {
  name: string;
  ok: boolean;
}

function hasPagination(body: Record<string, unknown>): boolean {
  const pagination = body.pagination as
    | { limit?: unknown; next_cursor?: unknown }
    | null
    | undefined;
  if (pagination === null) {
    return true;
  }
  if (!pagination || typeof pagination !== "object") {
    return false;
  }
  const hasLimit = typeof pagination.limit === "number";
  const hasCursor =
    typeof pagination.next_cursor === "string" ||
    typeof pagination.next_cursor === "number" ||
    pagination.next_cursor === null;
  return hasLimit && hasCursor;
}

async function run(): Promise<void> {
  const dispatch = createDispatcher();
  const checks: ConformanceCheck[] = [];

  const listEndpoints = [
    { name: "provider_discovery_contract", path: "/.well-known/map" },
    { name: "tasks_contract", path: "/tasks?limit=1" },
    { name: "receipts_contract", path: "/receipts?limit=1" },
    { name: "dead_letters_contract", path: "/dead-letters?limit=1" },
    { name: "alerts_contract", path: "/alerts?limit=1" },
    { name: "audit_events_contract", path: "/audit-events?limit=1" },
    { name: "key_discovery_contract", path: "/.well-known/map-keys?limit=1" },
  ];

  for (const endpoint of listEndpoints) {
    const first = await dispatch("GET", endpoint.path);
    const etag = first.headers.etag;
    const second = await dispatch("GET", endpoint.path, undefined, {
      "if-none-match": etag ?? "",
    });

    let ok =
      first.statusCode === 200 &&
      typeof etag === "string" &&
      etag.length > 0 &&
      second.statusCode === 304;

    if (endpoint.name !== "provider_discovery_contract") {
      ok = ok && hasPagination(first.body);
    }

    checks.push({ name: endpoint.name, ok });
  }

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    suite: "api_surface",
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
