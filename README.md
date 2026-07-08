# GraphCode

GraphCode is a working title for a graph-native, human-in-the-loop architecture IDE for large multi-file software systems. The goal is to make a repository's structure visible, editable, and reviewable through graph nodes that stay linked to real source code.

The launch name is still open. The research notes in [docs/research/graphcode-assessment.md](docs/research/graphcode-assessment.md) identify existing public uses of Graph-Code or GraphCode, so naming should be revisited before any public release.

## Installation

GraphCode is a local pnpm workspace. The root `package.json` pins `pnpm@10.33.0`; use Node.js with Corepack available so the pinned package manager can be activated consistently. The core workspace is intended to run natively on Linux, macOS, and Windows.

Prerequisites:

- Node.js 24 or newer with Corepack.
- Git on `PATH`; GraphCode uses Git for the best source inventory and falls back to filesystem walking when Git is unavailable.
- Native build tools only if `better-sqlite3` has to compile during install. On macOS, install Xcode Command Line Tools with `xcode-select --install`. On Windows, install Visual Studio Build Tools with the Desktop development with C++ workload and a current Python.

1. Clone the repository:

   ```bash
   git clone <repository-url>
   ```

2. Enter the repository:

   ```bash
   cd graph-code
   ```

3. Enable Corepack:

   ```bash
   corepack enable
   ```

4. Activate the pinned pnpm version:

   ```bash
   corepack prepare pnpm@10.33.0 --activate
   pnpm --version
   ```

5. Install dependencies:

   ```bash
   pnpm install
   ```

6. Create the local self-repo workspace fixture the first time, or when you intentionally want to reset it:

   ```bash
   pnpm seed
   ```

   This creates `.graphcode/graphcode.sqlite`, which is intentionally ignored by git. Running this command again rebuilds the fixture and erases local graph edits, saved placements, agent runs, and settings in that database.

7. Start the local server and web app:

   ```bash
   pnpm dev
   ```

8. Open the workspace in a browser:

   ```text
   http://127.0.0.1:5173
   ```

The web app runs through Vite on port `5173`. The local Fastify API runs on `127.0.0.1:3010`, and the Vite dev server proxies `/api` requests to it.

For daily development after the fixture exists, run `pnpm dev` directly. Do not rerun `pnpm seed` unless you want a destructive reset back to the curated self-repo graph.

Optional verification commands:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## OS Notes

Use the same pnpm commands on Linux, macOS, and Windows. The main differences are shell syntax, local paths, and optional native build tools.

- Linux paths look like `/home/alex/project`.
- macOS paths look like `/Users/alex/project`.
- Windows paths look like `C:\Users\Alex\project`.
- Workspace source paths inside GraphCode are stored with forward slashes, even on Windows.
- If you use WSL, run Node, pnpm, Git, and GraphCode inside the same WSL distro and open WSL paths such as `/home/alex/project`, not `C:\...` paths.

To change ports on Linux or macOS:

```bash
GRAPHCODE_SERVER_PORT=4010 GRAPHCODE_WEB_PORT=5174 pnpm dev
```

To change ports in Windows PowerShell:

```powershell
$env:GRAPHCODE_SERVER_PORT = "4010"
$env:GRAPHCODE_WEB_PORT = "5174"
pnpm dev
```

The Vite proxy reads `GRAPHCODE_SERVER_HOST`, `GRAPHCODE_SERVER_PORT`, and `GRAPHCODE_API_PROXY_TARGET`. The local API defaults to `127.0.0.1:3010`; the web app defaults to `127.0.0.1:5173`.

Account-based CLI providers also work cross-platform. On Windows, npm-installed CLI shims such as `codex.cmd` or `claude.cmd` are supported; if the command is not on `PATH`, enter the full path to the `.cmd` or `.exe` in settings.

Optional Docker smoke path:

```bash
docker build -t graphcode .
docker run --rm -p 3010:3010 -p 5173:5173 graphcode
```

The repository also includes a GitHub Actions workflow at `.github/workflows/ci.yml` that installs with the pinned pnpm version and runs typecheck, tests, and build on Ubuntu, macOS, and Windows. The Docker image build is verified on Ubuntu.

## Status

This repository now contains a narrow local prototype: a Fastify local server, a React/React Flow web workspace, shared graph-model DTOs, and a deterministic self-repo seed. The generated workspace lives in `.graphcode/graphcode.sqlite` and is intentionally ignored by git.

