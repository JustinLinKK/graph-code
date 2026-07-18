# UI visual QA

GraphCode uses Playwright to inspect the rendered app from a user's point of view. The browser suite covers the empty workspace, the current loaded workspace when one exists, the planning panel, block editor, every settings section, system dark mode, and four viewport widths: 1440, 1180, 980, and 768 pixels.

## Run the visual audit

From the repository root:

```bash
pnpm exec playwright install chromium
pnpm test:ui
pnpm test:ui:report
```

`pnpm test:ui` starts the normal local server and Vite app when they are not already running. On the WSL-mounted Windows checkout, the Playwright configuration supplies the required `/tmp` environment automatically. The HTML report is written under `.graphcode/playwright-report/`, and each major state is attached as a full-page screenshot.

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

Component tests remain useful for behavior, but they cannot replace this suite: JSDOM does not calculate real layout, wrapping, clipping, browser theme media queries, or final component-library styles.
