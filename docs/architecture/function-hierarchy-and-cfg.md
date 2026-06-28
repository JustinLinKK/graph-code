# Function Hierarchy and CFG Workflows

GraphCode uses two complementary graph layouts:

- Framework hierarchy for ownership and source containment.
- Information workflow for data and control flow inside a selected domain block.

## Hierarchy

Repository scans build containment from broad to narrow:

1. Repository framework
2. Generated `Code Graph` module
3. Directory modules
4. File modules
5. Top-level functions and objects
6. Nested functions and objects inside a function body

Function and object blocks may be owned by a file module or by another function. Branches, statements, parameters, returns, and throws are not hierarchy children; they are attached workflow blocks.

## Function Workflows

Every function canvas is a strict information-flow view. Parameter `input` blocks flow into the function entry process. The entry then flows through generated CFG `process` blocks and terminates at return or throw `output` blocks.

Generated CFG process blocks use stable source-derived IDs:

- `${symbolId}-process` for function entry
- `${symbolId}-condition-${hash(startLine:conditionText)}` for branch and loop conditions
- `${symbolId}-stmt-${hash(startLine:endLine:statementText)}` for linear statements
- `${symbolId}-return-${hash(startLine:returnText)}` for return paths
- `${symbolId}-throw-${hash(startLine:throwText)}` for throw paths

Branch semantics live on `flows` edges. Edge labels describe the scenario, such as `if value > 0`, `else`, `case "x"`, `default`, `loop`, `exit loop`, `catch error`, `finally`, `return`, and `throw`.

## Refresh Contract

Scanner-generated rows use `code-*` IDs and are safe to delete and rebuild. Curated/manual rows that do not use generated prefixes are preserved. The seed and scanning routes should rebuild generated state through the repository refresh transaction rather than patching `.graphcode/graphcode.sqlite` row by row.
