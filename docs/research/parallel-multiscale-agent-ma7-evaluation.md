# MA-7 Research Evaluation and Legacy Removal

Status: complete; release-candidate observation and acceptance gates captured on 2026-07-18.

MA-7 evaluates the same six-task corpus under every condition required by the refactor plan, calibrates partition/routing thresholds, enables the complete workflow stack by default, removes production round-robin planning and default coding/review full-graph reads, and retains the legacy implementation only as an explicit research/rollback baseline.

The machine-readable report is [parallel-multiscale-agent-ma7-ablations.json](data/parallel-multiscale-agent-ma7-ablations.json). The runner invokes no paid or network provider.

## Reproduction

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-ablations -- \
  --delay-ms 5 \
  --format both \
  --output /absolute/path/to/graph-code/docs/research/data/parallel-multiscale-agent-ma7-ablations.json
```

Costs use fixed normalized research prices for cross-condition comparison. They are not current provider quotes. Successful-task cost and total attempted cost are both published; the latter includes rejected/conflicting work and deterministic repair cost.

## Ablation results

| Condition | Critical path | Input / output tokens | Total attempted cost | Patch / test pass | Conflicts | Recall@K |
|---|---:|---:|---:|---:|---:|---:|
| 1. Serial, large, full graph | 90 ms | 21,480 / 43,200 | $0.971400 | 100% / 100% | 0 | 100% |
| 2. Parallel, large, round-robin | 30 ms | 28,640 / 57,600 | $1.527200 | 66.7% / 66.7% | 8 | 0% |
| 3. Parallel, large, topology | 65 ms | 37,065 / 43,200 | $1.107325 | 88.9% / 88.9% | 2 | 66.7% |
| 4. Topology plus multi-scale | 65 ms | 37,065 / 15,600 | $0.121792 | 88.9% / 88.9% | 2 | 66.7% |
| 5. Multi-scale plus contracts | 65 ms | 37,065 / 15,600 | $0.063792 | 100% / 100% | 0 | 66.7% |
| 6. Condition 5 plus graph query | 65 ms | 40,031 / 15,600 | $0.065439 | 100% / 100% | 0 | 100% |

The JSON additionally publishes observed wall time, provider queue/call latency, peak concurrency, routing distribution, escalation rate, context sufficiency, follow-up retrievals, human overrides, rejected proposals, merge/contract conflict rates, integration-agent calls, and repair cost for every condition.

## Research-target outcome

- The independent-leaves fixture falls from five serial waves to two bounded-concurrency waves: a 60% deterministic makespan reduction, above the 40% target.
- Four of five clearly leaf-local independent units select the small tier: 80%, above the 60% target.
- Condition 5 retains the fake provider's 100% patch/test success and removes all eight round-robin overlap/contract conflicts.
- Condition 5 normalized attempted cost is $0.063792 versus $0.971400 for the all-large baseline, a 93.4% reduction.
- The input-token target does **not** pass. Condition 5 uses 37,065 tokens versus 21,480 for the tiny all-large legacy corpus, a 72.6% increase. Compact provider rendering reduced the earlier isolated result from 44,990 tokens, but exact source, revisions, authority, contracts, omissions, and provenance still dominate these tiny prompts. The plan identifies targets as research goals rather than hard product promises, so this result remains visible instead of dropping required evidence.

## Threshold calibration

The partition grid evaluates nine combinations of `smallMergeTokenLimit` (4k/8k/12k) and `highCouplingWeight` (1/2/3), rejecting any candidate that loses boundary coverage or acyclicity. The selected policy remains:

```text
smallMergeTokenLimit = 8000
highCouplingWeight = 2
```

The routing grid evaluates 27 combinations of maximum small-tier cut edges, broad-source threshold, and minimum planning confidence. Candidates prioritize zero unsafe-small choices, at least 60% clearly-leaf recall, then accuracy. The selected production thresholds remain:

```text
smallMaximumCutEdges = 2
broadSourceTokens = 12000
smallMinimumPlanningConfidence = 0.7
```

## Default-on observation and legacy audit

`ma7-default-on-candidate-1` observes six deterministic workflows with the partition, context, router, contract, and integration flags all enabled. It records zero paid calls and zero default calls to round-robin planning, the compatibility workflow scheduler, full-project coding contexts, or full-project review contexts. Ownership, boundary coverage, dependency acyclicity, and context bounds all pass.

This is a repository release-candidate observation, not external production telemetry. That limitation is encoded in the report. The preserved legacy builders remain callable only by baseline tests/benchmarks or explicit context shadow comparison, so future releases can reproduce the delta.

## Compatibility and rollback

The [rollback and compatibility contract](../architecture/parallel-multiscale-agent-rollback-compatibility.md) documents default values, partial and complete flag rollback, database/binary compatibility, cancellation downgrade cautions, provider authority, triggers, and verification commands. It intentionally recommends flag rollback over destructive data removal.

## Verification

The completed release-candidate gate produced these results:

- graph-model: 20 tests passed;
- graph-query: 9 tests passed;
- parser: 5 tests passed;
- agent-runtime: 28 tests passed;
- web: 50 tests passed;
- local-server: 109 tests passed across 17 files, including a default-config workflow start with persisted MA-4 routing and scheduler metrics plus explicit same-file, cross-package re-export, and data-shape conflict coverage;
- root `pnpm typecheck`: passed; and
- root `pnpm build`: all package builds reached the final web bundle, with a direct web rebuild confirming 3,572 transformed modules and a successful production bundle. The existing 723.55 kB chunk-size warning is non-fatal.
