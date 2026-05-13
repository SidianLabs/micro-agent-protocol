# MAP Invocation Negotiation Semantics (v1-rc)

## Capability-Level Contract

1. Capability descriptors MUST declare supported schema versions.
2. Requesters MAY send a requested schema version.
3. Requesters MAY send invocation negotiation preferences for schema version and delivery mode.

## Resolution Rules

Provider MUST:

1. execute requested version directly, OR
2. execute a declared compatible translated version, OR
3. reject with `schema_version_unsupported`.
4. reject with `unsupported_output_mode` when the requested output mode is not supported by the target agent descriptor.
5. reject when `requested_schema_version` and `negotiation.schema_version` conflict.
6. reject when `negotiation.delivery_mode` conflicts with `envelope.metadata.async`.

## Receipt/Result Metadata

1. When invocation negotiation occurs, responses MUST include:
   - `requested_schema_version`
   - `executed_schema_version`
   - `negotiation.requested`
   - `negotiation.selected`
