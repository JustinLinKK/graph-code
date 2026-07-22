# MA-4 Scheduler and Model Router Evidence

## Scope

MA-4 replaces tier hints with deterministic safety routing and adds opt-in work-unit dispatch. No paid provider is invoked by the acceptance suite; concurrency and execution use deterministic delayed/fake providers.

## Router behavior

- `small` requires a leaf-local unit, one or two known edit scopes, low cut-edge load, complete index evidence, available validation, low ambiguity, sufficient confidence, and no risk beyond a narrow cross-file relation.
- `large` is selected for cross-package/repository blast radius, high cut-edge load, public/interface changes, shared state, incomplete index evidence, security/migration/concurrency risk, low planning confidence, or broad work.
- Remaining work selects `medium`.
- Every new MA-4 decision includes the configured provider/model, concurrency setting, price metadata, estimates, and reasons.
- Explicit user/policy overrides remain selected even when a recomputed recommendation differs. A partition-level test specifically verifies that an explicit small-tier downgrade is not replaced by a large estimate.
- Actual token counts, cost when prices exist, latency, retries, escalations, integration failures, acceptance outcome, and test outcome persist with the decision.

## Scheduler acceptance

The focused fake-provider suite verifies:

| Gate | Result |
|---|---|
| Five independent units at concurrency two | peak concurrency `2`; dispatch waves `3 = ceil(5/2)` |
| Overlapping same-file ranges | peak conflicting concurrency `1` |
| Required dependency | consumer begins only after producer acceptance |
| Tier assignment | small, medium, and large calls receive their configured provider/model |
| Per-model limit | two small-model calls serialize at model concurrency `1` |
| Failure policy | one transient retry plus one context escalation completes on medium |
| Revision policy | stale producer is marked stale and its consumer blocked |
| Pause/resume | no call dispatches while paused |
| Cancellation | accepted work is preserved; active and queued work are cancelled |
| Apply lock | same-workspace applies serialize and revalidate revision after lock acquisition |

## Opt-in execution and persistence

The API acceptance test enables all three prerequisites:

```text
GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS
GRAPHCODE_WORK_UNIT_CONTEXT
GRAPHCODE_MODEL_ROUTER_V2
```

Workflow start then uses topology work units, deterministic routing, bounded context compilation, and dynamic scheduling. The fake provider stores scoped proposal-only diffs. The bounded runner never calls the full-project graph reader or rereads uncompiled source, rejects direct-edit CLI modes, parses unified-diff hunk ranges, and validates them against ownership. Assignment, metrics, and the explicit mode override are unchanged after a subsequent API reload and SQLite reopen.

## Focused verification

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/graph-query exec vitest run src/partitioning/deterministic.test.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/agent-runtime exec vitest run src/context/compiler.test.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/local-server exec vitest run src/services/model-router.test.ts src/services/workflow-scheduler.test.ts src/db/repository.work-units.test.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/local-server exec vitest run src/routes.test.ts -t "routes and schedules bounded MA-4"
```

Focused results: graph-query `9/9`, context/compiler-execution `8/8`, router/scheduler/persistence `14/14`, and MA-4 API execution `1/1`.

## Honest limitations carried forward

- Repository settings do not yet expose provider prices, so production assignments persist `null` prices and costs rather than pretending cost is zero.
- Proposals still require the existing human layer-apply action; MA-5 adds deterministic combined-patch and contract integration gates.
- MA-3 capsules have measured overhead on tiny fixtures. MA-7 must evaluate and optimize that overhead on representative repositories before default-on rollout.
