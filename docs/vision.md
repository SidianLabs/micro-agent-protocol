# MAP Vision

## Overview

Micro Agent Protocol (MAP) is a framework and protocol for a new deployment model in AI systems:

- users interact with a general-purpose assistant
- organizations deploy their own micro-agents behind a MAP boundary
- those micro-agents control access to sensitive systems

MAP exists because organizations should not have to choose between two bad options:

- give a general assistant direct tool access to sensitive systems
- build a completely separate full-scale agent product for every integration

MAP provides the missing middle layer.

## The Refined MAP Model

The refined MAP model is not primarily about one large organization-wide orchestrator calling internal sub-agents.

It is about this pattern:

1. An external assistant understands the user request.
2. When execution or privileged access is needed, it calls a company-owned MAP micro-agent.
3. That micro-agent applies company policy, uses local systems, and returns the minimum useful result.

This means the assistant can remain useful and general, while the organization keeps control over execution.

## The Problem MAP Solves

Current assistant integrations often expose systems too directly.

That creates three recurring failures.

### 1. Too Much Authority in the Assistant

If the assistant can directly call high-impact tools, the assistant becomes the effective superuser. This is especially risky for payments, databases, internal operations, and customer data.

### 2. Too Much Context Moving Upstream

If every tool call returns broad raw output, the assistant accumulates too much context too quickly. This increases cost, reduces clarity, and creates privacy and leakage risk.

### 3. Too Little Local Control

Organizations need local enforcement of:

- business rules
- regulatory rules
- approval paths
- data access constraints
- environment boundaries

Those rules should live near the resource, not only in the prompt of an external assistant.

## MAP Thesis

The right abstraction is not:

- raw tools
- or heavyweight peer agents

The right abstraction is:

- small, capability-scoped micro-agents owned by the system owner

These micro-agents are:

- narrower than a general-purpose agent
- smarter than a direct tool wrapper
- deployed close to the systems they protect
- able to apply policy and reduce context before returning results

MAP standardizes how those micro-agents are described, discovered, authorized, invoked, and audited.

## Canonical Example: Payments

Suppose a user asks an external assistant to buy something.

The assistant can:

- understand the request
- do research
- compare sellers
- gather order information

But when it is time to perform a payment, it should not directly hold payment authority.

Instead:

1. The assistant sends a MAP task to the payment company’s `PaymentAgent`.
2. The payment company’s micro-agent checks merchant validity, account state, fraud rules, spending rules, and approval requirements.
3. The micro-agent either approves, declines, or requests approval.
4. It returns the result and receipt to the assistant.
5. The assistant presents the outcome to the user.

The payment company keeps control over payment execution. The assistant remains the planner and interface.

## Canonical Example: Databases

Suppose engineers use an assistant to work with internal systems.

Without MAP, a broad database tool may expose too much data and flood the assistant’s context.

With MAP:

1. The assistant asks a `DBReadAgent` a narrow question.
2. The database-side micro-agent queries locally.
3. It applies access policy, filtering, aggregation, and summarization.
4. It returns only the relevant answer.

MAP is therefore a security boundary and a context-compression boundary.

## What MAP Enables

MAP enables a world where:

- external assistants remain broadly useful
- organizations deploy local micro-agents the way they deploy microservices
- credentials stay close to the systems that use them
- policy is enforced near the action
- results sent upstream are minimal and auditable

## Product Positioning

The clearest positioning is:

MCP exposes tools.

MAP exposes controlled execution agents.

Or even shorter:

MCP makes tools easy to expose.

MAP makes safe execution easy to deploy.

## What MAP Is

MAP is:

- a framework for third parties to build and deploy their own micro-agents
- a protocol for assistant-to-micro-agent delegation
- a context minimization layer
- a trust boundary for sensitive execution

## What MAP Is Not

MAP is not:

- a universal replacement for APIs
- a protocol for turning every workflow into autonomous execution
- a way to give external assistants more default power
- a requirement that every micro-agent be a large standalone agent product

## Long-Term Goal

The long-term goal of MAP is to become a universal execution fabric for assistant-to-system interaction.

In that world:

- external assistants handle reasoning and user interaction
- organizations expose capabilities only through micro-agents
- high-risk execution is always bounded, local, and auditable
- context returned upstream is intentionally small and useful

MAP does not centralize control in the assistant. It redistributes control to the system owner through narrow, deployable, policy-aware micro-agents.
