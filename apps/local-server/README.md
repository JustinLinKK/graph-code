# Local Server

This directory contains the local Fastify service that connects the web workspace to repository-local graph state.

Current responsibilities:

- Open or create `.graphcode/graphcode.sqlite` workspaces.
- Seed the curated self-repo graph used for local testing.
- Serve project, hierarchy, canvas, node detail, layout, and block editing APIs.
- Persist graph node layouts and block metadata in SQLite.
- Keep generated workspace state local and ignored by git.

Run `pnpm seed` from the repo root only for optional self-fixture creation or an intentional destructive reset; it rebuilds the self workspace and erases local graph edits, saved placements, agent runs, and settings in `.graphcode/graphcode.sqlite`.

For normal development, run `pnpm dev` from the repo root. Normal server startup opens and migrates the existing database without reseeding it, and the web app waits for the user to open a workspace explicitly.

Index coverage and progress are available at `GET /api/v2/projects/:projectId/index-state`; `DELETE /api/v2/projects/:projectId/index-runs/current` requests cancellation. State is intentionally in-memory in this PR 1 compatibility phase. Revision persistence belongs to the later database-foundation phase in the scalability plan.

## Parallel multi-scale agent feature flags

The complete graph-partitioned stack is enabled by default in MA-7. An unset feature variable means enabled. Set a variable to `0`, `false`, `no`, or `off` for an explicit rollback; unknown values fail closed to disabled. The default preview uses the persisted `ma2-partition-v1` deterministic topology partitioner. Its orchestration payload includes bounded task-subgraph diagnostics, unique ownership, dependency/coordination classifications, one-hop read halos, cut-edge contracts or approved ignore reasons, SCC resolutions, write scopes, budgets, pinned revisions, and routing decisions beside compatibility item anchors.

If only the partition flag remains enabled during a partial rollback, the change is preview-only. Started workflows use the compatibility scheduler until the partition, context, and router prerequisites are enabled together.

`GRAPHCODE_WORK_UNIT_CONTEXT` controls bounded MA-3 context preview at:

```text
POST /api/projects/:projectId/coding-workflows/:workflowId/work-units/:workUnitId/context-preview
```

The response contains the typed context capsule and selected provider rendering. Exact owned source ranges, revisions, roles/reasons, contracts, execution metadata, omissions, provenance, and token budgets are validated before return. `includeLegacyShadow=true` additionally measures the legacy coding/review prompt without invoking a provider; it is off by default because shadow measurement intentionally reads the legacy project graph. Persisted context diagnostics omit source bodies.

With the default partition, context, and `GRAPHCODE_MODEL_ROUTER_V2` flags enabled, started workflows persist topology work units, route them through deterministic small/medium/large safety rules, assign the configured provider/model for the selected tier, compile bounded contexts, and dispatch through the dependency/conflict/provider/model-aware scheduler. The execution path is proposal-only: direct-edit CLI permission modes are rejected, completed proposals remain behind the existing human layer-apply boundary, and an incomplete index or stale pinned revision blocks dispatch.

MA-4 records estimated and actual tokens when available, latency, retries, escalations, integration failures, acceptance/test outcomes, and provider/model assignment. User tier overrides are retained through partition grouping, routing recomputation, scheduling, persistence, and reload. Provider price fields remain `null` until price configuration exists; missing pricing is not treated as zero.

The default `GRAPHCODE_INTEGRATION_GATE` apply path reparses every required diff, persists actual write scopes and proposal revisions, rejects path/range escapes, stale hashes, overlap/file-operation conflicts, invalid contract evidence, and failed required checks, and validates a deterministic combined patch in a temporary workspace. Available root format/lint/typecheck/build/test scripts and block-specific test metadata run before the checked patch may reach the real workspace. Integration evidence is returned in `workflow.integrationChecks`.

The default `GRAPHCODE_EDGE_CONTRACTS` surface allows work-unit responses to append `GRAPHCODE_WORK_UNIT_METADATA_JSON` with typed contract updates. Producer changes persist as proposed while affected consumers stay blocked until they acknowledge the same normalized snapshot. A failed deterministic gate may request a bounded medium/large reconciliation proposal, but that agent cannot edit or make the layer applicable without another successful gate pass.

## Workflow controls

MA-6 preview/start requests accept persisted `partitionConstraints` and `executionPolicy` values. Start also accepts `background: true`, allowing the web client to poll `GET /api/coding-workflows/:workflowId` while work units run. Send lifecycle and per-item actions to:

```text
POST /api/coding-workflows/control
```

Supported actions are `pause`, `resume`, `cancel`, `retry`, `escalate`, `skip`, and `integrate`. Cancellation persists explicit `cancelled` workflow/item states while retaining proposed, applied, and skipped work. `integrate` runs the MA-5 gate without workspace mutation; only the existing layer-apply endpoint can mutate the workspace after the gate passes again under the revision lock.

Execution policy limits are enforced server-side. The scheduler respects validated concurrency and rejects a workflow whose configured cost cap would be exceeded. A cost-capped workflow also fails closed when selected model pricing is unknown instead of treating missing pricing as zero.

Disable `GRAPHCODE_MODEL_ROUTER_V2` to roll started workflows back to the compatibility scheduler while retaining MA-2/MA-3 previews. Disable all five flags for a complete compatibility rollback. Additive SQLite records remain inert and do not need to be deleted. See `docs/architecture/parallel-multiscale-agent-rollback-compatibility.md` before any binary/database downgrade.

Run the deterministic fixture comparison from the repository root with:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-partitioning -- --format both
```

Run the provider-free MA-3 context shadow comparison with:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-context -- --format both
```

Run the MA-7 ablation, calibration, and default-on observation with:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-ablations -- --delay-ms 5 --format both
```
