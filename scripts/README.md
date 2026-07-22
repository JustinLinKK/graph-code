# Scripts

The scalability benchmark is exposed from the repository root:

```bash
pnpm benchmark:scalability -- --profile 500 --format both
```

It generates temporary 500, 5,000, 25,000, or 100,000-file repositories outside normal builds and reports stable JSON plus a human-readable table. See [`docs/research/scalability-baseline.md`](../docs/research/scalability-baseline.md) for profiles, WSL setup, and the captured baseline.

The parallel multi-scale agent MA-0 baseline is also exposed from the root:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-orchestration -- --delay-ms 25 --format both
```

It measures the preserved legacy planning locality, workflow layers/conflict groups, context sizes, tier reasons, and deterministic fake-provider serial/parallel timing. See [`docs/research/parallel-multiscale-agent-ma0-baseline.md`](../docs/research/parallel-multiscale-agent-ma0-baseline.md).

The MA-2 deterministic topology comparison is exposed separately:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-partitioning -- --format both
```

It compares fixture relationship locality, reports cut-edge contract/ignore coverage, and validates unique ownership, acyclic dependencies, and repeatable output without invoking a provider. See [`docs/research/parallel-multiscale-agent-ma2-partitioning.md`](../docs/research/parallel-multiscale-agent-ma2-partitioning.md).

The MA-3 isolated-context shadow comparison is also provider-free:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-context -- --format both
```

It measures typed capsule size against same-tier legacy coding/review prompts and verifies owned-source visibility, budget compliance, and absence of full-project compiler reads. See [`docs/research/parallel-multiscale-agent-ma3-context-shadow.md`](../docs/research/parallel-multiscale-agent-ma3-context-shadow.md).

The MA-7 provider-free ablation and calibration runner covers all six planned conditions:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-ablations -- --delay-ms 5 --format both
```

It reports deterministic and observed timing, token/cost/quality/integration metrics, partition and routing threshold grids, and the default-on zero-legacy-call release-candidate observation. See [`docs/research/parallel-multiscale-agent-ma7-evaluation.md`](../docs/research/parallel-multiscale-agent-ma7-evaluation.md).

This directory will hold developer automation once implementation begins.

Possible scripts:

- Repository indexing smoke tests.
- Fixture refresh helpers.
- Demo workflow runners.
- Local check wrappers.
- Release or packaging helpers.

The benchmark entry points currently provide the repository's developer automation.
