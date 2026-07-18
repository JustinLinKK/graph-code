# Parallel Multi-Scale Agent MA-2 Partitioning Benchmark

This report measures the deterministic graph partitioner against the preserved MA-0 round-robin assignment on the same six repository fixtures. It compiles partition structure and validation evidence only: no provider or paid-model call is made, and no production workflow is dispatched.

## Reproduce

From the repository root:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-partitioning -- --format both
```

Use `--format json` for machine-readable output or `--output <path>` to persist the JSON result. `TMPDIR`, `TEMP`, and `TMP` avoid mounted-filesystem IPC limitations under `/mnt/c` in WSL. Fixture topology and validation results are deterministic; only the report timestamp and machine metadata vary.

## Captured result

Captured on 2026-07-18 America/Los_Angeles, Linux x64, Node v24.15.0, 32 logical CPUs:

| Measure | Legacy round-robin | MA-2 topology |
|---|---:|---:|
| Fixtures | 6 | 6 |
| Relationship edges | 6 | 6 |
| Co-located/internal relationship edges | 0 | 4 |
| Relationship locality | 0.0% | 66.7% |
| Locality delta | — | +66.7 percentage points |
| Boundary edges | — | 2 |
| Interface contracts | — | 2 |
| Policy/user ignored edges | — | 0 |

Validation across every fixture:

| Invariant | Result |
|---|---:|
| Every target has exactly one owner | pass |
| Every boundary edge has a contract or approved ignored reason | pass |
| Dependency graph is acyclic after SCC handling | pass |
| Repeated output is byte-for-byte deterministic | pass |

The same-file, shared-interface, cycle, and parent-integration relationships remain internal after bounded same-file/high-coupling merging. The two cross-package relationships stay cut and receive explicit interface contracts instead of being merged merely to improve the score.

## Interpretation and limits

The improvement is evidence that the deterministic heuristic retains related fixture nodes more often than the preserved array-order baseline. It is not evidence of production makespan, patch quality, model quality, or integration success. MA-2 remains preview-only, and the six fixtures are regression cases rather than a representative workload distribution.

The benchmark records omissions rather than treating excluded graph regions as successful localization. Later MA-7 evaluation must run the larger ablation corpus and compare task success, tokens, cost, conflicts, contract reconciliation, and end-to-end wall time before default-on rollout or legacy removal.
