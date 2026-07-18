# Graph Model

This package defines the shared, runtime-validated graph and agent-orchestration contracts used across GraphCode.

Responsibilities:

- Define internal node and edge concepts.
- Represent graph snapshots and incremental updates.
- Track stable identities for repository, module, file, class, function, dependency, test, and proposal nodes.
- Capture relationships such as contains, imports, calls, owns, tests, impacts, proposes-change-to, and depends-on.
- Validate API, persistence, parser, UI, and agent-runtime boundaries with Zod.
- Define parallel multi-scale work units, revisions, budgets, ownership/write scopes, routing decisions, interface contracts, and proposal envelopes.

The package is private to the monorepo and exported through `src/index.ts`. Focused orchestration contracts live in `src/work-units.ts`; workflow-wide validation rejects duplicate ownership, dangling or invalid-layer dependencies, unsafe source paths, invalid boundary edges, and inconsistent routing/contract references before persistence. MA-4 routing decisions add backward-compatible provider/model assignments plus actual token, cost, latency, retry, escalation, integration-failure, acceptance, and test metrics. MA-5 adds typed integration-check kinds, durable actual/planned write scopes and proposal revisions on workflow items, and contract-update metadata in the work-unit proposal envelope.
