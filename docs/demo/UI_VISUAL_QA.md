# UI visual QA

GraphCode uses Playwright to inspect the rendered app from a user's point of view. The browser suite covers the empty workspace, manual-path fallback, the current loaded workspace when one exists, responsive access to the details panel, proposal-first planning and coding in the right sidebar, layered coding validation, draw modes, block/edge/boundary editors, every settings section at desktop and narrow widths, system dark mode, and four viewport widths: 1440, 1180, 980, and 768 pixels.

## Run the visual audit

From the repository root:

```bash
pnpm exec playwright install chromium
pnpm test:ui
pnpm test:ui:report
```

`pnpm test:ui` starts the normal local server and Vite app when they are not already running. On the WSL-mounted Windows checkout, the Playwright configuration supplies the required `/tmp` environment automatically. Browser automation disables the native folder picker so no host dialog can block the run. The HTML report is written under `.graphcode/playwright-report/`; each major state is attached there and saved with a stable name under `.graphcode/ui-audit/current/` for direct inspection.

The agent-sidebar journey copies `examples/review-proposal-lab` into a temporary directory, scans it with the deterministic fake provider, and restores the original workspace afterward. Its evidence is saved under `.graphcode/ui-audit/agent-sidebar/`, including coding controls, proposal review, planning apply, the 980-pixel stacked layout, layered workflow preview, and successful integration checks.

Use the interactive headed run when actively adjusting CSS:

```bash
pnpm test:ui:headed
```

The loaded-workspace checks use the first project already present in the local GraphCode database. If the database has no project, the repeatable empty-state and workspace-dialog checks still run while loaded-state checks are reported as skipped.

## What the assertions catch

- horizontal overflow in the body, shell, or toolbar;
- project-title wrapping that causes header text to jump;
- irrelevant side panes leaking into the first-run empty state;
- incorrect primary styling on the destructive reset action;
- the unavailable index state appearing as a hard failure;
- mixed light and dark surfaces when the theme follows the operating system;
- settings actions moving to the wrong side of the modal.
- screenshots captured before the workspace has finished loading;
- responsive details/settings sections that cannot be scrolled into view;
- stretched narrow settings navigation that pushes content or actions out of view;
- misaligned dialog close actions.
- missing coding intent, duplicated review actions, opaque provider output, and ambiguous planning-patch actions;
- raw workflow statuses, misleading retry actions on completed proposals, and integration failures shown outside the workflow;
- layered fake-provider patches that fail the same isolated `git apply` gate used by real proposals.

Component tests remain useful for behavior, but they cannot replace this suite: JSDOM does not calculate real layout, wrapping, clipping, browser theme media queries, or final component-library styles.
