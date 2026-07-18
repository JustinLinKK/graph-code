# Parallel Multi-Scale Agent Orchestration

## Architectural invariant

> GraphCode scales development by running graph-partitioned agents in parallel and routing each partition to the least expensive model capable of completing it safely; relationship edges define the contracts that make the parallel outputs integrable.

This is the target architecture for the parallel multi-scale agent refactor. Graph topology and explicit task ownership must determine work-unit boundaries. Relationship edges must become dependency, coordination, or interface-contract evidence. Model selection must be explainable, cost-aware, and constrained by the risk and context needs of each unit.

The existing human review and apply boundary remains a product invariant: providers return proposals to GraphCode and do not receive authority to mutate the workspace directly.

## MA-0 behavioral baseline

MA-0 freezes the observable legacy behavior before any scheduler, routing, context, or integration algorithm changes. It adds:

- a six-fixture corpus covering independent leaves, shared interfaces, same-file functions, cycles, cross-package changes, and parent integration;
- a stable copy of the legacy round-robin planning-chunk algorithm plus locality diagnostics;
- measurements from the current repository workflow preview for hierarchy layers, conflict groups, tier recommendations, and reasons;
- small, medium, and large legacy coding-context measurements;
- a deterministic delayed fake provider for serial and conflict-group-parallel makespan measurements; and
- explicit outcome coverage for proposals, tests, integration, token estimates, and cost estimates.

The baseline is deliberately descriptive. It does not change production scheduling behavior, enable a feature flag, call a paid model, or claim that unrecorded tests/integration succeeded. The preserved functions under `packages/agent-runtime/src/orchestration/legacy-baseline.ts` and the fixture corpus remain inputs to later ablations.

## Baseline metric definitions

| Metric | MA-0 definition |
|---|---|
| Planning locality | Fraction of relationship edges whose two endpoints appear in the same legacy round-robin chunk as the edge |
| Ignored relationship dependency | A configured relationship whose source and target workflow items remain in the same hierarchy-derived layer |
| Same-file parallel pair | Two items in one source file and layer that receive different legacy conflict groups |
| Context size | Rendered legacy coding prompt characters, with an explicit four-characters-per-token estimate |
| Tier distribution | Current workflow preview recommendations grouped by small, medium, and large, with the existing reason text |
| Conflict rate | Serialized same-conflict-group item pairs divided by all possible pairs in the measured schedule |
| Makespan/concurrency | Wall time and observed peak calls for the deterministic delayed fake provider |
| Cost | `null` when provider pricing and actual per-item token usage are not recorded; absence is never treated as zero |
| Integration result | The current manual layer-apply behavior, not an inferred deterministic integration pass |

The reproducible command and captured result are documented in [the MA-0 baseline report](../research/parallel-multiscale-agent-ma0-baseline.md).

## MA-1 schema and migration bridge

MA-1 adds the shared domain contracts and additive persistence needed by later algorithms without presenting legacy hierarchy chunks as topology-aware partitions. `packages/graph-model/src/work-units.ts` is the canonical Zod/TypeScript contract for:

- work units, scale-specific context budgets, normalized write scopes, expected outputs, and pinned workflow revisions;
- routing features and decisions, including estimates, reasons, and user/policy overrides;
- boundary-edge evidence, deterministic interface-contract snapshots, and source evidence;
- work-unit proposal envelopes, actual write scopes, contract updates, discovered dependencies, and test artifacts; and
- workflow-wide validation for unique ownership, resolvable earlier-layer dependencies, valid boundary edges, routing linkage, and contract endpoints.

MA-1 introduced an opt-in derivation bridge beside the legacy `items` array. That bridge remains the compatibility representation for started workflows until MA-4 replaces production dispatch. It derives one ownership seed per legacy workflow item, child-before-parent dependencies from the current hierarchy, coordination links from current graph relationships, conservative source write scopes, current tier recommendations, explicit context budgets, and current graph/index/workspace revision evidence.

