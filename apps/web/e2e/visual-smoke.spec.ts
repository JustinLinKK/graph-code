import { expect, test, type Page, type TestInfo } from "@playwright/test";

const canvasSessionKey = "graphcode.canvasSession.v1";
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1180, height: 800 },
  { name: "stacked", width: 980, height: 800 },
  { name: "narrow", width: 768, height: 900 }
] as const;

test("empty workspace stays focused and viewport-safe", async ({ page }, testInfo) => {
  await page.addInitScript((key) => window.localStorage.removeItem(key), canvasSessionKey);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Open a workspace to begin" })).toBeVisible();
    await expect(page.locator(".left-panel")).toBeHidden();
    await expect(page.locator(".right-panel")).toBeHidden();
    await expectViewportSafe(page);
    await attachScreenshot(page, testInfo, `empty-${viewport.name}`);
  }

  await page.getByRole("button", { name: "Open workspace", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Open Workspace" })).toBeVisible();
  await attachScreenshot(page, testInfo, "workspace-dialog-narrow");
});

test("current workspace remains stable across primary user-visible states", async ({ page }, testInfo) => {
  const projectsResponse = await page.request.get("/api/projects");
  expect(projectsResponse.ok()).toBeTruthy();
  const projects = (await projectsResponse.json()) as Array<{ id: string; name: string }>;
  test.skip(projects.length === 0, "No local GraphCode workspace is available for the loaded-state visual audit.");
  const project = projects[0]!;

  await page.addInitScript(
    ({ key, projectId }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          lastProjectId: projectId,
          lastOpenedProjectId: projectId,
          projects: { [projectId]: { lastScopeNodeId: null, viewports: {} } }
        })
      );
    },
    { key: canvasSessionKey, projectId: project.id }
  );

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".brand-lockup h1")).toHaveText(project.name);
    await expect(page.locator(".canvas-panel")).toBeVisible();
    await expectViewportSafe(page);
    const titleBox = await page.locator(".brand-lockup h1").boundingBox();
    expect(titleBox?.height ?? 0).toBeLessThanOrEqual(20);
    await attachScreenshot(page, testInfo, `workspace-${viewport.name}`);
  }

  await page.setViewportSize(viewports[0]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reset self workspace", exact: true })).toHaveClass(/button--ghost/);
  await expect(page.locator(".index-state-badge.unavailable")).toBeVisible();

  await page.getByRole("button", { name: "Planning", exact: true }).click();
  await attachScreenshot(page, testInfo, "planning-panel");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add Block" })).toBeVisible();
  await attachScreenshot(page, testInfo, "block-dialog");
  await page.getByRole("button", { name: "Close block editor", exact: true }).click();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  for (const section of ["General", "Agents", "Extensions", "Integrations", "GitHub"] as const) {
    await settings.getByRole("button", { name: section, exact: true }).click();
    await attachScreenshot(page, testInfo, `settings-${section.toLowerCase()}`);
  }
  const settingsBox = await page.locator(".settings-page").boundingBox();
  const saveBox = await settings.getByRole("button", { name: "Save", exact: true }).boundingBox();
  expect((saveBox?.x ?? 0) > (settingsBox?.x ?? 0) + (settingsBox?.width ?? 0) / 2).toBeTruthy();
});

test("system dark theme colors the complete shell", async ({ page }, testInfo) => {
  const projectsResponse = await page.request.get("/api/projects");
  const projects = (await projectsResponse.json()) as Array<{ id: string }>;
  test.skip(projects.length === 0, "No local GraphCode workspace is available for the dark-theme visual audit.");
  const projectId = projects[0]!.id;

  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(
    ({ key, id }) =>
      window.localStorage.setItem(
        key,
        JSON.stringify({ lastProjectId: id, lastOpenedProjectId: id, projects: { [id]: { lastScopeNodeId: null, viewports: {} } } })
      ),
    { key: canvasSessionKey, id: projectId }
  );
  await page.setViewportSize(viewports[0]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(page.locator(".tree-row.selected")).toBeVisible();
  const colors = await page.evaluate(() => ({
    top: getComputedStyle(document.querySelector(".top-bar")!).backgroundColor,
    left: getComputedStyle(document.querySelector(".left-panel")!).backgroundColor,
    right: getComputedStyle(document.querySelector(".right-panel")!).backgroundColor,
    selected: getComputedStyle(document.querySelector(".tree-row.selected")!).backgroundColor
  }));
  expect(colors.top).toBe("rgb(29, 33, 43)");
  expect(colors.left).toBe(colors.top);
  expect(colors.right).toBe(colors.top);
  expect(colors.selected).not.toBe("rgb(255, 255, 255)");
  await attachScreenshot(page, testInfo, "workspace-system-dark");
});

async function expectViewportSafe(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => {
    const body = document.body;
    const shell = document.querySelector<HTMLElement>(".app-shell")!;
    const top = document.querySelector<HTMLElement>(".top-bar")!;
    return {
      body: [body.clientWidth, body.scrollWidth],
      shell: [shell.clientWidth, shell.scrollWidth],
      top: [top.clientWidth, top.scrollWidth]
    };
  });
  for (const [clientWidth, scrollWidth] of Object.values(metrics)) {
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  }
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png"
  });
}
