# MCP to MAP Migration Strategy (Draft)

## Goal

Enable teams using direct tool protocols to migrate to MAP without rewriting assistant workflows from scratch.

## 1. Compatibility Position

MAP is not a thin rename of tool calling. MAP introduces:

1. company-owned execution boundaries
2. delegated scoped authority
3. explicit policy before execution
4. auditable receipts
5. output minimization controls

Migration should preserve workflow utility while upgrading security and governance.

## 2. Bridge Pattern

Recommended path:

1. keep assistant planner behavior
2. replace direct tool invocation with MAP capability invocation
3. run tool adapters inside provider-owned MAP micro-agents

Flow:

`assistant tool intent -> MAP dispatch -> provider micro-agent -> local tool/system -> MAP result/receipt`

## 3. Mapping Model

Each legacy tool maps to:

1. MAP `capability` name
2. MAP `constraints.common` fields
3. MAP `constraints.domain` fields
4. visibility mode defaults
5. approval policy class

## 4. Incremental Rollout

Stage 1: Read-only capabilities

1. migrate low-risk read tools first
2. enforce summary or structured-only output
3. validate latency and result quality

Stage 2: Conditional commit capabilities

1. add threshold and environment guardrails
2. introduce approval-required states
3. validate receipts and incident workflows

Stage 3: High-risk commit capabilities

1. enable strict auth and signed request requirements
2. enforce scoped tokens and replay protections
3. run compliance and audit validation

## 5. Security Upgrade Checklist

Per migrated capability:

1. no direct assistant credential access
2. provider-owned policy gate exists
3. bounded token scope exists
4. receipt generation exists
5. output minimization defaults exist

## 6. Operational Checklist

1. idempotency behavior defined
2. task lifecycle monitoring in place
3. error mapping stable for assistant retry behavior
4. fallback and rollback plan tested

## 7. Success Metrics

1. reduction in direct sensitive tool exposure
2. reduction in sensitive data returned to assistant context
3. increase in auditable state-changing actions
4. stable user-visible success rates and latency

## 8. Anti-Patterns

1. wrapping direct tool calls without policy or token checks
2. returning full internal traces by default
3. skipping receipt generation for commit operations
4. bypassing provider-owned runtime ownership