The current development fixture is this repository itself. Follow the [installation steps](#installation) to install dependencies, create the curated self-repo graph once, and run the local workspace. Normal server startup, browser refresh, and reopening an existing `.graphcode` workspace preserve existing graph data and saved placements. Use the confirmed toolbar reset action or `pnpm seed` only when you want to destructively rebuild the fixture from source.

The first development milestone is a narrow prototype that can:

1. Parse a target repository into stable software entities.
2. Build a graph of files, modules, classes, functions, dependencies, and impact relationships.
3. Render that graph as an interactive workspace.
4. Bind graph nodes back to exact source locations.
5. Let a user request scoped AI edit proposals from a selected node or subgraph.
6. Show generated diffs, tests, and blast-radius hints for human review before acceptance.

## Product Thesis

Modern repository-scale engineering sits between two uncomfortable extremes: manual file-by-file navigation and opaque autonomous agents. GraphCode aims for a middle ground where the graph is not just a diagram, but the working surface for understanding, planning, editing, and reviewing a system change.

The core design principles are:

- The graph must represent real code entities, not decorative boxes.
- Every node should have stable identity, source links, summaries, dependencies, review state, and change history.
- AI edits should be scoped, inspectable, and reviewable.
- Global reasoning should help explain architecture and ripple effects, not silently rewrite the whole repository.
- Dense graphs should use filtering, grouping, and task-specific views instead of trying to show everything at once.

## Core Workflow

1. **Index the repository:** a local server scans a target repo and extracts code entities with the deterministic parser and scanner pipeline.
2. **Build the graph:** extracted entities become graph nodes and relationships become graph edges.
3. **Explore the architecture:** the web app renders architecture and symbol views with search, filters, expansion, and collapse.
4. **Inspect a node:** selecting a node opens its summary, exact source range, dependencies, tests, prompts, and review state.
5. **Request a local proposal:** the user asks a local agent to modify only the selected node or subgraph.
6. **Review the result:** GraphCode presents the proposed diff, test output, dependency impact, and accept/reject controls.
7. **Refresh the graph:** accepted changes trigger graph refresh and architecture summary updates.

## Initial MVP Scope

The first prototype keeps TypeScript and JavaScript as the deepest parser path, including call and control-flow extraction through the TypeScript compiler API. It also includes structural extraction for common repository languages such as Python, Java, Go, Rust, C, C++, C#, Kotlin, Swift, Ruby, PHP, SQL, and shell scripts so mixed-language repositories can still produce file, import, class/object, function/method, and call graph nodes.

The initial graph model should include:

- **Nodes:** repository, package or module, file, class, function, dependency, test, and review proposal.
- **Edges:** contains, imports, calls, owns, tests, impacts, proposes-change-to, and depends-on.
- **Local agent actions:** node-scoped or subgraph-scoped edit proposals that return review cards and diffs.
- **Global agent actions:** architecture summaries, ripple-effect detection, suspicious dependency changes, and suggested follow-up work.

No public code API is defined yet. The first implementation should keep schemas internal until the parser, graph model, and UI contracts settle.

## Planned Architecture

```text
apps/
  web/              Interactive graph workspace.
  local-server/     Local indexing, graph refresh, file access, tests, and diff APIs.

packages/
  graph-model/      Shared graph concepts, snapshots, schemas, and validation.
  parser/           Deterministic TS/JS extraction plus common-language structural parsing.
  agent-runtime/    Local and global agent orchestration.

docs/
  architecture/     Technical design notes.
  research/         Prior-art, positioning, and research material.

examples/           Demo repositories and scripted walkthroughs.
scripts/            Developer automation.
tests/fixtures/     Tiny repositories for parser and indexer tests.
```

## Directory Guide

- [apps/web](apps/web/README.md): React Flow graph workspace with ELK-based layout, search, filtering, node inspectors, and review controls.
- [apps/local-server](apps/local-server/README.md): local service boundary for repository indexing, graph snapshots, source access, test execution, and diff proposal APIs.
- [packages/graph-model](packages/graph-model/README.md): stable node and edge concepts shared by the parser, server, UI, and agent runtime.
- [packages/parser](packages/parser/README.md): deterministic code extraction, entity identity, and common-language structural graph coverage.
- [packages/agent-runtime](packages/agent-runtime/README.md): local and global agent workflows that produce transparent proposals instead of silent edits.
- [docs/architecture](docs/architecture/README.md): system design notes and interface decisions.
- [docs/research](docs/research/README.md): research assessment, prior art, and prototype rationale.
- [examples](examples/README.md): small demo repositories and scripted workflows.
- [scripts](scripts/README.md): future developer automation.
- [tests/fixtures](tests/fixtures/README.md): tiny codebases for parser, graph, and indexing tests.

## Roadmap

### Milestone 1: Repository Graph Foundation

- Define the internal graph snapshot format.
- Implement deep parser extraction for TS/JS plus structural extraction for common repository languages.
- Preserve stable entity identity across edits.
- Add tiny fixture repositories and parser/indexer tests.

### Milestone 2: Interactive Graph Workspace

- Build the React Flow workspace.
- Add ELK layout for architecture and symbol views.
- Support search, filters, grouping, expansion, and collapse.
- Bind nodes to source file ranges and dependency details.

### Milestone 3: Local Agent Proposal Loop

- Scope prompts to selected nodes or subgraphs.
- Generate proposed diffs without silent mutation.
- Run available tests or linters through the local server.
- Present a review card with diff, test output, and impact hints.

### Milestone 4: Global Architecture Reasoning

- Summarize architecture at repository, module, and subsystem levels.
- Detect cycles, suspicious dependency changes, and ripple effects.
- Suggest follow-up local-agent tasks.
- Refresh graph summaries after accepted changes.

### Milestone 5: Demo Workflows

- Trace a cross-file dependency chain.
- Make a node-scoped feature change.
- Detect a system-level ripple effect.
- Record a short demo showing the review-first workflow.

## Development Constraints

- Start with a narrow, polished loop before expanding language or framework coverage.
- Keep generated and runtime artifacts out of version control.
- Prefer local, inspectable state before introducing hosted infrastructure.
- Treat AI output as a proposal that must be reviewed by the user.
- Avoid graph-everything views as the default; use task-specific views and progressive disclosure.

## License

GraphCode is released under the MIT License. See [LICENSE](LICENSE).
