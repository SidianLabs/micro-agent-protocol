/**
 * This file is generated from /schemas/*.schema.json.
 * Do not edit it by hand.
 */

export const agentDescriptorSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/agent-descriptor.schema.json",
  "title": "MAP Agent Descriptor",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "agent_id",
    "organization",
    "version",
    "domain",
    "capabilities",
    "risk_level",
    "input_schema_ref",
    "output_schema_ref",
    "supported_execution_modes",
    "visibility_modes"
  ],
  "properties": {
    "agent_id": {
      "type": "string",
      "minLength": 1
    },
    "organization": {
      "type": "string",
      "minLength": 1
    },
    "version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "domain": {
      "type": "string",
      "minLength": 1
    },
    "capabilities": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "risk_level": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    },
    "input_schema_ref": {
      "type": "string",
      "minLength": 1
    },
    "output_schema_ref": {
      "type": "string",
      "minLength": 1
    },
    "supported_execution_modes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "enum": [
          "read",
          "analyze",
          "propose",
          "commit",
          "monitor",
          "batch"
        ]
      }
    },
    "approval_requirements": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": []
    },
    "visibility_modes": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "enum": [
          "full",
          "summary",
          "structured_only",
          "receipt_only",
          "redacted",
          "debug"
        ]
      }
    },
    "policy_hooks": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": []
    },
    "display_name": {
      "type": "string"
    },
    "provider_url": {
      "type": "string"
    },
    "documentation_url": {
      "type": "string"
    },
    "auth_schemes": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "none",
          "bearer",
          "mtls",
          "signed_request"
        ]
      },
      "default": []
    },
    "capability_descriptors": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name",
          "execution_mode",
          "request_schema_ref",
          "response_schema_ref"
        ],
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "execution_mode": {
            "type": "string",
            "enum": [
              "read",
              "analyze",
              "propose",
              "commit",
              "monitor",
              "batch"
            ]
          },
          "request_schema_ref": {
            "type": "string",
            "minLength": 1
          },
          "response_schema_ref": {
            "type": "string",
            "minLength": 1
          },
          "constraint_schema_ref": {
            "type": "string"
          },
          "approval_required_by_default": {
            "type": "boolean"
          },
          "auth_schemes": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "none",
                "bearer",
                "mtls",
                "signed_request"
              ]
            },
            "default": []
          },
          "required_auth_scheme": {
            "type": "string",
            "enum": [
              "bearer",
              "mtls",
              "signed_request"
            ]
          },
          "schema_version": {
            "type": "string",
            "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
          },
          "supported_schema_versions": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            }
          },
          "preferred_schema_version": {
            "type": "string",
            "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
          },
          "translation_targets": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "from",
                "to",
                "mode"
              ],
              "properties": {
                "from": {
                  "type": "string",
                  "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
                },
                "to": {
                  "type": "string",
                  "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
                },
                "mode": {
                  "type": "string",
                  "enum": [
                    "provider_translation"
                  ]
                }
              }
            },
            "default": []
          },
          "compatibility": {
            "type": "string",
            "enum": [
              "backward_compatible",
              "forward_compatible",
              "breaking_change"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "deprecated",
              "disabled"
            ]
          }
        }
      },
      "default": []
    },
    "transport_bindings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "kind",
          "endpoint"
        ],
        "properties": {
          "kind": {
            "type": "string",
            "enum": [
              "http"
            ]
          },
          "endpoint": {
            "type": "string"
          }
        }
      },
      "default": []
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": []
    },
    "registry_status": {
      "type": "string",
      "enum": [
        "active",
        "deprecated",
        "disabled"
      ],
      "default": "active"
    },
    "description": {
      "type": "string"
    },
    "descriptor_signature": {
      "type": "string",
      "minLength": 1
    },
    "descriptor_key_id": {
      "type": "string",
      "minLength": 1
    },
    "descriptor_signature_alg": {
      "type": "string",
      "enum": [
        "HS256",
        "RS256"
      ]
    }
  }
} as const;

export const approvalRequestSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/approval-request.schema.json",
  "title": "MAP Approval Request",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "task_id",
    "approval_reference",
    "capability",
    "envelope"
  ],
  "properties": {
    "task_id": {
      "type": "string",
      "minLength": 1
    },
    "approval_reference": {
      "type": "string",
      "minLength": 1
    },
    "capability": {
      "type": "string",
      "minLength": 1
    },
    "requested_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "negotiation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "schema_version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "delivery_mode": {
          "type": "string",
          "enum": [
            "sync",
            "async"
          ]
        }
      }
    },
    "envelope": {
      "$ref": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/task-envelope.schema.json"
    }
  }
} as const;

