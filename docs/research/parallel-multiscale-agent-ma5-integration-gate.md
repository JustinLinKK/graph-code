# MA-5 Contract Reconciliation and Integration Gate Evidence

## Scope

MA-5 replaces the unchecked layer-apply transition with a feature-flagged deterministic preflight, isolated combined-patch validation, and bounded integration fallback. The default remains off. No paid provider is invoked by the acceptance suite; fallback behavior uses a spy or the deterministic fake provider.

## Deterministic preflight

The focused service suite verifies:

| Gate | Evidence |
|---|---|
| Diff parsing | edit, create, delete, rename, multiple files, and hunk ranges derive typed actual scopes |
| Workspace containment | absolute, parent-traversal, malformed, and unauthorized paths cannot become applicable |
| Revision safety | each touched existing file must match the work unit's pinned SHA-1; create destinations must remain absent |
| Conflict safety | overlapping edit hunks and create/delete/rename path intersections fail before combination |
| Contract evidence | contract IDs, endpoint authority, graph-edge endpoints, normalized values, and fingerprints are checked |
| Cross-layer change | producer proposal may pass while its consumer remains explicitly blocked until matching acknowledgement |
| Deterministic combination | clean independent proposals combine in stable work-unit order with zero integration-agent calls |
| Required outcomes | missing/failed required proposals, contracts, combined patches, or commands prevent applicability/success |

## Temporary validation and real apply

The isolated validator copies the workspace to a temporary directory, omits `.git`, `.graphcode`, dependencies, build output, and coverage, and links the existing root dependency installation when present. It applies the combined diff there and runs discovered root format/lint/typecheck/build/test scripts plus block-specific setup/test commands. Each command has a hard timeout and bounded captured output.

The real workspace is unchanged on any failed gate. After the user calls the existing layer-apply endpoint, a successful gate revalidates the workspace revision under `WorkspaceRevisionApplyLock`, checks the patch with `git apply --check`, applies it, advances item/layer state, refreshes pinned source hashes, and preserves integration evidence.

## Contract and fallback behavior

Providers append optional typed contract metadata after `GRAPHCODE_WORK_UNIT_METADATA_JSON`. Exact baseline snapshots remain deterministic; the model is not asked to judge compatibility. Matching producer/consumer values are accepted, divergent values conflict, and one-sided breaking values block the consumer with both endpoint IDs in diagnostics.

The integration agent runs only when deterministic preflight fails. Its typed context contains bounded child objectives, summaries/diffs, relevant contracts, failures, selected source, and parent reconciliation authority. It contains no complete graph/repository field and cannot edit or override a failed gate. Its response is persisted as diagnostic evidence; revised proposals must re-enter preflight.

## Persistence and compatibility

SQLite persists actual write scopes, proposal revision, typed work-unit proposal metadata, contract status/proposed snapshots, and per-layer integration checks. Reopen tests verify those records. The code-proposal and workflow migrations are additive, legacy rows remain readable, and workflows without the rollout flag retain the prior apply behavior.

## Focused verification

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/agent-runtime exec vitest run src/index.test.ts src/context/compiler.test.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/local-server exec vitest run src/services/contract-reconciler.test.ts src/services/integration-runner.test.ts
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm --filter @graphcode/local-server exec vitest run src/db/repository.work-units.test.ts src/workspace.integration.test.ts
```

Focused MA-5 evidence covers five contract cases, six integration-runner cases, five normalized persistence/migration cases, two real workspace apply/reject cases, and typed agent metadata/bounded work-unit execution.

## Remaining boundary

MA-6 still owns user-facing contract/check diagnostics, retry/escalate/integrate controls, validated overrides, pagination, and virtualization. MA-7 owns ablations, threshold calibration, observation of the default-on path, rollback evidence, and eventual legacy removal. Root validation scripts can be expensive on large repositories; production exposes their output and timeout as gate evidence instead of silently skipping or hanging.