The flag is disabled by default. A workflow created while it is disabled has no orchestration rows and is returned in the prior API shape. The additional rollout flags are parsed but intentionally have no production behavior in MA-1:

```text
GRAPHCODE_WORK_UNIT_CONTEXT
GRAPHCODE_MODEL_ROUTER_V2
GRAPHCODE_EDGE_CONTRACTS
GRAPHCODE_INTEGRATION_GATE
```

### Persistence

The migration extends `coding_workflows` and `coding_workflow_items` with nullable/defaulted orchestration metadata, then adds normalized tables:

| Table | Purpose |
|---|---|
| `coding_work_unit_nodes` | owned/read-halo/upstream/summary node roles with reasons and scores |
| `coding_work_unit_edges` | internal/boundary/dependency/evidence edge roles |
| `coding_work_unit_dependencies` | dependency/coordination classifications and status |
| `interface_contracts` | deterministic baseline/proposed contract snapshots and evidence |
| `model_routing_decisions` | versioned features, reasons, tier selection, estimates, and override |
| `integration_checks` | future per-layer/per-unit deterministic and test gate records |

All new tables use foreign keys and workflow/item/status/dependency/contract indexes. Migration tests reconstruct the pre-MA-1 workflow tables, preserve their rows, rerun `migrate`, and verify legacy summaries, item status, mode selection, and reasons are unchanged. Stored orchestration is revalidated through the shared schema on every read.

### Rollback and remaining legacy usage

Rollback is to disable `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS`; existing UI and API consumers continue using `items`, and the additive rows remain inert and recoverable. Removing the nullable columns/tables is neither required nor recommended for rollback.

MA-1 does not change provider invocation, conflict-group execution, layer readiness, proposal review/application, legacy coding context, or round-robin planning chunks. Therefore the MA-0 benchmark remains the scheduling comparison baseline.

## MA-2 deterministic graph partitioner

MA-2 adds `packages/graph-query` as a package-neutral partitioning boundary. The partitioner receives an explicitly scoped graph, planning targets, pinned revision evidence, task text, concurrency, context budgets, edge policy, and optional human constraints. It does not read SQLite, the filesystem, provider settings, or the whole repository itself.

The first deterministic policy:

- retains required targets, containment ancestors, and direct relationship neighbors within explicit node/edge budgets while recording relevance, budget, stale, unsupported, or incomplete-index omissions;
- seeds ownership at planning leaves and symbol boundaries, merges small same-file or strongly coupled siblings, preserves cross-package ownership, and creates parent integration units;
- classifies relationships as ordering, coordination, read-context, write-conflict, or informational evidence with persisted reasons;
- serializes overlapping or unknown same-file write scopes, collapses dependency SCCs when budgets permit, and otherwise inserts a coordinated integration unit;
- computes acyclic layers, bounded one-hop read halos, deterministic cut-edge contracts, and policy/user-approved ignored-edge reasons; and
- emits stable work-unit IDs, a canonical input hash, routing features, token estimates, and validation diagnostics.

Every preview is rejected unless all target nodes have exactly one owner, every cut edge has a contract or approved ignored reason, dependency layers are acyclic, write-conflicting units are separated, workspace paths are safe, and per-unit token estimates reconcile with the workflow total.

### Preview rollout and persistence

With `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS=true`, `POST /api/coding-workflows/preview` now persists and returns `ma2-partition-v1` topology output while retaining legacy-compatible workflow items as API anchors. Normalized ownership, dependencies, edge roles, contracts, routing decisions, revisions, diagnostics, omissions, SCC resolutions, and ignored-edge reasons survive database reopen. The migration also adds `coding_workflow_items.work_unit_title` so a topology work unit does not inherit the display name of its compatibility anchor.

