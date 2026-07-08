# Polyglot Service Example

This tiny repository is a parser and scanning demo for mixed-language projects.

It contains:

- `src/service.py`: Python orchestration code.
- `src/native/math.hpp` and `src/native/math.cpp`: C++ implementation files.
- `src/worker.go`: Go worker code.

Useful local smoke command from the GraphCode repo root:

```bash
pnpm --filter @graphcode/parser test
```
