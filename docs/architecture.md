# MAP Reference Architecture

## Overview

This document defines the reference architecture for Micro Agent Protocol (MAP) under the refined deployment model:

- an external assistant handles user interaction and planning
- an organization deploys one or more MAP micro-agents
- those micro-agents mediate access to the organization’s systems

The most important architectural idea is that the assistant and the micro-agent owner are not the same party.

The assistant is the requester.

The organization is the executor.

MAP standardizes the boundary between them.

For the production build target, see:

- [`docs/target-production-architecture.md`](./target-production-architecture.md)

## System Roles

### 1. User

The human or upstream system that expresses the goal.

### 2. External Assistant

The assistant that interacts with the user and performs broad reasoning.

Examples:

- ChatGPT
- Claude
- Copilot
- enterprise assistants

Responsibilities:

- understand intent
- gather context
- select the right capability
- send structured MAP requests
- present results back to the user

Constraints:

- should not directly hold broad authority over third-party sensitive systems
- should not directly receive unnecessary internal system data

### 3. MAP Control Plane

The MAP control plane provides the standard routing and governance layer.

Core services:

- registry
- routing
- schema validation
- identity
- lifecycle tracking
- delegation token issuance
- receipt handling

### 4. Company Micro-Agent Runtime

This is the execution environment owned by the organization exposing the capability.

It hosts one or more narrow micro-agents such as:

- `PaymentAgent`
- `RefundAgent`
- `DBReadAgent`
- `DBWriteAgent`
- `CRMUpdateAgent`
- `FileAgent`

Responsibilities:

- receive MAP task envelopes
- validate local policy
- call local systems or adapters
- minimize and redact output
- return structured results and receipts

### 5. Resource Layer

The actual systems being protected or exposed through MAP.

Examples:

- payment rails
- fraud engines
- databases
- CRMs
- ERPs
- document systems
- local files
- internal APIs

## Core Boundary

The core MAP boundary is:

`external assistant -> company MAP micro-agent`

This boundary matters because it defines:

- who owns execution authority
- who owns credentials
- who owns policy
- what data moves upstream

## Canonical Architecture

```text
User
  |
  v
External Assistant
  |
  v
MAP Request
  |
  v
MAP Control Plane
  |---------- Registry
  |---------- Policy Engine
  |---------- Delegation Service
  |---------- Receipts / Audit
  |
  +-----------------------+----------------------+--------------------+
  |                       |                      |                    |
  v                       v                      v                    v
PaymentAgent           DBReadAgent          CRMUpdateAgent        FileAgent
  |                       |                      |                    |
  v                       v                      v                    v
Payment Stack          Internal DB           CRM System           Local Files
```

## Production Target Architecture

The canonical architecture above is useful as a conceptual model.

The production build target for MAP is documented in:

- [`docs/target-production-architecture.md`](./target-production-architecture.md)

That document defines:

1. a best-practice distributed architecture
2. a security-first component model
3. non-negotiable invariants
4. concrete stage-by-stage implementation order

## Execution Flow

### General Flow

1. A user asks the external assistant to do something.
2. The assistant performs broad reasoning and gathers context.
3. The assistant determines that a sensitive or bounded capability is needed.
4. The assistant sends a MAP task to the target company’s micro-agent.
5. The MAP layer validates identity, schema, and delegation constraints.
6. The company micro-agent applies local policy and executes if allowed.
7. The micro-agent returns a result package and receipt.
8. The assistant presents the result to the user.

### Payment Flow

1. The user asks the assistant to buy an item.
2. The assistant researches options and gathers seller information.
3. When payment is required, it sends a MAP task to the payment company’s `PaymentAgent`.
4. The payment-side micro-agent checks:
   - merchant validity
   - account state
   - fraud rules
   - spending limits
   - approval requirements
   - regulatory constraints
5. The micro-agent approves, declines, or pauses for approval.
6. The assistant receives only the result and receipt.

### Database Flow

1. The assistant needs information from an internal database.
2. It sends a narrow query request to a `DBReadAgent`.
3. The database-side micro-agent queries locally.
4. It filters, aggregates, and redacts as needed.
5. It returns only the answer or summary needed upstream.

This keeps raw database output out of the assistant’s context unless explicitly permitted.

## Trust Boundaries

MAP should define these boundaries explicitly:

- user to external assistant
- external assistant to MAP control plane
- control plane to company micro-agent
- micro-agent to local adapter
- adapter to underlying system

Each boundary should expose the minimum information and authority required.

## Reference Components

### MAP Assistant SDK

Used by external assistants or assistant platforms to:

- discover capabilities
- format task envelopes
- send requests
- receive results and receipts

### MAP Registry

Stores:

- micro-agent descriptors
- capabilities
- schema references
- versions
- trust metadata

### MAP Policy Engine

Determines whether a task can be:

- allowed
- denied
- marked as approval-required

### MAP Delegation Service

Issues short-lived scoped authority to the target micro-agent.

### MAP Micro-Agent Runtime

The environment where the company’s micro-agents run with local credentials and local policy.

### MAP Receipts Service

Stores or verifies the audit output of MAP execution.

## Deployment Patterns

### Provider Deployment

A third-party provider deploys its own micro-agents in front of its own systems.

Examples:

- payments provider
- CRM vendor
- infrastructure platform

This is the most important MAP deployment pattern.

### Internal Platform Deployment

A company deploys micro-agents for its own internal systems.

Examples:

- internal databases
- internal filesystems
- engineering tools

### Hybrid Deployment

Some micro-agents are third-party owned, and some are internal.

This is likely the common enterprise case.

## Design Constraints for Micro-Agents

Every MAP micro-agent should follow these rules:

- one primary domain
- one explicit capability boundary
- limited downstream tools
- bounded memory
- explicit schemas
- predictable outputs
- local credentials only
- no hidden transitive authority

If a micro-agent becomes too broad, it should be split.

## Output Minimization

MAP micro-agents should support output modes such as:

- summary
- structured-only
- receipt-only
- redacted
- debug

The default should favor minimal, structured, auditable output rather than full internal traces.

## Non-Goals

MAP does not assume:

- the assistant should directly access every protected system
- every company needs a full independent assistant
- unrestricted recursive delegation
- hidden policy inside prompts alone

MAP is designed to separate broad reasoning from bounded execution.