export const delegationTokenSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/delegation-token.schema.json",
  "title": "MAP Delegation Token",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "issuer",
    "subject_agent",
    "allowed_actions",
    "resource_scope",
    "constraints",
    "signature"
  ],
  "properties": {
    "issuer": {
      "type": "string",
      "minLength": 1
    },
    "subject_agent": {
      "type": "string",
      "minLength": 1
    },
    "allowed_actions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "resource_scope": {
      "type": "object"
    },
    "constraints": {
      "type": "object",
      "required": [
        "common",
        "domain",
        "expires_at"
      ],
      "properties": {
        "common": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "resource_id": {
              "type": "string"
            },
            "resource_ids": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "environment": {
              "type": "string",
              "enum": [
                "development",
                "staging",
                "production"
              ]
            },
            "max_amount": {
              "type": "number"
            },
            "currency": {
              "type": "string"
            },
            "limit": {
              "type": "integer",
              "minimum": 1
            },
            "approval_required": {
              "type": "boolean"
            },
            "redaction_level": {
              "type": "string",
              "enum": [
                "none",
                "basic",
                "strict"
              ]
            }
          }
        },
        "domain": {
          "type": "object"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        }
      },
      "additionalProperties": true
    },
    "approval_reference": {
      "type": "string"
    },
    "requester_identity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "user",
            "service",
            "agent"
          ]
        },
        "id": {
          "type": "string",
          "minLength": 1
        },
        "tenant_id": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "signature": {
      "type": "string",
      "minLength": 1
    }
  }
} as const;

export const dispatchRequestSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/dispatch-request.schema.json",
  "title": "MAP Dispatch Request",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "capability",
    "envelope"
  ],
  "properties": {
    "capability": {
      "type": "string",
      "minLength": 1
    },
    "requested_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "negotiation": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "schema_version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "delivery_mode": {
          "type": "string",
          "enum": [
            "sync",
            "async"
          ]
        }
      }
    },
    "envelope": {
      "$ref": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/task-envelope.schema.json"
    }
  }
} as const;

export const errorResponseSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/error-response.schema.json",
  "title": "MAP Error Response",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "code",
    "message",
    "retryable",
    "status"
  ],
  "properties": {
    "code": {
      "type": "string",
      "enum": [
        "agent_not_found",
        "agent_disabled",
        "capability_not_found",
        "capability_disabled",
        "policy_denied",
        "approval_required",
        "approval_denied",
        "approval_expired",
        "invalid_delegation_token",
        "token_expired",
        "token_invalid_signature",
        "token_missing_scope",
        "schema_validation_failed",
        "schema_version_unsupported",
        "schema_negotiation_failed",
        "tenant_mismatch",
        "rate_limit_exceeded",
        "request_timeout",
        "internal_error",
        "invalid_request",
        "idempotency_conflict",
        "resource_not_found",
        "unauthorized",
        "forbidden"
      ]
    },
    "message": {
      "type": "string",
      "minLength": 1
    },
    "retryable": {
      "type": "boolean"
    },
    "status": {
      "type": "integer",
      "minimum": 100,
      "maximum": 599
    },
    "details": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "category": {
          "type": "string",
          "enum": [
            "validation",
            "authentication",
            "authorization",
            "not_found",
            "conflict",
            "rate_limit",
            "server",
            "client"
          ]
        },
        "field": {
          "type": "string"
        },
        "value": {},
        "context": {
          "type": "object"
        },
        "validation_errors": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "field",
              "message",
              "code"
            ],
            "properties": {
              "field": {
                "type": "string",
                "minLength": 1
              },
              "message": {
                "type": "string",
                "minLength": 1
              },
              "code": {
                "type": "string",
                "enum": [
                  "agent_not_found",
                  "agent_disabled",
                  "capability_not_found",
                  "capability_disabled",
                  "policy_denied",
                  "approval_required",
                  "approval_denied",
                  "approval_expired",
                  "invalid_delegation_token",
                  "token_expired",
                  "token_invalid_signature",
                  "token_missing_scope",
                  "schema_validation_failed",
                  "schema_version_unsupported",
                  "schema_negotiation_failed",
                  "tenant_mismatch",
                  "rate_limit_exceeded",
                  "request_timeout",
                  "internal_error",
                  "invalid_request",
                  "idempotency_conflict",
                  "resource_not_found",
                  "unauthorized",
                  "forbidden"
                ]
              },
              "context": {
                "type": "object",
                "properties": {
                  "field_path": {
                    "type": "string"
                  },
                  "value": {},
                  "schema_path": {
                    "type": "string"
                  },
                  "original_error": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "schema_ref": {
          "type": "string"
        }
      }
    },
    "request_id": {
      "type": "string"
    }
  }
} as const;

