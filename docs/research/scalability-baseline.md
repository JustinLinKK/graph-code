# Scalability benchmark baseline

This document records the PR 0/PR 1 baseline for the scalability refactor. The benchmark is diagnostic: ordinary builds and tests do not generate its synthetic repositories.

## Reproducible corpus

`pnpm benchmark:scalability` generates deterministic TypeScript workspaces with 500, 5,000, 25,000, or 100,000 source files. Files are distributed across directories in groups of 100 and form a simple import chain. Each run measures:

- repository generation, discovery, parse, link, persistence, hierarchy, canvas, and agent-context construction time;
- discovered, supported, indexed, unsupported, excluded, failed, and silently omitted files;
- hierarchy and canvas JSON payload bytes;
- planning-context characters and graph rows;
- peak process RSS and SQLite size.

Run a quick profile:

```bash
pnpm benchmark:scalability -- --profile 500 --format both
```

Run selected profiles and save stable schema-versioned JSON:

```bash
pnpm benchmark:scalability -- --profile 500,5000 --format json --output .graphcode/scalability-baseline.json
```

Run all profiles only on a controlled benchmark machine:

```bash
pnpm benchmark:scalability -- --profile all --format json --output .graphcode/scalability-baseline.json
```

On WSL checkouts mounted under `/mnt/c`, place `tsx` IPC files on the Linux filesystem:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:scalability -- --profile 500 --format both
```

## Reference machine

Baseline captured 2026-07-17 with:

- WSL2 Linux `6.6.87.2-microsoft-standard-WSL2+`, x64;
- AMD Ryzen 9 9950X3D, 32 logical CPUs;
- 49,228,369,920 bytes reported memory;
- Node.js `v24.15.0`;
- repository checkout on `/mnt/c`, benchmark fixtures and SQLite databases under `/tmp`.

## Captured baseline

| Profile | Indexed | Silent omissions | Parse | Persist | Hierarchy | Canvas | Hierarchy JSON | Context characters | Peak RSS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 500 files | 500 | 0 | 36.4 ms | 137.7 ms | 4.4 ms | 89.2 ms | 471,103 B | 101,952 | 392.9 MiB |
| 5,000 files | 5,000 | 0 | 173.5 ms | 2,005.2 ms | 35.8 ms | 208.9 ms | 4,689,091 B | 1,018,559 | 746.5 MiB |

These measurements expose the intended baseline problems: hierarchy payload and legacy planning context grow with the complete repository even though the root canvas payload remains small. Later PRs must compare against the same JSON fields before changing storage, projections, or agent retrieval.

## File-limit policy

GraphCode has no default file-count cap. The parser retains `maxFiles` only as an explicit caller-controlled diagnostic policy. When supplied, it must return `partial` completeness with discovered/indexed counts and a reason; it can never look complete. The server and scanning inventory do not set this option.

A partial, stale, failed, or in-progress state is included in agent prompts with an explicit instruction not to claim repository-wide coverage. The web app displays the same state persistently. This is the safety policy until incremental indexing and revision persistence land in later phases.

## Interpreting results

- `silentlyOmitted` must remain zero. Explicitly unsupported, excluded, or failed files are separate visible counts.
- Timings are wall-clock diagnostics, not CI pass/fail gates on uncontrolled runners.
- `peakRssBytes` is a sampled process value, so use repeated controlled runs for comparisons.
- HTTP payload bytes are measured from the same JSON serialization returned by hierarchy and canvas repository calls; transport headers and compression are not included.
- Benchmark fixtures are removed after each run unless `--keep-fixtures` is passed.