Started workflows intentionally remain on the MA-1 derivation bridge and legacy hierarchy/conflict-group scheduler. MA-2 is preview-only: it does not invoke providers, shadow-call paid models, change proposal application, or claim execution speedup. Opt-in work-unit execution begins in MA-4 after MA-3 provides isolated contexts.

### Benchmark delta

The reproducible [MA-2 partitioning report](../research/parallel-multiscale-agent-ma2-partitioning.md) compares the same six fixtures with the preserved MA-0 round-robin implementation. The deterministic heuristic co-locates 4 of 6 relationship edges versus 0 of 6 for the legacy fixture assignment, a 66.7 percentage-point locality improvement. Both remaining cut edges have interface contracts; all fixture targets have one owner, all boundary edges are covered, all workflow DAGs are acyclic, and repeated outputs are byte-for-byte equal.

### Rollback and remaining legacy usage

Disable `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS` to return previews to the legacy shape and behavior. Persisted additive columns and normalized rows remain inert and recoverable; rollback does not drop data. Started workflow dispatch, legacy coding/review prompts, conflict groups, provider invocation, manual layer application, and round-robin planning instrumentation remain unchanged until their later milestones.

## MA-3 isolated context compiler

MA-3 introduces the typed `WorkUnitContext` boundary under `packages/agent-runtime/src/context/`. The compiler accepts only one validated work unit, its explicitly scoped nodes/edges/contracts, observed revision evidence, and workspace-relative source/execution readers. It has no full-project `readGraph` input.

Each capsule contains:

- task/objective, scale, exact base/observed revisions, index state, and visible stale warnings;
- owned nodes and immutable allowed-write scopes;
- exact owned source ranges or required unavailable/stale/unsupported omissions;
- read-only halo/test excerpts selected by scale and budget;
- graph nodes/edges with roles and selection reasons;
- incoming/outgoing contracts and accepted upstream summaries;
- execution/test metadata, scale-appropriate architecture summary, omissions, structured output requirements, and provenance; and
- reconciled source, graph, contract, dependency, other, rendering-overhead, and total token estimates.

Budget admission preserves write constraints/revision warnings, owned source, contracts, upstream outputs, tests, relationships, halo excerpts, and summaries in that order. If required owned source cannot fit, compilation throws an escalation error instead of truncating it. Final Zod validation independently rejects file/node/edge/category/total overruns.

Generic, OpenAI, Anthropic, and Google renderers serialize the same validated capsule and enforce the effective input budget. `validateActualWriteScopes` rejects any structured proposal scope outside planned ownership; small-tier boundary violations explicitly require escalation.

### Bounded retrieval and shadow mode

A follow-up retrieval must name the missing fact, reason, node/path/range, intent, and remaining budget. The scoped server service may add those node IDs as read-only halo evidence without listing the project graph. A write-intent range outside current ownership is rejected and requires a new or escalated work unit.

With both `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS=true` and `GRAPHCODE_WORK_UNIT_CONTEXT=true`, the context-preview endpoint compiles and renders a stored preview work unit. `includeLegacyShadow` is false by default; when explicitly enabled it builds legacy coding/review prompts only for token/character comparison and never invokes a provider. Context diagnostics, omissions, provenance, and shadow metrics persist on the workflow item, while exact source bodies remain transient.

MA-3 by itself remains preview/shadow-only. MA-4 consumes the compiler only when the partition, context, and model-router flags are enabled together. Rollback is to disable `GRAPHCODE_WORK_UNIT_CONTEXT`; partition preview remains independently available.

The reproducible [MA-3 shadow report](../research/parallel-multiscale-agent-ma3-context-shadow.md) verifies isolation, owned-source visibility, and budgets across 18 fixture work units. It also records that the typed capsules currently use more tokens than the tiny same-tier legacy fixture prompts. That overhead is an explicit calibration result and remains an optimization/evaluation requirement for MA-7.

## MA-4 deterministic router and dynamic scheduler

