# Local Server

This directory contains the local Fastify service that connects the web workspace to repository-local graph state.

Current responsibilities:

- Open or create `.graphcode/graphcode.sqlite` workspaces.
- Seed the curated self-repo graph used for local testing.
- Serve project, hierarchy, canvas, node detail, layout, and block editing APIs.
- Persist graph node layouts and block metadata in SQLite.
- Keep generated workspace state local and ignored by git.

Run `pnpm seed` from the repo root to rebuild the self workspace, then `pnpm dev` to start the server and web app together.