export const executionReceiptSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/execution-receipt.schema.json",
  "title": "MAP Execution Receipt",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "receipt_id",
    "task_id",
    "agent_id",
    "action_taken",
    "resource_touched",
    "policy_checks",
    "timestamp",
    "result_hash",
    "signature"
  ],
  "properties": {
    "receipt_id": {
      "type": "string",
      "minLength": 1
    },
    "task_id": {
      "type": "string",
      "minLength": 1
    },
    "tenant_id": {
      "type": "string",
      "minLength": 1
    },
    "request_id": {
      "type": "string",
      "minLength": 1
    },
    "agent_id": {
      "type": "string",
      "minLength": 1
    },
    "action_taken": {
      "type": "string",
      "minLength": 1
    },
    "resource_touched": {
      "type": "string",
      "minLength": 1
    },
    "policy_checks": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "approval_used": {
      "type": "string"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "result_hash": {
      "type": "string",
      "minLength": 1
    },
    "requested_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "executed_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "negotiation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "requested",
        "selected"
      ],
      "properties": {
        "requested": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "output_mode",
            "delivery_mode"
          ],
          "properties": {
            "schema_version": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "output_mode": {
              "type": "string",
              "enum": [
                "full",
                "summary",
                "structured_only",
                "receipt_only",
                "redacted",
                "debug"
              ]
            },
            "delivery_mode": {
              "type": "string",
              "enum": [
                "sync",
                "async"
              ]
            }
          }
        },
        "selected": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "output_mode",
            "delivery_mode"
          ],
          "properties": {
            "schema_version": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "output_mode": {
              "type": "string",
              "enum": [
                "full",
                "summary",
                "structured_only",
                "receipt_only",
                "redacted",
                "debug"
              ]
            },
            "delivery_mode": {
              "type": "string",
              "enum": [
                "sync",
                "async"
              ]
            }
          }
        },
        "provider_actions": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "schema_translated"
            ]
          }
        }
      }
    },
    "signature": {
      "type": "string",
      "minLength": 1
    }
  }
} as const;

export const invocationNegotiationSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/invocation-negotiation.schema.json",
  "title": "MAP Invocation Negotiation",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "requested",
    "selected"
  ],
  "properties": {
    "requested": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "output_mode",
        "delivery_mode"
      ],
      "properties": {
        "schema_version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "output_mode": {
          "type": "string",
          "enum": [
            "full",
            "summary",
            "structured_only",
            "receipt_only",
            "redacted",
            "debug"
          ]
        },
        "delivery_mode": {
          "type": "string",
          "enum": [
            "sync",
            "async"
          ]
        }
      }
    },
    "selected": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "output_mode",
        "delivery_mode"
      ],
      "properties": {
        "schema_version": {
          "type": "string",
          "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
        },
        "output_mode": {
          "type": "string",
          "enum": [
            "full",
            "summary",
            "structured_only",
            "receipt_only",
            "redacted",
            "debug"
          ]
        },
        "delivery_mode": {
          "type": "string",
          "enum": [
            "sync",
            "async"
          ]
        }
      }
    },
    "provider_actions": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "schema_translated"
        ]
      },
      "default": []
    }
  }
} as const;

