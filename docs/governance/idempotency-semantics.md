# MAP Idempotency Semantics (v1-rc)

## Identity Model

A dispatch request identity is evaluated using:

1. `task_id`
2. requester identity (`type`, `id`, `tenant_id` when present)
3. `capability`
4. `target_agent`
5. optional header identity (`x-map-idempotency-key`) when provided

## Rules

1. Repeating the same identity MUST return the existing task/result state.
2. Reusing a `task_id` with a different requester/capability/target MUST return `idempotency_conflict`.
3. Reusing `x-map-idempotency-key` for a different identity MUST return `idempotency_conflict`.
4. Idempotent replay MUST be side-effect safe.
5. Conflict responses SHOULD include machine-readable `details.category = "conflict"`.

## Retry Guidance

1. Clients MAY safely retry transport failures with the same idempotency identity.
2. Servers SHOULD preserve deterministic responses for replayed identities.
