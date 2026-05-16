<!--
MAP Protocol - Micro Agent Protocol

Copyright © 2026 Sidian Labs
SPDX-License-Identifier: Apache-2.0
-->

# MAP Protocol Buffer Specification

This directory contains the **canonical Protocol Buffer definition** for the Micro Agent Protocol (MAP).

## Single Source of Truth

`map.proto` is the **single source of truth** for the MAP wire format. All other representations of the MAP data model MUST be generated from this file:

- **SDK Types**: Go, TypeScript, Python, and other language SDKs generate their type definitions from `map.proto` using [Buf](https://buf.build).
- **JSON Schemas**: The JSON Schema files in `../schemas/` are derived from the proto definitions and should be regenerated when the proto changes.
- **OpenAPI / Swagger**: The OpenAPI specification in `../schemas/openapi.yaml` derives its schemas from these same proto definitions.
- **Documentation**: Any data-model documentation should reference the proto file as the authoritative source.

## File Layout

| File | Purpose |
|------|---------|
| `map.proto` | Canonical Protocol Buffer definition for all MAP messages, enums, and types. |
| `buf.yaml` | [Buf](https://buf.build) configuration for linting, breaking change detection, and dependency management. |
| `buf.gen.yaml` | Buf code generation configuration — controls how SDK types are generated for Go, TypeScript, Python, etc. |

## Workflow

1. **Make changes here first.** Any modification to the MAP data model MUST start with an update to `map.proto`.
2. **Run buf lint.** `buf lint` validates the proto file against best practices.
3. **Regenerate SDKs.** Run `buf generate` to regenerate all language-specific type definitions.
4. **Regenerate JSON Schemas.** Update the derived JSON Schema files to reflect the proto changes.
5. **Update all SDKs.** Ensure that every SDK package (TypeScript, Python, Go, etc.) picks up the regenerated types and passes its test suite.

## Conventions

- **Proto3 syntax** with explicit `google.api.field_behavior` annotations for REQUIRED fields (following the A2A protocol's pattern).
- Enum values use the `_UNSPECIFIED` zero-value convention as recommended by Google's API design guide.
- Message field names use `snake_case` as per protobuf conventions.
- The proto file is the **only place** where field-level documentation comments live; SDK doc comments are generated from these.

## Related

- [Buf Documentation](https://buf.build/docs)
- [Google API Design Guide — Protocol Buffers](https://cloud.google.com/apis/design/proto3)
- [A2A Protocol — a2a.proto](https://github.com/google/A2A)
- [MAP Main README](../README.md)
