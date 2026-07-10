# Polyglot Service Example

This example is a compact mixed-language service for GraphCode scanning demos. It includes Python orchestration, a Go worker, a C++ native helper, SQL schema, and YAML configuration.

## What to Scan

Open this directory in GraphCode:

```text
examples/polyglot-service
```

Suggested initialization:

- Project name: `Polyglot Service`
- Project description: `Small mixed-language service for GraphCode scanning demos.`
- Scanning instructions: `Group files by service layer, native helper, worker, database schema, and config. Preserve source ranges and show data-flow relationships.`

## What to Show

- `src/service.py` as the orchestration entrypoint.
- `src/native/math.hpp` and `src/native/math.cpp` as a native helper boundary.
- `src/worker.go` as an asynchronous worker surface.
- `src/db/schema.sql` as persistent data contract.
- `config/pipeline.yaml` as runtime configuration.

## Demo Prompt

```text
Scan this repository and group the graph by orchestration, native scoring, worker formatting, database contract, and runtime configuration.
```

## Screenshot Target

Capture a canvas where Python, Go, C++, SQL, and config nodes are all visible, then select `score_request` or `normalize` so the inspector shows source evidence.