export const mapCoreSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/map-core.schema.json",
  "title": "MAP Protocol Core Types",
  "description": "Core type definitions shared across all MAP schemas",
  "type": "object",
  "definitions": {
    "risk_level": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    },
    "execution_mode": {
      "type": "string",
      "enum": [
        "read",
        "analyze",
        "propose",
        "commit",
        "monitor",
        "batch"
      ]
    },
    "visibility_mode": {
      "type": "string",
      "enum": [
        "full",
        "summary",
        "structured_only",
        "receipt_only",
        "redacted",
        "debug"
      ]
    },
    "delivery_mode": {
      "type": "string",
      "enum": [
        "sync",
        "async"
      ]
    },
    "task_status": {
      "type": "string",
      "enum": [
        "accepted",
        "proposed",
        "awaiting_approval",
        "denied",
        "running",
        "completed",
        "failed",
        "revoked"
      ]
    },
    "auth_scheme": {
      "type": "string",
      "enum": [
        "none",
        "bearer",
        "mtls",
        "signed_request"
      ]
    },
    "error_code": {
      "type": "string",
      "enum": [
        "agent_not_found",
        "agent_disabled",
        "capability_not_found",
        "capability_disabled",
        "policy_denied",
        "approval_required",
        "approval_denied",
        "approval_expired",
        "invalid_delegation_token",
        "token_expired",
        "token_invalid_signature",
        "token_missing_scope",
        "schema_validation_failed",
        "schema_version_unsupported",
        "schema_negotiation_failed",
        "tenant_mismatch",
        "rate_limit_exceeded",
        "request_timeout",
        "internal_error",
        "invalid_request",
        "idempotency_conflict",
        "resource_not_found",
        "unauthorized",
        "forbidden"
      ]
    },
    "requester_identity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "user",
            "service",
            "agent"
          ]
        },
        "id": {
          "type": "string",
          "minLength": 1
        },
        "tenant_id": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "task_constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "common": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "resource_id": {
              "type": "string"
            },
            "resource_ids": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "environment": {
              "type": "string",
              "enum": [
                "development",
                "staging",
                "production"
              ]
            },
            "max_amount": {
              "type": "number"
            },
            "currency": {
              "type": "string"
            },
            "limit": {
              "type": "integer",
              "minimum": 1
            },
            "approval_required": {
              "type": "boolean"
            },
            "time_window": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "start",
                "end"
              ],
              "properties": {
                "start": {
                  "type": "string",
                  "format": "date-time"
                },
                "end": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            },
            "redaction_level": {
              "type": "string",
              "enum": [
                "none",
                "basic",
                "strict"
              ]
            }
          }
        },
        "domain": {
          "type": "object"
        }
      }
    },
    "time_window": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "start",
        "end"
      ],
      "properties": {
        "start": {
          "type": "string",
          "format": "date-time"
        },
        "end": {
          "type": "string",
          "format": "date-time"
        }
      }
    },
    "semantic_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "capability_descriptor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "execution_mode",
        "request_schema_ref",
        "response_schema_ref"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1
        },
        "execution_mode": {
          "$ref": "#/definitions/execution_mode"
        },
        "request_schema_ref": {
          "type": "string",
          "minLength": 1
        },
        "response_schema_ref": {
          "type": "string",
          "minLength": 1
        },
        "constraint_schema_ref": {
          "type": "string"
        },
        "approval_required_by_default": {
          "type": "boolean"
        },
        "auth_schemes": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/auth_scheme"
          },
          "default": []
        },
        "required_auth_scheme": {
          "type": "string",
          "enum": [
            "bearer",
            "mtls",
            "signed_request"
          ]
        },
        "schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "supported_schema_versions": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/semantic_version"
          }
        },
        "preferred_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "translation_targets": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "from",
              "to",
              "mode"
            ],
            "properties": {
              "from": {
                "$ref": "#/definitions/semantic_version"
              },
              "to": {
                "$ref": "#/definitions/semantic_version"
              },
              "mode": {
                "type": "string",
                "enum": [
                  "provider_translation"
                ]
              }
            }
          },
          "default": []
        },
        "compatibility": {
          "type": "string",
          "enum": [
            "backward_compatible",
            "forward_compatible",
            "breaking_change"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "active",
            "deprecated",
            "disabled"
          ]
        }
      }
    },
    "agent_descriptor": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "agent_id",
        "organization",
        "version",
        "domain",
        "capabilities",
        "risk_level",
        "input_schema_ref",
        "output_schema_ref",
        "supported_execution_modes",
        "visibility_modes"
      ],
      "properties": {
        "agent_id": {
          "type": "string",
          "minLength": 1
        },
        "organization": {
          "type": "string",
          "minLength": 1
        },
        "version": {
          "$ref": "#/definitions/semantic_version"
        },
        "domain": {
          "type": "string",
          "minLength": 1
        },
        "capabilities": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "risk_level": {
          "$ref": "#/definitions/risk_level"
        },
        "input_schema_ref": {
          "type": "string",
          "minLength": 1
        },
        "output_schema_ref": {
          "type": "string",
          "minLength": 1
        },
        "supported_execution_modes": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/execution_mode"
          }
        },
        "approval_requirements": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "visibility_modes": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/visibility_mode"
          }
        },
        "policy_hooks": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "display_name": {
          "type": "string"
        },
        "provider_url": {
          "type": "string"
        },
        "documentation_url": {
          "type": "string"
        },
        "auth_schemes": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/auth_scheme"
          },
          "default": []
        },
        "capability_descriptors": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/capability_descriptor"
          },
          "default": []
        },
        "transport_bindings": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "kind",
              "endpoint"
            ],
            "properties": {
              "kind": {
                "type": "string",
                "enum": [
                  "http"
                ]
              },
              "endpoint": {
                "type": "string"
              }
            }
          },
          "default": []
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "registry_status": {
          "type": "string",
          "enum": [
            "active",
            "deprecated",
            "disabled"
          ],
          "default": "active"
        },
        "description": {
          "type": "string"
        },
        "descriptor_signature": {
          "type": "string",
          "minLength": 1
        },
        "descriptor_key_id": {
          "type": "string",
          "minLength": 1
        },
        "descriptor_signature_alg": {
          "type": "string",
          "enum": [
            "HS256",
            "RS256"
          ]
        }
      }
    },
    "delegation_token": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "issuer",
        "subject_agent",
        "allowed_actions",
        "resource_scope",
        "constraints",
        "signature"
      ],
      "properties": {
        "issuer": {
          "type": "string",
          "minLength": 1
        },
        "subject_agent": {
          "type": "string",
          "minLength": 1
        },
        "allowed_actions": {
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1
          }
        },
        "resource_scope": {
          "type": "object"
        },
        "constraints": {
          "type": "object",
          "additionalProperties": true,
          "required": [
            "expires_at"
          ],
          "properties": {
            "common": {
              "type": "object"
            },
            "domain": {
              "type": "object"
            },
            "expires_at": {
              "type": "string",
              "format": "date-time"
            }
          }
        },
        "approval_reference": {
          "type": "string"
        },
        "requester_identity": {
          "$ref": "#/definitions/requester_identity"
        },
        "signature": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "task_envelope": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "task_id",
        "requester_identity",
        "target_agent",
        "intent",
        "constraints",
        "risk_class",
        "delegation_token",
        "requested_output_mode"
      ],
      "properties": {
        "task_id": {
          "type": "string",
          "minLength": 1
        },
        "parent_task_id": {
          "type": "string"
        },
        "requester_identity": {
          "$ref": "#/definitions/requester_identity"
        },
        "target_agent": {
          "type": "string",
          "minLength": 1
        },
        "intent": {
          "type": "string",
          "minLength": 1
        },
        "constraints": {
          "$ref": "#/definitions/task_constraints"
        },
        "risk_class": {
          "$ref": "#/definitions/risk_level"
        },
        "deadline": {
          "type": "string",
          "format": "date-time"
        },
        "delegation_token": {
          "type": "string",
          "minLength": 1
        },
        "requested_output_mode": {
          "$ref": "#/definitions/visibility_mode"
        },
        "metadata": {
          "type": "object",
          "default": {}
        }
      }
    },
    "result_package": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "task_id",
        "status",
        "structured_output",
        "followup_required"
      ],
      "properties": {
        "task_id": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "$ref": "#/definitions/task_status"
        },
        "summary": {
          "type": "string"
        },
        "structured_output": {
          "type": "object"
        },
        "receipt_ref": {
          "type": "string"
        },
        "negotiated_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "requested_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "executed_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "negotiation": {
          "$ref": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/invocation-negotiation.schema.json"
        },
        "redactions_applied": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "followup_required": {
          "type": "boolean"
        },
        "escalation_reason": {
          "type": "string"
        }
      }
    },
    "execution_receipt": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "receipt_id",
        "task_id",
        "agent_id",
        "action_taken",
        "resource_touched",
        "policy_checks",
        "timestamp",
        "result_hash",
        "signature"
      ],
      "properties": {
        "receipt_id": {
          "type": "string",
          "minLength": 1
        },
        "task_id": {
          "type": "string",
          "minLength": 1
        },
        "tenant_id": {
          "type": "string"
        },
        "request_id": {
          "type": "string"
        },
        "agent_id": {
          "type": "string",
          "minLength": 1
        },
        "action_taken": {
          "type": "string",
          "minLength": 1
        },
        "resource_touched": {
          "type": "string",
          "minLength": 1
        },
        "policy_checks": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "approval_used": {
          "type": "string"
        },
        "timestamp": {
          "type": "string",
          "format": "date-time"
        },
        "result_hash": {
          "type": "string",
          "minLength": 1
        },
        "requested_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "executed_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "negotiation": {
          "$ref": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/invocation-negotiation.schema.json"
        },
        "signature": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "dispatch_request": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "capability",
        "envelope"
      ],
      "properties": {
        "capability": {
          "type": "string",
          "minLength": 1
        },
        "requested_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "negotiation": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "schema_version": {
              "$ref": "#/definitions/semantic_version"
            },
            "delivery_mode": {
              "$ref": "#/definitions/delivery_mode"
            }
          }
        },
        "envelope": {
          "$ref": "#/definitions/task_envelope"
        }
      }
    },
    "approval_request": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "task_id",
        "approval_reference",
        "capability",
        "envelope"
      ],
      "properties": {
        "task_id": {
          "type": "string",
          "minLength": 1
        },
        "approval_reference": {
          "type": "string",
          "minLength": 1
        },
        "capability": {
          "type": "string",
          "minLength": 1
        },
        "requested_schema_version": {
          "$ref": "#/definitions/semantic_version"
        },
        "negotiation": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "schema_version": {
              "$ref": "#/definitions/semantic_version"
            },
            "delivery_mode": {
              "$ref": "#/definitions/delivery_mode"
            }
          }
        },
        "envelope": {
          "$ref": "#/definitions/task_envelope"
        }
      }
    }
  }
} as const;

