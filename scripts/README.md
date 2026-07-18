# Scripts

The scalability benchmark is exposed from the repository root:

```bash
pnpm benchmark:scalability -- --profile 500 --format both
```

It generates temporary 500, 5,000, 25,000, or 100,000-file repositories outside normal builds and reports stable JSON plus a human-readable table. See [`docs/research/scalability-baseline.md`](../docs/research/scalability-baseline.md) for profiles, WSL setup, and the captured baseline.

This directory will hold developer automation once implementation begins.

Possible scripts:

- Repository indexing smoke tests.
- Fixture refresh helpers.
- Demo workflow runners.
- Local check wrappers.
- Release or packaging helpers.

No automation scripts have been added yet.
