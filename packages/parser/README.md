# Parser

This package extracts a first-pass Code Graph from mixed-language repositories.

Current responsibilities:

- Use the TypeScript compiler API for deep `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs` extraction.
- Use a lightweight structural parser for Python, Java, Go, Rust, C, C++, C#, Kotlin, Swift, Ruby, PHP, SQL, and shell scripts.
- Convert directories, files, functions, methods, components, classes, interfaces, types, enums, and common structural objects into stable graph snapshot entities.
- Preserve nested source ownership with `parentSymbolId` where the parser can infer class/object membership.
- Emit per-function statement-level CFG workflow nodes and labeled `flows` edges for TypeScript-family branches, loops, returns, throws, catch/finally paths, and ternary expressions.
- Emit entry workflow nodes for non-TypeScript functions so downstream graph rendering still has a function canvas anchor.
- Resolve internal relative imports/includes/modules and lightweight local call edges.
- Preserve deterministic IDs, source paths, and line ranges for generated graph rows.
- Feed the local server's scanner-backed `.graphcode` refresh.

The exported entrypoint is `scanRepositoryCodeGraph(rootPath, options?)`.
