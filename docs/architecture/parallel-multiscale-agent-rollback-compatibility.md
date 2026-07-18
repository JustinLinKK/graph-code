# Parallel Multi-Scale Agent Rollback and Compatibility

This document is the MA-7 rollback contract for the default-on graph-partitioned workflow. It must remain available while compatibility code or databases created before MA-7 are supported.

## Default and safe rollback boundary

The default server configuration enables:

```text
GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS=true
GRAPHCODE_WORK_UNIT_CONTEXT=true
GRAPHCODE_MODEL_ROUTER_V2=true
GRAPHCODE_EDGE_CONTRACTS=true
GRAPHCODE_INTEGRATION_GATE=true
```

An unset variable means enabled. The accepted false values are `0`, `false`, `no`, and `off`. An unrecognized value fails closed to disabled for that flag.

Prefer a feature-flag rollback over a binary or database downgrade. To restore the pre-MA-7 compatibility workflow for diagnosis, set all five variables to `false` and restart the local server. Existing workflow rows, normalized ownership/contracts/routing/checks, proposals, and layouts remain stored; the rollback does not delete them.

Partial rollback levels are available but should be short-lived:

- `GRAPHCODE_INTEGRATION_GATE=false` returns layer application to the compatibility apply path. Do not use this to bypass a known failed check.
- `GRAPHCODE_MODEL_ROUTER_V2=false` returns started workflows to the compatibility scheduler while partition/context previews remain available.
- `GRAPHCODE_WORK_UNIT_CONTEXT=false` disables context preview and prevents the partition scheduler prerequisites from becoming active.
- `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS=false` restores the legacy preview shape and compatibility workflow creation.
- `GRAPHCODE_EDGE_CONTRACTS=false` disables contract metadata rollout but does not remove persisted contracts.

## Data compatibility

MA-1 through MA-6 migrations are additive except for rebuilding the two workflow tables to extend their status constraints with `cancelled`. The rebuild preserves rows and normalized foreign-key references; migration tests execute `foreign_key_check` after upgrading a legacy database.

Current binaries read legacy workflows that have no orchestration version and retain the compatibility `items` response. Feature-flag rollback therefore requires no data rewrite.

A binary downgrade to a pre-MA-6 version is different: that binary may not understand `cancelled`. Take a copy of `.graphcode/graphcode.sqlite` first. The supported rollback remains the current binary with flags disabled. If an older binary is mandatory, use an exported workspace/database copy and explicitly map cancelled workflow rows to `failed` and cancelled item rows to `skipped`; this loses cancellation semantics and must not be performed on the only database copy.

## Provider and mutation compatibility

The default path is proposal-only. Work-unit and integration agents cannot use direct-edit CLI permission modes. `Integrate` is validation-only; `Apply layer` is the mutation boundary and reruns the deterministic gate under the workspace revision lock.

Disabling the new flags does not grant providers broader authority. The compatibility path still stores proposals behind explicit user application. A rollback must not change provider credentials, CLI permission modes, or workspace filesystem permissions.

## Preserved research baseline versus production legacy calls

The round-robin implementation and legacy prompt builders remain under explicit benchmark/test entry points because the MA-7 ablation must stay reproducible. They are not called by a default coding workflow:

- production planning no longer dispatches round-robin graph chunks;
- default workflow execution uses the graph partitioner, bounded compiler, deterministic router/scheduler, and integration gate;
- standalone coding and review contexts use a bounded parent/current canvas rather than `readGraph`; and
- legacy full-graph prompts are constructed only when a benchmark or explicit `includeLegacyShadow=true` request asks for them.

## Rollback triggers and verification

Consider rollback when a release observation shows ownership/boundary coverage below 100%, silent budget overflow, stale revisions reaching apply, unauthorized/overlapping writes becoming applicable, required checks being skipped, or loss of completed proposals after cancellation.

After changing flags, verify:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For the default-on path, also run:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-ablations -- --delay-ms 5 --format table
```

The report must show all five flags enabled, zero paid provider calls, zero default legacy calls, unique ownership, complete boundary coverage, an acyclic dependency graph, and bounded contexts.
