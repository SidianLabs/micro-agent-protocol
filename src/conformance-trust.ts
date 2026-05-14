import { Readable } from "node:stream";
import {
  verifyAuditExportSignature,
  verifyConformanceExportSignature,
  verifyTrustBundleSignature,
} from "./security/signing.js";
import { createMapHandler } from "./server/index.js";
import { createExampleAgents } from "../demo/agents/index.js";

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

interface Check {
  name: string;
  ok: boolean;
}

async function run(): Promise<void> {
  const dispatch = createDispatcher({ deploymentProfile: "verified" });
  const checks: Check[] = [];

  const keys = await dispatch("GET", "/.well-known/map-keys?limit=1");
  checks.push({
    name: "key_discovery_includes_trust_metadata",
    ok:
      keys.statusCode === 200 &&
      typeof (keys.body.trust as { trust_domain?: unknown } | undefined)
        ?.trust_domain === "string" &&
      typeof (keys.body.trust as { issuer?: unknown } | undefined)?.issuer ===
        "string",
  });

  const trustBundle = await dispatch("GET", "/trust-bundle/export");
  const trust = trustBundle.body.trust_bundle as
    | Record<string, unknown>
    | undefined;
  checks.push({
    name: "trust_bundle_signature_valid",
    ok:
      trustBundle.statusCode === 200 &&
      !!trust &&
      verifyTrustBundleSignature(
        {
          bundle_id: String(trust.bundle_id ?? ""),
          created_at: String(trust.created_at ?? ""),
          trust_domain: String(trust.trust_domain ?? ""),
          issuer: String(trust.issuer ?? ""),
          profile:
            (trust.profile as "open" | "verified" | "regulated") ?? "open",
          keys_hash: String(trust.keys_hash ?? ""),
        },
        String(trust.signature ?? ""),
      ),
  });

  const auditExport = await dispatch("GET", "/audit-events/export");
  const audit = auditExport.body.export as Record<string, unknown> | undefined;
  checks.push({
    name: "audit_export_signature_valid",
    ok:
      auditExport.statusCode === 200 &&
      !!audit &&
      verifyAuditExportSignature(
        {
          export_id: String(audit.export_id ?? ""),
          created_at: String(audit.created_at ?? ""),
          events_count: Number(audit.events_count ?? 0),
          checkpoints_count: Number(audit.checkpoints_count ?? 0),
          latest_chain_index: Number(audit.latest_chain_index ?? 0),
          latest_event_hash: String(audit.latest_event_hash ?? ""),
        },
        String(audit.signature ?? ""),
      ),
  });

  const confExport = await dispatch("GET", "/conformance/export");
  const conf = confExport.body.conformance as
    | Record<string, unknown>
    | undefined;
  checks.push({
    name: "conformance_export_signature_valid",
    ok:
      confExport.statusCode === 200 &&
      !!conf &&
      verifyConformanceExportSignature(
        {
          export_id: String(conf.export_id ?? ""),
          created_at: String(conf.created_at ?? ""),
          profile:
            (conf.profile as "open" | "verified" | "regulated") ?? "open",
          total_checks: Number(conf.total_checks ?? 0),
          passed_checks: Number(conf.passed_checks ?? 0),
          failed_checks: Number(conf.failed_checks ?? 0),
          artifact_hash: String(conf.artifact_hash ?? ""),
        },
        String(conf.signature ?? ""),
      ),
  });

  const failed = checks.filter((c) => !c.ok);
  const summary = {
    suite: "trust_chain",
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