export const paginatedResultSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/paginated-result.schema.json",
  "title": "MAP Paginated Result",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "items",
    "pagination"
  ],
  "properties": {
    "items": {
      "type": "array",
      "items": {}
    },
    "pagination": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "limit",
        "next_cursor"
      ],
      "properties": {
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000
        },
        "next_cursor": {
          "type": [
            "string",
            "null"
          ]
        },
        "total": {
          "type": "integer",
          "minimum": 0
        }
      }
    }
  }
} as const;

export const providerDiscoverySchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/provider-discovery.schema.json",
  "title": "MAP Provider Discovery Document",
  "description": "Bootstrap discovery document for a MAP provider trust domain.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "protocol",
    "provider",
    "trust",
    "transports",
    "agents",
    "documentation"
  ],
  "properties": {
    "protocol": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "version",
        "discovery_version"
      ],
      "properties": {
        "name": {
          "type": "string",
          "const": "MAP"
        },
        "version": {
          "type": "string"
        },
        "discovery_version": {
          "type": "string"
        }
      }
    },
    "provider": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "provider_id",
        "display_name"
      ],
      "properties": {
        "provider_id": {
          "type": "string"
        },
        "display_name": {
          "type": "string"
        },
        "provider_url": {
          "type": "string",
          "format": "uri"
        }
      }
    },
    "trust": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "trust_domain",
        "issuer",
        "profile",
        "key_discovery_url"
      ],
      "properties": {
        "trust_domain": {
          "type": "string"
        },
        "issuer": {
          "type": "string"
        },
        "profile": {
          "type": "string"
        },
        "key_discovery_url": {
          "type": "string"
        }
      }
    },
    "transports": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "kind",
          "path"
        ],
        "properties": {
          "kind": {
            "type": "string",
            "const": "http"
          },
          "path": {
            "type": "string"
          }
        }
      }
    },
    "agents": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "count",
        "items"
      ],
      "properties": {
        "count": {
          "type": "integer",
          "minimum": 0
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "agent_id",
              "version",
              "domain",
              "capabilities",
              "registry_status"
            ],
            "properties": {
              "agent_id": {
                "type": "string"
              },
              "display_name": {
                "type": "string"
              },
              "version": {
                "type": "string"
              },
              "domain": {
                "type": "string"
              },
              "capabilities": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "registry_status": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "documentation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "agents_url",
        "http_transport_url",
        "registry_discovery_url"
      ],
      "properties": {
        "agents_url": {
          "type": "string"
        },
        "http_transport_url": {
          "type": "string"
        },
        "registry_discovery_url": {
          "type": "string"
        }
      }
    }
  }
} as const;

