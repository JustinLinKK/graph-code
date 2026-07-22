# Parallel Multi-Scale Agent Fixtures

These fixtures freeze the legacy orchestration behaviors required by MA-0 of the parallel multi-scale agent refactor:

- `independent-leaves.json`: unrelated leaf units for serial/parallel makespan measurements;
- `shared-interface.json`: a producer-consumer relationship that hierarchy-only layering does not order;
- `same-file-functions.json`: two functions that share a file but receive distinct legacy conflict groups;
- `cycle.json`: a strongly connected call component for later SCC partitioning;
- `cross-package.json`: an architectural cut across package ownership;
- `parent-integration.json`: leaf proposals followed by parent-scale integration.

The files are behavioral inputs, not the future MA-1 work-unit schema. They are validated by `legacyWorkflowFixtureSchema` and remain available as the common corpus for later partitioning, scheduler, routing, context, and integration ablations.
