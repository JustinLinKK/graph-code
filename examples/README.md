# GraphCode Example Gallery

These examples are small repositories for demos, screenshots, parser checks, and GraphCode scanning walkthroughs. They are intentionally lightweight and are not pnpm workspace packages.

Use them when you want to show a professor or reviewer how GraphCode turns source files into a graph, scopes agent work, and keeps proposed changes reviewable.

## Gallery

| Example | What to Scan | What to Screenshot | Feature Demonstrated |
| --- | --- | --- | --- |
| [polyglot-service](polyglot-service) | `examples/polyglot-service` | Python service, Go worker, C++ native helper, SQL schema, config nodes. | Mixed-language repository scanning and source-linked graph nodes. |
| [review-proposal-lab](review-proposal-lab) | `examples/review-proposal-lab` | A selected TypeScript function, coding proposal activity, review verdict. | Node-scoped coding and review loop. |
| [architecture-ripple](architecture-ripple) | `examples/architecture-ripple` | Shared contract node with downstream billing, email, and audit callers. | Ripple-effect reasoning across modules. |
| [ui-api-workflow](ui-api-workflow) | `examples/ui-api-workflow` | Frontend action flowing into backend API route. | UI/API boundaries and source-linked workflow navigation. |
| [extension-gallery](extension-gallery) | `examples/extension-gallery` | Embedded and ML snippets after enabling extension-oriented blocks. | Domain-specific graph blocks and extension package demos. |

## Recommended Demo Order

1. Start with the seeded self workspace to show GraphCode itself.
2. Open and scan [polyglot-service](polyglot-service) to show mixed-language coverage.
3. Open [review-proposal-lab](review-proposal-lab) and run a small coding/review prompt.
4. Open [architecture-ripple](architecture-ripple) to explain impact relationships.
5. Use [extension-gallery](extension-gallery) when you want to discuss future domain packs such as embedded systems and ML workflows.

## Shared Screenshot Guidance

For every example:

1. Open the example directory as a workspace.
2. If prompted, choose `Create and scan`.
3. Use a concise project description and scanning instructions from the example README.
4. Click `Workspace`, then `Auto layout`.
5. Select a source-backed node and keep the inspector visible.

The root [README_DEMO_SCREENSHOT_GUIDE.md](../README_DEMO_SCREENSHOT_GUIDE.md) gives the exact filenames needed by the root README.