export const resultPackageSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/result-package.schema.json",
  "title": "MAP Result Package",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "task_id",
    "status",
    "structured_output",
    "followup_required"
  ],
  "properties": {
    "task_id": {
      "type": "string",
      "minLength": 1
    },
    "status": {
      "type": "string",
      "enum": [
        "accepted",
        "proposed",
        "awaiting_approval",
        "denied",
        "running",
        "completed",
        "failed",
        "revoked"
      ]
    },
    "summary": {
      "type": "string"
    },
    "structured_output": {
      "type": "object"
    },
    "receipt_ref": {
      "type": "string"
    },
    "negotiated_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "requested_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "executed_schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "negotiation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "requested",
        "selected"
      ],
      "properties": {
        "requested": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "output_mode",
            "delivery_mode"
          ],
          "properties": {
            "schema_version": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "output_mode": {
              "type": "string",
              "enum": [
                "full",
                "summary",
                "structured_only",
                "receipt_only",
                "redacted",
                "debug"
              ]
            },
            "delivery_mode": {
              "type": "string",
              "enum": [
                "sync",
                "async"
              ]
            }
          }
        },
        "selected": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "output_mode",
            "delivery_mode"
          ],
          "properties": {
            "schema_version": {
              "type": "string",
              "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
            },
            "output_mode": {
              "type": "string",
              "enum": [
                "full",
                "summary",
                "structured_only",
                "receipt_only",
                "redacted",
                "debug"
              ]
            },
            "delivery_mode": {
              "type": "string",
              "enum": [
                "sync",
                "async"
              ]
            }
          }
        },
        "provider_actions": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "schema_translated"
            ]
          }
        }
      }
    },
    "redactions_applied": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": []
    },
    "followup_required": {
      "type": "boolean"
    },
    "escalation_reason": {
      "type": "string"
    }
  }
} as const;

