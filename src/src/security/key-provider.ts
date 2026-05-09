import { readFileSync } from "node:fs";

export interface SigningKeyConfigRecord {
  kid: string;
  secret?: string;
  alg?: "HS256" | "RS256";
  private_key_pem?: string;
  public_key_pem?: string;
  status?: "active" | "retiring" | "revoked";
  scopes?: string[];
  demo_only?: boolean;
}

interface SigningKeyProvider {
  id: string;
  listSigningKeys(): SigningKeyConfigRecord[];
}

class EnvSigningKeyProvider implements SigningKeyProvider {
  id = "env";

  listSigningKeys(): SigningKeyConfigRecord[] {
    const raw = process.env.MAP_SIGNING_KEYS;
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as SigningKeyConfigRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

class JsonKeysetProvider implements SigningKeyProvider {
  id = "json_keyset";

  listSigningKeys(): SigningKeyConfigRecord[] {
    const raw = process.env.MAP_KMS_KEYSET_JSON;
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as SigningKeyConfigRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

class FileKeysetProvider implements SigningKeyProvider {
  id = "file_keyset";

  listSigningKeys(): SigningKeyConfigRecord[] {
    const path = process.env.MAP_KMS_KEYSET_PATH;
    if (!path || path.trim().length === 0) {
      return [];
    }
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as SigningKeyConfigRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

function resolveProvider(): SigningKeyProvider {
  const configured = (process.env.MAP_KEY_PROVIDER ?? "env").trim().toLowerCase();
  if (configured === "json_keyset" || configured === "kms_json") {
    return new JsonKeysetProvider();
  }
  if (configured === "file_keyset" || configured === "kms_file") {
    return new FileKeysetProvider();
  }
  return new EnvSigningKeyProvider();
}

export function getSigningKeyConfigsFromProvider(): SigningKeyConfigRecord[] {
  return resolveProvider().listSigningKeys();
}

export function getKeyProviderInfo(): { provider: string; configured: boolean } {
  const provider = resolveProvider();
  return {
    provider: provider.id,
    configured: provider.listSigningKeys().length > 0
  };
}
