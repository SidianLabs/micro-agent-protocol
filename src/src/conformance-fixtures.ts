import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  signAuditExport,
  signConformanceExport,
  signHttpRequest,
  signTrustBundle,
  verifyAuditExportSignature,
  verifyConformanceExportSignature,
  verifyHttpRequestSignature,
  verifyTrustBundleSignature
} from "./security/signing.js";

interface FixtureRecord<P> {
  payload: P;
  signature: string;
}

interface SignatureFixtures {
  version: string;
  key_id: string;
  fixtures: {
    http_request: FixtureRecord<{
      method: string;
      path: string;
      timestamp: string;
      key_id: string;
      body: string;
    }>;
    audit_export: FixtureRecord<{
      export_id: string;
      created_at: string;
      events_count: number;
      checkpoints_count: number;
      latest_chain_index: number;
      latest_event_hash: string;
    }>;
    conformance_export: FixtureRecord<{
      export_id: string;
      created_at: string;
      profile: "open" | "verified" | "regulated";
      total_checks: number;
      passed_checks: number;
      failed_checks: number;
      artifact_hash: string;
    }>;
    trust_bundle: FixtureRecord<{
      bundle_id: string;
      created_at: string;
      trust_domain: string;
      issuer: string;
      profile: "open" | "verified" | "regulated";
      keys_hash: string;
    }>;
  };
}

function withFixtureEnv<T>(fn: () => T): T {
  const previous = {
    MAP_SIGNING_KEYS: process.env.MAP_SIGNING_KEYS,
    MAP_SIGNING_ACTIVE_KID: process.env.MAP_SIGNING_ACTIVE_KID,
    MAP_SIGNING_REVOKED_KIDS: process.env.MAP_SIGNING_REVOKED_KIDS,
    MAP_REQUEST_MAX_AGE_MS: process.env.MAP_REQUEST_MAX_AGE_MS
  };

  process.env.MAP_SIGNING_KEYS = JSON.stringify([
    {
      kid: "fixture_hs_1",
      secret: "fixture_secret_1",
      status: "active",
      demo_only: false,
      scopes: ["http_request", "audit_export", "conformance_export", "trust_bundle"]
    }
  ]);
  process.env.MAP_SIGNING_ACTIVE_KID = "fixture_hs_1";
  delete process.env.MAP_SIGNING_REVOKED_KIDS;
  process.env.MAP_REQUEST_MAX_AGE_MS = String(10 * 365 * 24 * 60 * 60 * 1000);

  try {
    return fn();
  } finally {
    process.env.MAP_SIGNING_KEYS = previous.MAP_SIGNING_KEYS;
    process.env.MAP_SIGNING_ACTIVE_KID = previous.MAP_SIGNING_ACTIVE_KID;
    process.env.MAP_SIGNING_REVOKED_KIDS = previous.MAP_SIGNING_REVOKED_KIDS;
    process.env.MAP_REQUEST_MAX_AGE_MS = previous.MAP_REQUEST_MAX_AGE_MS;
  }
}

async function run(): Promise<void> {
  const fixtures = JSON.parse(
    readFileSync(resolve(process.cwd(), "src/fixtures/signature-fixtures.v1.json"), "utf8")
  ) as SignatureFixtures;

  const checks = withFixtureEnv(() => {
    const httpSigned = signHttpRequest(fixtures.fixtures.http_request.payload)["x-map-request-signature"];
    const auditSigned = signAuditExport(fixtures.fixtures.audit_export.payload);
    const confSigned = signConformanceExport(fixtures.fixtures.conformance_export.payload);
    const trustSigned = signTrustBundle(fixtures.fixtures.trust_bundle.payload);

    return [
      {
        name: "http_request_signature_deterministic",
        ok: httpSigned === fixtures.fixtures.http_request.signature
      },
      {
        name: "audit_export_signature_deterministic",
        ok: auditSigned === fixtures.fixtures.audit_export.signature
      },
      {
        name: "conformance_export_signature_deterministic",
        ok: confSigned === fixtures.fixtures.conformance_export.signature
      },
      {
        name: "trust_bundle_signature_deterministic",
        ok: trustSigned === fixtures.fixtures.trust_bundle.signature
      },
      {
        name: "http_request_signature_verifies",
        ok: verifyHttpRequestSignature({
          ...fixtures.fixtures.http_request.payload,
          signature: fixtures.fixtures.http_request.signature
        })
      },
      {
        name: "audit_export_signature_verifies",
        ok: verifyAuditExportSignature(
          fixtures.fixtures.audit_export.payload,
          fixtures.fixtures.audit_export.signature
        )
      },
      {
        name: "conformance_export_signature_verifies",
        ok: verifyConformanceExportSignature(
          fixtures.fixtures.conformance_export.payload,
          fixtures.fixtures.conformance_export.signature
        )
      },
      {
        name: "trust_bundle_signature_verifies",
        ok: verifyTrustBundleSignature(
          fixtures.fixtures.trust_bundle.payload,
          fixtures.fixtures.trust_bundle.signature
        )
      }
    ];
  });

  const failed = checks.filter((check) => !check.ok);
  const summary = {
    suite: "signature_fixtures",
    fixture_version: fixtures.version,
    total_checks: checks.length,
    passed_checks: checks.length - failed.length,
    failed_checks: failed.length,
    checks
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();