export const taskEnvelopeSchema = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/SidianLabs/micro-agent-protocol/raw/main/schemas/task-envelope.schema.json",
  "title": "MAP Task Envelope",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "task_id",
    "requester_identity",
    "target_agent",
    "intent",
    "constraints",
    "risk_class",
    "delegation_token",
    "requested_output_mode"
  ],
  "properties": {
    "task_id": {
      "type": "string",
      "minLength": 1
    },
    "parent_task_id": {
      "type": "string"
    },
    "requester_identity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "id"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "user",
            "service",
            "agent"
          ]
        },
        "id": {
          "type": "string",
          "minLength": 1
        },
        "tenant_id": {
          "type": "string",
          "minLength": 1
        }
      }
    },
    "target_agent": {
      "type": "string",
      "minLength": 1
    },
    "intent": {
      "type": "string",
      "minLength": 1
    },
    "constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "common": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "resource_id": {
              "type": "string"
            },
            "resource_ids": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "environment": {
              "type": "string",
              "enum": [
                "development",
                "staging",
                "production"
              ]
            },
            "max_amount": {
              "type": "number"
            },
            "currency": {
              "type": "string"
            },
            "limit": {
              "type": "integer",
              "minimum": 1
            },
            "approval_required": {
              "type": "boolean"
            },
            "time_window": {
              "type": "object",
              "additionalProperties": false,
              "required": [
                "start",
                "end"
              ],
              "properties": {
                "start": {
                  "type": "string",
                  "format": "date-time"
                },
                "end": {
                  "type": "string",
                  "format": "date-time"
                }
              }
            },
            "redaction_level": {
              "type": "string",
              "enum": [
                "none",
                "basic",
                "strict"
              ]
            }
          }
        },
        "domain": {
          "type": "object"
        }
      }
    },
    "risk_class": {
      "type": "string",
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    },
    "deadline": {
      "type": "string",
      "format": "date-time"
    },
    "delegation_token": {
      "type": "string",
      "minLength": 1
    },
    "requested_output_mode": {
      "type": "string",
      "enum": [
        "full",
        "summary",
        "structured_only",
        "receipt_only",
        "redacted",
        "debug"
      ]
    },
    "metadata": {
      "type": "object",
      "default": {}
    }
  }
} as const;
