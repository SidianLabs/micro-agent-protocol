# MAP Constraint Vocabulary Draft

## Overview

This document defines the first shared constraint vocabulary for MAP.

The goal is not to remove all domain-specific constraints. The goal is to give every MAP implementation a common core language for bounding execution, so `constraints` is not just an unstructured object.

MAP should treat constraints as the policy-facing expression of what the assistant is asking the micro-agent to do and what the micro-agent is allowed to do.

## Design Goals

The constraint vocabulary should:

- be reusable across domains
- encode the most common execution limits
- separate shared control fields from domain-specific fields
- support policy evaluation and delegation token issuance
- remain extensible without breaking interoperability

## Constraint Structure

The shared MAP constraint object should be divided into two parts:

- `common`
- `domain`

`common` contains cross-domain constraints that any micro-agent or policy engine can understand.

`domain` contains capability-specific constraints defined by the micro-agent owner.

## Common Constraint Fields

The first shared MAP constraint vocabulary includes:

- `resource_id`
- `resource_ids`
- `environment`
- `max_amount`
- `currency`
- `limit`
- `approval_required`
- `time_window`
- `redaction_level`

### `resource_id`

The primary resource being targeted by the task.

Examples:

- merchant id
- vendor id
- dataset id
- document id

### `resource_ids`

A list form of `resource_id` for bounded multi-resource requests.

### `environment`

The target environment.

Examples:

- `development`
- `staging`
- `production`

### `max_amount`

A ceiling for amount-based operations such as payments or refunds.

### `currency`

The currency associated with an amount-limited task.

### `limit`

A maximum count for records, rows, objects, or returned items.

### `approval_required`

An explicit assistant-side hint or previously-known requirement that a task should be approval-gated.

This does not override policy. It helps carry approval context through the protocol.

### `time_window`

A bounded execution or query window.

Suggested shape:

```json
{
  "start": "2026-03-19T00:00:00Z",
  "end": "2026-03-19T01:00:00Z"
}
```

### `redaction_level`

The desired or required output sensitivity level.

Suggested values:

- `none`
- `basic`
- `strict`

## Domain Constraint Fields

The `domain` section is intentionally open to the micro-agent owner.

Examples:

### Payments

```json
{
  "common": {
    "resource_id": "vendor_abc",
    "max_amount": 4500,
    "currency": "INR"
  },
  "domain": {
    "invoice_id": "INV-223",
    "approved_vendor_only": true
  }
}
```

### Database Reads

```json
{
  "common": {
    "environment": "staging",
    "limit": 5,
    "redaction_level": "basic"
  },
  "domain": {
    "query_type": "aggregate",
    "dataset": "incident_metrics",
    "service": "payments"
  }
}
```

## Policy Interpretation

The MAP policy layer should be able to reason over the `common` section generically.

Examples:

- deny or approval-gate `environment = production`
- require approval for `max_amount` above a threshold
- clamp `limit` to a policy maximum
- enforce a minimum `redaction_level`

The `domain` section remains micro-agent-specific.

## Delegation Tokens

Delegation tokens should preserve the same split:

- shared execution limits in `constraints.common`
- micro-agent-specific details in `constraints.domain`

This gives the signing and audit model a more stable shape and makes interoperability more realistic.

## Why This Matters

Without a shared constraint vocabulary:

- every micro-agent invents its own fields
- policy becomes harder to share
- delegation tokens become inconsistent
- interoperability breaks at the most important boundary

With a shared core vocabulary:

- policy engines can reason across domains
- assistants can generate safer requests
- tokens and receipts become easier to standardize

## Status

This is the first draft of the MAP constraint vocabulary.

It should evolve next into:

- formal JSON Schemas for `common`
- domain registration guidance
- compatibility rules for future constraint additions