MA-4 extends each routing decision with an optional provider/model assignment and observed execution metrics while keeping old decisions readable. The deterministic router recommends `small` only for leaf-local, range- or symbol-bounded work with low boundary load, complete index evidence, relevant validation, low ambiguity, and no high-risk concern. Cross-package/repository blast radius, public contracts, shared state, incomplete evidence, high boundary load, security, migration, concurrency, or broad/ambiguous work select `large`; all remaining work selects `medium`. Configured price fields produce cost estimates, while absent pricing remains visibly `null`.

Explicit user/policy overrides take precedence over partition estimates and are never silently replaced. Partition grouping records the override, router recomputation retains it, the selected tier determines provider/model assignment and context budget, and normalized SQLite assignment/metrics columns survive reopen.

`workflow-scheduler.ts` dispatches the work-unit DAG dynamically under global, provider, and model concurrency limits. Required dependencies must be accepted or waived, revisions and index policy must pass, and overlapping write ranges remain locked. Mutually declared proposal-only coordination is the sole overlap exception. Transient provider failures retry within a bound; context/validation failures may escalate tier; stale revisions, contract conflicts, permanent failures, pause/resume, and cancellation remain explicit terminal/control states. Completed proposals and diagnostics are preserved.

With `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS`, `GRAPHCODE_WORK_UNIT_CONTEXT`, and `GRAPHCODE_MODEL_ROUTER_V2` enabled together, workflow start uses the topology partition, bounded compiler, configured tier provider/model, and dynamic scheduler. The work-unit runner has no full-project graph read, rejects direct-edit CLI modes, validates unified-diff hunk scopes, and stores proposals behind the existing layer-apply boundary. Disable only the router flag to return started workflows to the compatibility scheduler without removing partition/context previews.

The [MA-4 router and scheduler report](../research/parallel-multiscale-agent-ma4-scheduler-router.md) records the deterministic fake-provider acceptance evidence, including `ceil(N/concurrency)` waves, dependency and conflict exclusion, tier assignment, retries/escalation, pause/cancellation, revision staleness, API execution, and durable overrides.

## MA-5 contract reconciliation and integration gate

MA-5 makes the layer-apply boundary deterministic when `GRAPHCODE_INTEGRATION_GATE=true` is enabled with graph-partitioned workflows. Every required proposal is parsed again at apply time. The gate derives edit/create/delete/rename write sets from unified-diff headers and hunks, rejects unsafe paths and writes outside planned scopes, compares current SHA-1 source hashes with each pinned work-unit revision, and detects overlapping hunks or file-operation conflicts across proposals.

Interface-contract updates travel in the typed work-unit proposal envelope. Signature/schema/protocol snapshots compare normalized values and fingerprints with the persisted baseline. Unknown contracts, non-endpoint updates, invalid graph-edge evidence, and divergent endpoint proposals fail deterministically. A producer may persist a proposed breaking contract while its downstream consumer remains blocked; the contract becomes accepted only when the consumer acknowledges the same snapshot. Failed required contracts or checks prevent workflow success.

Compatible proposals are sorted and combined without a model call. The server copies the workspace to a temporary directory, excludes repository/runtime output, links the existing dependency installation when available, applies the combined patch there, and runs available format/lint/typecheck/build/test scripts plus block-specific setup/test commands. Only the existing human apply action can then apply the already checked patch to the real workspace under the same-workspace revision lock. Integration check diagnostics, actual scopes, proposal revisions, contract state, and command output persist in SQLite and are returned with the workflow.

When deterministic reconciliation cannot resolve a conflict, a medium/large integration agent may produce a bounded reconciliation proposal. Its capsule contains only child objectives/outputs/diffs, affected contracts, failed diagnostics, selected exact source, and parent authority. It has no full-graph field, cannot use direct-edit CLI modes, and cannot make the failed layer applicable by itself; revised proposals must pass the deterministic gate again.

