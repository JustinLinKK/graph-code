# Parallel Multi-Scale Agent MA-0 Baseline

This report captures the legacy behavior required before the parallel multi-scale agent refactor changes production scheduling. The benchmark uses only repository fixtures, temporary SQLite databases, and a deterministic delayed fake provider. It makes no paid model calls.

## Reproduce

From the repository root:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-orchestration -- --delay-ms 25 --format both
```

`TMPDIR`, `TEMP`, and `TMP` avoid mounted-filesystem IPC limitations when the checkout is under `/mnt/c` in WSL. They are optional on filesystems where `tsx` can create its normal temporary pipe.

Use `--format json` for machine-readable output or `--output <path>` to persist the JSON report. Timing varies with the host; fixture topology, counts, reasons, and outcome gaps are deterministic.

## Captured result

Captured on 2026-07-17 America/Los_Angeles (2026-07-18 UTC), Linux x64, Node v24.15.0, 32 logical CPUs:

| Measure | Result |
|---|---:|
| Fixtures | 6 |
| Legacy planning relationship edges separated from at least one endpoint | 6 of 6 |
| Relationship edges ignored by hierarchy-only layers | 6 |
| Same-file same-layer pairs assigned distinct conflict groups | 2 |
| Small coding context | 5,083 chars / 1,271 estimated tokens |
| Medium coding context | 13,084 chars / 3,271 estimated tokens |
| Large coding context | 21,195 chars / 5,299 estimated tokens |
| Tier recommendations | small 8 / medium 5 / large 9 |
| Serial delayed-provider makespan | 102.3 ms |
| Parallel delayed-provider makespan | 25.4 ms |
| Observed peak concurrency | serial 1 / parallel 4 |
| Observed controlled-fixture speedup | 4.02x |
| Measured independent-workload conflict rate | 0 |
| Fake proposals | 4 succeeded / 0 failed |
| Targeted test result persisted by legacy workflow | not recorded |
| Deterministic integration result persisted by legacy workflow | not recorded; manual layer apply only |
| Estimated monetary cost | unavailable (`null`) |

The serial and parallel cases run four independent leaf units at a configured 25 ms delay. Their theoretical wave counts are four and one respectively. Tests assert structural timing bounds and concurrency rather than the captured millisecond values.

## Fixture observations

| Fixture | Legacy behavior frozen by MA-0 |
|---|---|
| `independent-leaves` | Four ready leaves support the deterministic serial/parallel comparison |
| `shared-interface` | Its producer-consumer edge is separated by round-robin chunks and does not order the hierarchy layer |
| `same-file-functions` | Two functions in one file can run in the same layer under distinct conflict groups |
| `cycle` | Two reciprocal call edges remain same-layer and expose the SCC case required by MA-2 |
| `cross-package` | Two cross-package relationships are separated and treated as tier-risk evidence, not workflow dependencies |
| `parent-integration` | Leaves precede the parent item, while their relationship still does not determine leaf ordering |

Across the six fixtures, every relationship edge is orphaned from at least one endpoint by the legacy four-way round-robin planning chunks, for an endpoint co-location ratio of zero on each relationship-bearing fixture. This is a fixture-corpus observation, not a claim about all repository graphs.

## Interpretation and limits

MA-0 establishes the comparison point; it does not present the fake-provider speedup as proof of safe production parallelism. The same baseline also demonstrates why later milestones are necessary: relationship edges do not currently create workflow dependencies, and source-file overlap is not a conservative conflict lock.

The legacy workflow does not persist actual per-item provider token usage, configured price snapshots, targeted test outcomes, or a deterministic combined-patch integration verdict. The benchmark therefore uses an explicit four-characters-per-token estimate and reports monetary cost, tests, and integration as unavailable instead of treating missing evidence as success.

Production scheduling, routing, context compilation, proposal review, and application semantics are unchanged in MA-0. The benchmark fixtures and legacy algorithm copy must remain available for the MA-2 through MA-7 comparisons.
