# Graph Query

This package owns deterministic, package-neutral graph query and partitioning algorithms. It receives an explicitly scoped task graph; it does not read SQLite, the filesystem, provider settings, or the complete repository by itself.

MA-2 begins under `src/partitioning/` with validated task-subgraph inputs, bounded expansion, explainable edge policy, deterministic work-unit formation, SCC handling, cut-edge contracts or approved ignore reasons, one-hop halos, DAG layers, and reproducible diagnostics.
