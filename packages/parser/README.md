# Parser

This package extracts a first-pass Code Graph from TypeScript-family repositories.

Current responsibilities:

- Use the TypeScript compiler API for `.ts`, `.tsx`, `.js`, and `.jsx` files.
- Convert directories, files, functions, methods, components, classes, interfaces, types, and enums into stable graph snapshot entities.
- Preserve nested source ownership with `parentSymbolId` for function-local symbols.
- Emit per-function statement-level CFG workflow nodes and labeled `flows` edges for branches, loops, returns, throws, catch/finally paths, and ternary expressions.
- Resolve internal relative imports and lightweight local call edges.
- Preserve deterministic IDs, source paths, and line ranges for generated graph rows.
- Feed the local server's scanner-backed `.graphcode` refresh.

The exported entrypoint is `scanRepositoryCodeGraph(rootPath, options?)`.
