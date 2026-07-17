# Local Server

This directory contains the local Fastify service that connects the web workspace to repository-local graph state.

Current responsibilities:

- Open or create `.graphcode/graphcode.sqlite` workspaces.
- Seed the curated self-repo graph used for local testing.
- Serve project, hierarchy, canvas, node detail, layout, and block editing APIs.
- Persist graph node layouts and block metadata in SQLite.
- Keep generated workspace state local and ignored by git.

Run `pnpm seed` from the repo root only for optional self-fixture creation or an intentional destructive reset; it rebuilds the self workspace and erases local graph edits, saved placements, agent runs, and settings in `.graphcode/graphcode.sqlite`.

For normal development, run `pnpm dev` from the repo root. Normal server startup opens and migrates the existing database without reseeding it, and the web app waits for the user to open a workspace explicitly.
