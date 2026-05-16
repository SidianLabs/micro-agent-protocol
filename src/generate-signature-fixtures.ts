/**
 * MAP Protocol - Micro Agent Protocol
 *
 * Copyright © 2026 Sidian Labs
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  signAuditExport,
  signConformanceExport,
  signHttpRequest,
  signTrustBundle
} from "./security/signing.js";

const envBackup = {
  MAP_SIGNING_KEYS: process.env.MAP_SIGNING_KEYS,
  MAP_SIGNING_ACTIVE_KID: process.env.MAP_SIGNING_ACTIVE_KID,
  MAP_SIGNING_REVOKED_KIDS: process.env.MAP_SIGNING_REVOKED_KIDS
};

process.env.MAP_SIGNING_KEYS = JSON.stringify([
  {
    kid: "fixture_hs_1",
    secret: "fixture_secret_1",
    status: "active",
    demo_only: false,
    scopes: [
      "http_request",
      "audit_export",
      "conformance_export",
      "trust_bundle"
    ]
  }
]);
process.env.MAP_SIGNING_ACTIVE_KID = "fixture_hs_1";
delete process.env.MAP_SIGNING_REVOKED_KIDS;

const httpPayload = {
  method: "POST",
  path: "/dispatch",
  timestamp: "2026-03-22T00:00:00.000Z",
  key_id: "fixture_hs_1",
  body: JSON.stringify({ action: "fixture" })
};
const auditPayload = {
  export_id: "audit-export:fixture",
  created_at: "2026-03-22T00:00:00.000Z",
  events_count: 1,
  checkpoints_count: 0,
  latest_chain_index: 1,
  latest_event_hash: "fixture_hash"
};
const conformancePayload = {
  export_id: "conformance-export:fixture",
  created_at: "2026-03-22T00:00:00.000Z",
  profile: "verified" as const,
  total_checks: 10,
  passed_checks: 10,
  failed_checks: 0,
  artifact_hash: "fixture_artifact_hash"
};
const trustPayload = {
  bundle_id: "trust-bundle:fixture",
  created_at: "2026-03-22T00:00:00.000Z",
  trust_domain: "fixture.map.local",
  issuer: "fixture.issuer",
  profile: "verified" as const,
  keys_hash: "fixture_keys_hash"
};

const fixtures = {
  version: "v1",
  key_id: "fixture_hs_1",
  fixtures: {
    http_request: {
      payload: httpPayload,
      signature: signHttpRequest(httpPayload)["x-map-request-signature"]
    },
    audit_export: {
      payload: auditPayload,
      signature: signAuditExport(auditPayload)
    },
    conformance_export: {
      payload: conformancePayload,
      signature: signConformanceExport(conformancePayload)
    },
    trust_bundle: {
      payload: trustPayload,
      signature: signTrustBundle(trustPayload)
    }
  }
};

writeFileSync(
  resolve(process.cwd(), "src/fixtures/signature-fixtures.v1.json"),
  JSON.stringify(fixtures, null, 2),
  "utf8"
);

process.env.MAP_SIGNING_KEYS = envBackup.MAP_SIGNING_KEYS;
process.env.MAP_SIGNING_ACTIVE_KID = envBackup.MAP_SIGNING_ACTIVE_KID;
process.env.MAP_SIGNING_REVOKED_KIDS = envBackup.MAP_SIGNING_REVOKED_KIDS;
