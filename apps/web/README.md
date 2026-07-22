# Web App

This directory contains the GraphCode React/Vite workspace.

Current responsibilities include:

- render repository, hierarchy, function-workflow, reuse, boundary, and attachment views with React Flow;
- persist canvas sessions and server-backed node layouts;
- expose graph editing, inspectors, search, settings, agent runs, proposals, and explicit review/apply actions;
- preview graph-partitioned coding workflows with partition, wave, ownership/halo, contract, routing, price, progress, and blocker evidence;
- require server revalidation after model, partition, ignored-edge, concurrency, or cost-cap overrides;
- poll background workflows and expose pause, resume, cancel, retry, escalation, skip, validate-only integration, and apply controls; and
- keep large workflow panels bounded to 25 rendered units per page with accessible labels and progress semantics.

Run the app with the local server from the repository root:

```bash
pnpm dev
```

The default web URL is `http://127.0.0.1:5173`. Verify the package with:

```bash
pnpm --filter @graphcode/web typecheck
pnpm --filter @graphcode/web test
pnpm --filter @graphcode/web build
```

Providers only return proposals. `Integrate` validates and stores reconciliation evidence without changing the workspace; `Apply layer` is the explicit mutation boundary.
