# MA-6 Workflow UI and Control Surface

Status: complete on 2026-07-18.

MA-6 exposes the partitioned workflow as an inspectable, bounded, and controllable product surface. It does not weaken the proposal-only provider boundary: starting a workflow runs work units in the background, while integration validation and real workspace application remain separate user actions.

## Implemented surface

The coding-workflow panel now shows:

- stable partition and wave identity, objective, owned nodes, read halo, planned write scopes, dependencies, and current blockers for every unit;
- routing reasons, selected provider/model, estimated and actual tokens, latency, price-aware cost, and explicit `unpriced` values when pricing is unavailable;
- interface-contract baseline/proposed state, ignored-edge reasons and approvals, and persisted integration-check diagnostics;
- current workflow and item progress, including pending, running, proposed, blocked, failed, skipped, applied, and cancelled states;
- model-tier overrides, concurrency and optional cost caps, merge/move constraints, split constraints, and ignored-edge approvals; and
- pause, resume, cancel, retry, escalate, skip, validate-only integration, and apply controls.

The canvas renders deterministic partition colors, owned versus read-halo node treatments, a legend, and contract edges whose style and label expose contract kind and state.

## Validation and mutation boundaries

Changing a model, partition constraint, concurrency limit, cost cap, or ignored-edge approval marks the preview dirty. Start remains disabled until the server produces a newly validated preview. The validated request and returned orchestration payload persist the constraints and execution policy, so a reload does not silently revert them.

Workflow start supports `background: true`; the client polls the stored workflow while it is running. The scheduler applies the validated global concurrency limit and fails closed when a configured cost cap is exceeded or the selected model has no known price.

Cancellation is a first-class workflow and item state in the shared schema and SQLite constraints. The migration rebuilds only the two workflow tables under SQLite legacy-rename semantics, preserves normalized child-table references and existing rows, and passes `foreign_key_check`. Already proposed, applied, or skipped work is retained when the remaining schedule is cancelled.

`Integrate` is validate-only. It persists actual write sets, proposal revisions, contract decisions, and check diagnostics without changing the workspace. `Apply layer` reruns the gate under the revision lock and is the only UI action that can apply the accepted combined patch to the real workspace.

## Bounded rendering and accessibility

The panel renders at most 25 work units per page and uses content visibility for off-screen item details. Pagination bounds the DOM regardless of workflow size. Controls use associated labels or explicit accessible names; progress is announced through a labelled progress element and polite live region. Partition selection, model scale, close, pagination, and execution-limit controls remain keyboard reachable.

## Acceptance evidence

| MA-6 acceptance requirement | Evidence |
|---|---|
| Explain why every unit exists, what it may edit, which model it uses, and what blocks it | Per-unit objective, ownership, halo, write scope, dependencies, routing reasons, provider/model, estimates/actuals, and blocker display in `CodingWorkflowPanel` |
| Large previews remain bounded and paginated/virtualized | `WORKFLOW_PAGE_SIZE = 25`, slice-only rendering, pagination controls, and item `content-visibility` styling |
| Overrides require a newly validated preview | Dirty-preview state disables Start; the application test verifies the revalidation payload and only then starts with `background: true` |

## Verification

The current worktree passed:

```text
pnpm --filter @graphcode/graph-model typecheck     PASS
pnpm --filter @graphcode/local-server typecheck    PASS
pnpm --filter @graphcode/web typecheck             PASS
pnpm typecheck                                     PASS: all workspace packages
pnpm --filter @graphcode/graph-model test          PASS: 20 tests, 2 files
pnpm --filter @graphcode/graph-query test          PASS: 9 tests, 1 file
pnpm --filter @graphcode/agent-runtime test         PASS: 28 tests, 3 files
pnpm --filter @graphcode/local-server test         PASS: 104 tests, 16 files
pnpm --filter @graphcode/web test                  PASS: 50 tests, 3 files
pnpm --filter @graphcode/web exec vite build       PASS: 3,572 modules, 77 seconds
```

The web build reports one non-fatal size warning for the existing 723.55 kB minified application bundle. That warning does not affect the bounded workflow DOM, but bundle splitting remains a separate web-performance follow-up.

## Rollback and MA-7 boundary

Disable `GRAPHCODE_MODEL_ROUTER_V2` to return started workflows to the compatibility scheduler while retaining partition/context previews. Disable `GRAPHCODE_GRAPH_PARTITIONED_WORKFLOWS` to remove the partitioned preview and MA-6 orchestration surface. SQLite additions and cancellation-compatible constraints remain backward-readable and do not need destructive rollback.

MA-6 does not remove the preserved round-robin baseline or legacy full-graph prompt builders. Ablations, threshold calibration, default-on observation evidence, rollback documentation, and any justified legacy deletion belong to MA-7.
