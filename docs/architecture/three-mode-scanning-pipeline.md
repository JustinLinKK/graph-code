# Three-Mode Scanning Pipeline

GraphCode scanning is an LLM-led generated graph pipeline with three modes: `local`, `medium`, and `global`. The fake provider remains deterministic by adapting parser output into the same structured scan JSON used by real providers.

## Initial Scan

1. Inventory scannable files with the server allowlist, using git when available and a walk fallback otherwise.
2. Hash file content and run `local` scanners in parallel for every file. Local output owns file nodes, function/class/object/code-block nodes, workflow input/process/output/format blocks, and intra-file edges with exact source ranges.
3. Run `medium` scanners per affected directory/package. Medium output owns directory/module grouping, exported surfaces, summaries, and intra-directory dependency candidates.
4. Run exactly one `global` scanner over compact repository inventory plus medium and changed-local summaries. Global output owns repository/subsystem modules and cross-directory/function/module wiring.
5. Merge atomically by replacing generated scan rows, persisting file hashes in `scan_file_state`, and bumping graph revisions.

## Incremental Scan

1. Recompute content hashes and compare them with `scan_file_state` to classify added, modified, unchanged, and deleted files.
2. Delete generated nodes for deleted or changed files and generated edges whose source evidence or endpoint nodes touch those files. Manual graph rows are preserved.
3. Run `local` scanners only for added and modified files.
4. Run `medium` scanners only for affected directories plus the repository root scope.
5. Run one `global` scanner with compact unchanged graph summaries, changed local outputs, and medium outputs.
6. Merge the result atomically and replace `scan_file_state` with the current inventory.

## Evidence And Identity

Scanner providers emit structured JSON, but the runtime never trusts provider IDs directly. Stable graph IDs are normalized from source keys such as path, symbol name, start line, and relationship kind.

Every source-backed node and edge should include `source.path`, `source.startLine`, and `source.endLine`. The runtime rejects inverted ranges and the server validates ranges against numbered file content before persistence. Edges without exact proof should leave source lines null rather than guessing.

Generated scan rows use `code-*` or `scan-*` IDs and remain rebuildable. Curated/manual graph rows are outside the generated cleanup set.
