import AjvModule from "ajv";
const Ajv = AjvModule.default || AjvModule;
import intentSchema from "./intent.schema.json" with { type: "json" };
import type { Intent, ValidationResult, RiskLevel } from "../types.js";

const ajv = new Ajv({ allErrors: true, strict: false });

const validateIntent = ajv.compile(intentSchema);

export function validate(intent: unknown): ValidationResult {
  const valid = validateIntent(intent);

  if (!valid && validateIntent.errors) {
    return {
      valid: false,
      errors: validateIntent.errors.map((err: { instancePath?: string; path?: string; message?: string }) => ({
        field: err.instancePath || err.path || "unknown",
        message: err.message || "validation error",
      })),
    };
  }

  return { valid: true, errors: [] };
}

export function normalize(intent: Intent): Intent {
  return {
    ...intent,
    capability: intent.capability.toLowerCase().trim(),
    requester: {
      ...intent.requester,
      id: intent.requester.id.trim(),
      tenant_id: intent.requester.tenant_id?.trim(),
    },
    risk_class: intent.risk_class?.toLowerCase() as RiskLevel,
  };
}