The [MA-5 integration-gate report](../research/parallel-multiscale-agent-ma5-integration-gate.md) records parser, authorization, stale/overlap, contract, temporary-patch, persistence, bounded-fallback, and end-to-end workspace-mutation evidence.

## MA-6 workflow UI and control surface

MA-6 turns persisted orchestration metadata into an inspectable control surface. The workflow panel exposes each unit's objective, owner and halo nodes, write authority, dependency blockers, routing reasons, provider/model assignment, estimates, actual metrics, contracts, and integration diagnostics. The canvas adds stable partition colors, owned/read-halo treatments, a legend, and contract-state edges without changing graph ownership.

Preview controls include model overrides, concurrency and cost limits, keep-together merge/move constraints, split constraints, and ignored-edge approvals. Any change dirties the preview and disables Start until the server returns a newly validated partition. The selected controls persist in the orchestration payload and are the inputs used by the scheduler.

Started workflows execute in the background and the client polls stored progress. Pause/resume, retry, escalation, skip, and cancellation are explicit controls; cancellation is persisted as `cancelled`, preserving completed proposals rather than misreporting user intent as failure. The panel renders only 25 units per page and uses content visibility for bounded large-workflow rendering, with labelled keyboard-reachable controls and live progress semantics.

The human mutation boundary is intentionally split: `Integrate` validates and persists evidence without touching the workspace, while `Apply layer` reruns the integration gate under the workspace revision lock before mutation. The [MA-6 report](../research/parallel-multiscale-agent-ma6-workflow-ui.md) maps these behaviors to acceptance tests and package/build evidence.

## MA-7 evaluation, default-on rollout, and legacy boundary

MA-7 enables partitioning, bounded contexts, deterministic routing, edge contracts, and the integration gate when their environment variables are unset. Explicit false values remain the reversible compatibility switch. The complete rollback contract, including database and cancellation downgrade cautions, is documented in [Parallel Multi-Scale Agent Rollback and Compatibility](parallel-multiscale-agent-rollback-compatibility.md).

Production planning no longer dispatches round-robin graph chunks. Standalone coding and review contexts now use the selected node's bounded parent/current canvas instead of loading the project graph. Default workflow start therefore reaches the topology scheduler and bounded compiler; the compatibility scheduler remains reachable only through explicit rollback flags. The round-robin and legacy prompt builders remain research-only so the baseline and ablations stay reproducible.

The provider-free MA-7 runner evaluates all six planned conditions and publishes timing, queue/call latency, input/output tokens, successful and attempted cost, routing/escalation, patch/test success, conflicts, localization, sufficiency, retrieval, override/rejection, and integration-repair metrics. The [MA-7 report](../research/parallel-multiscale-agent-ma7-evaluation.md) records the calibrated thresholds and release-candidate observation. Speed, small-tier routing, cost, quality, and conflict targets pass; the tiny-corpus input-token target remains an explicit failed result.

## Milestone boundary

The remaining implementation stays split into independently verifiable milestones:

1. MA-0 establishes the preserved behavioral and measurement baseline.
2. MA-1 adds the shared schemas, additive migration, validated persistence, and opt-in legacy-derived preview bridge.
3. MA-2 adds deterministic topology-aware partitioning, edge classification, SCC handling, contracts, and a validated workflow DAG.
4. MA-3 adds isolated, budgeted, provenance-carrying context compilation and write-scope validation.
5. MA-4 adds explainable model routing and dependency/conflict/provider-aware scheduling.
6. MA-5 adds actual write-set validation, contract reconciliation, combined-patch checks, targeted tests, and bounded integration fallback.
7. MA-6 adds the partition, contract, wave, routing, cost, progress, override, and blocker controls to the UI.
8. MA-7 runs the research ablations, observes the default-on path, documents rollback, and removes legacy behavior only after the gates pass.

Large-repository indexing and completeness guarantees, deterministic validation, bounded contexts, persisted reasons, and the review/apply boundary must remain intact throughout the sequence.
