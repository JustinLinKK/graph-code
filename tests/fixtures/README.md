# Test Fixtures

This directory holds tiny repositories used by parser, graph-model, indexer, and agent-runtime tests.

Fixtures should be small enough to understand at a glance and focused enough to exercise one behavior at a time, such as imports, function calls, class ownership, test ownership, or dependency impact.

- [common-languages](common-languages): Python, C++, Go, Rust, and Java source files used to verify broad structural parser coverage.
- [parallel-multiscale-agent](parallel-multiscale-agent): orchestration fixtures for independent leaves, shared interfaces, same-file work, cycles, cross-package changes, and parent integration.
