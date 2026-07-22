# Parallel Multi-Scale Agent MA-3 Context Shadow Benchmark

This report compares validated MA-3 work-unit context capsules with the existing coding and review prompt builders on the same six deterministic orchestration fixtures. Shadow mode compiles prompts only. It does not invoke a provider, execute a workflow, or mutate a workspace.

## Reproduce

From the repository root:

```bash
TMPDIR=/tmp TEMP=/tmp TMP=/tmp pnpm benchmark:agent-context -- --format both
```

Use `--format json` for per-fixture/per-unit details or `--output <path>` to persist the JSON result. Mounted WSL checkouts should retain the temporary-directory overrides to avoid `/mnt/c` IPC limitations.

## Captured result

Captured on 2026-07-18 America/Los_Angeles, Linux x64, Node v24.15.0, 32 logical CPUs:

| Measure | Result |
|---|---:|
| Fixtures | 6 |
| MA-3 work units compiled | 18 |
| Isolated context estimated tokens | 44,990 |
| Same-tier legacy coding estimated tokens | 20,314 |
| Same-tier legacy review estimated tokens | 19,378 |
| Isolated change versus legacy coding | 121.5% more tokens |
| Isolated change versus legacy review | 132.2% more tokens |
| Owned source exact or visibly unavailable/stale | 100% |
| Contexts within effective budgets | 100% |
| Full-project graph read used by compiler | no |
| Provider calls | 0 |

Token estimates use the conservative four-characters-per-token fallback because no provider-aware tokenizer is configured for this fixture run.

## Interpretation

MA-3 satisfies its isolation and safety purpose on the fixture corpus: every owned symbol body is present, every context stays bounded, all evidence is role/reason annotated, and compilation does not load the project graph. The result does not yet demonstrate token savings.

The fixture tasks are intentionally tiny, so the typed revision, ownership, contract, omission, provenance, and structured-output envelope costs more than the legacy same-tier prompt. This is a useful calibration finding, not a failed safety invariant. Before MA-7 can claim cost reduction, evaluation must compare representative repository tasks and optimize provider rendering, redundant metadata, summaries, and tokenizer estimates without weakening owned-source, contract, revision, or write-boundary evidence.

The long-term research target remains reduction against an all-large-model/full-graph baseline while preserving patch and test success. This MA-3 result must remain in that later ablation rather than being replaced by a favorable subset.
