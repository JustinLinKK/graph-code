import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const canvasSessionKey = "graphcode.canvasSession.v1";

test("planning and coding sidebar completes the proposal-first example flow", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const repoRoot = resolve(process.cwd(), "../..");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "graphcode-agent-sidebar-"));
  const exampleRoot = join(temporaryRoot, "review-proposal-lab");
  cpSync(resolve(repoRoot, "examples/review-proposal-lab"), exampleRoot, { recursive: true });

  try {
    const openResponse = await page.request.post("/api/workspaces/open", {
      data: {
        rootPath: exampleRoot,
        createIfMissing: true,
        creationMode: "scan",
        initialization: {
          projectName: "Review Proposal Lab",
          projectDescription: "Small TypeScript order service for demonstrating scoped coding and review proposals.",
          scanningInstructions: "Group pricing, order creation, and tests. Highlight the selected function's callers and expected test coverage."
        }
      }
    });
    expect(openResponse.ok()).toBeTruthy();
    const opened = (await openResponse.json()) as { project: { id: string } };
    const projectId = opened.project.id;

    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/v2/projects/${projectId}/index-state`);
          if (!response.ok()) return "unavailable";
          const state = (await response.json()) as { completeness: { status: string } };
          return state.completeness.status;
        },
        { timeout: 45_000, intervals: [250, 500, 1_000] }
      )
      .toBe("complete");

    await page.addInitScript(
      ({ key, id }) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({ lastProjectId: id, lastOpenedProjectId: id, projects: { [id]: { lastScopeNodeId: null, viewports: {} } } })
        ),
      { key: canvasSessionKey, id: projectId }
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".workspace-flow")).toBeVisible();
    await expect(page.locator(".tree-row").first()).toBeVisible();

    await page.getByRole("textbox", { name: "Search hierarchy" }).fill("calculateDiscount");
    const functionRow = page.locator(".tree-label").filter({ hasText: "calculateDiscount" }).first();
    await expect(functionRow).toBeVisible();
    await functionRow.click();

    const rightPanel = page.locator(".right-panel");
    await expect(rightPanel.getByRole("heading", { name: "calculateDiscount", exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, "01-function-selected");

    const codingTask = "Fix the loyalty discount so orders under 50 never receive the discount. Keep the change scoped and update the nearby test.";
    const codingTaskInput = rightPanel.getByRole("textbox", { name: "Coding task" });
    await codingTaskInput.fill(codingTask);
    const startCode = rightPanel.getByRole("button", { name: "Start coding", exact: true });
    await startCode.scrollIntoViewIfNeeded();
    await expect(rightPanel.getByText("Coding scope", { exact: true })).toBeVisible();
    await expect(rightPanel.getByText("Recommended: Small", { exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, "02-coding-controls");
    await startCode.click();

    await expect
      .poll(async () => latestRunStatus(page, projectId, "coding"), { timeout: 20_000, intervals: [200, 500, 1_000] })
      .toBe("succeeded");
    await expect
      .poll(async () => latestRunStatus(page, projectId, "review"), { timeout: 20_000, intervals: [200, 500, 1_000] })
      .toBe("succeeded");
    await page.getByRole("tab", { name: "Planning", exact: true }).click();
    const codingActivity = page.locator(".agent-activity-row").filter({ hasText: "Coding Small" }).first();
    await expect(codingActivity).toContainText("Proposal ready");
    await expect(codingActivity).toContainText(`Proposal created for: ${codingTask}`);
    await expect(codingActivity.getByRole("button", { name: "Review", exact: true })).toHaveCount(0);
    await expect(codingActivity.getByText("Review attached", { exact: true })).toBeVisible();
    await expect(page.locator(".agent-activity-row").filter({ hasText: "Review Small" })).toHaveCount(1);
    await captureScreenshot(page, testInfo, "03-coding-proposal");

    await codingActivity.locator("summary").filter({ hasText: "Inspect proposal" }).click();
    await expect(codingActivity.getByText("Proposed diff", { exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, "04-proposal-inspection");
    await codingActivity.locator("summary").filter({ hasText: "Inspect proposal" }).click();

    const planningPrompt = "Plan the graph changes needed to keep loyalty discounts off orders under 50.";
    await rightPanel.getByRole("textbox", { name: "Prompt" }).fill(planningPrompt);
    await rightPanel.getByRole("button", { name: "Send", exact: true }).click();
    const planningTicket = page.locator(".agent-ticket-card").filter({ hasText: planningPrompt }).first();
    await expect(planningTicket).toBeVisible();
    await expect(planningTicket.locator(".run-status-badge")).toBeVisible();
    await captureScreenshot(page, testInfo, "05-planning-running");
    await expect(planningTicket).toContainText("Ready to apply", { timeout: 20_000 });
    await expect(planningTicket.getByRole("button", { name: "Apply graph patch", exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, "06-planning-ready");

    await planningTicket.getByRole("button", { name: "Apply graph patch", exact: true }).click();
    await expect(planningTicket).toContainText("Applied");
    await captureScreenshot(page, testInfo, "07-planning-applied");

    await page.setViewportSize({ width: 980, height: 900 });
    await rightPanel.scrollIntoViewIfNeeded();
    await expect(rightPanel.getByRole("textbox", { name: "Prompt" })).toBeVisible();
    await captureScreenshot(page, testInfo, "08-planning-stacked");

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await page.getByRole("textbox", { name: "Search hierarchy" }).fill("Code Graph");
    const moduleRow = page.locator(".tree-label").filter({ hasText: "Code Graph" }).first();
    await expect(moduleRow).toBeVisible();
    await moduleRow.click();
    await expect(rightPanel.getByRole("heading", { name: "Code Graph", exact: true })).toBeVisible();
    const previewWorkflow = rightPanel.getByRole("button", { name: "Preview workflow", exact: true });
    await previewWorkflow.scrollIntoViewIfNeeded();
    await previewWorkflow.click();

    const workflowPanel = page.locator(".coding-workflow-panel");
    await expect(workflowPanel).toBeVisible();
    await expect(workflowPanel.getByText("Layered coding", { exact: true })).toBeVisible();
    await expect(workflowPanel.getByRole("button", { name: "Start workflow", exact: true })).toBeEnabled();
    await captureScreenshot(page, testInfo, "09-layered-coding-preview");

    const startWorkflowResponse = page.waitForResponse((response) => response.url().endsWith("/api/coding-workflows/start") && response.request().method() === "POST");
    await workflowPanel.getByRole("button", { name: "Start workflow", exact: true }).click();
    const startedWorkflow = (await (await startWorkflowResponse).json()) as { id: string };
    await expect(workflowPanel.locator(".coding-workflow-header span")).toContainText(/ready for review|Succeeded/, { timeout: 30_000 });
    await expect(workflowPanel.locator(".coding-workflow-item").first()).toContainText(/Proposed|Applied/);
    await expect(workflowPanel.getByText(/Proposals are ready/)).toBeVisible();
    await expect(workflowPanel.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    await captureScreenshot(page, testInfo, "10-layered-coding-proposals");

    await workflowPanel.getByRole("button", { name: "Apply layer", exact: true }).click();
    await expect(workflowPanel.locator(".coding-workflow-header span")).toContainText("Succeeded", { timeout: 30_000 });
    await expect(workflowPanel.locator(".coding-workflow-item").first()).toContainText("Applied");
    await expect(workflowPanel.getByRole("alert")).toHaveCount(0);
    const refreshedWorkflow = await page.request.get(`/api/projects/${projectId}/coding-workflows/${startedWorkflow.id}`);
    expect(refreshedWorkflow.ok()).toBeTruthy();
    const refreshedWorkflowBody = (await refreshedWorkflow.json()) as { integrationChecks?: Array<{ checkKind: string; status: string }> };
    expect(refreshedWorkflowBody.integrationChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ checkKind: "actual_write_set", status: "passed" }),
        expect.objectContaining({ checkKind: "combined_patch", status: "passed" }),
        expect.objectContaining({ checkKind: "targeted_checks", status: "passed" })
      ])
    );
    const checks = workflowPanel.getByText("Integration checks (7)", { exact: true });
    await checks.scrollIntoViewIfNeeded();
    await checks.click();
    await expect(workflowPanel.getByText("Combined patch", { exact: true })).toBeVisible();
    await captureScreenshot(page, testInfo, "11-layered-coding-applied");
  } finally {
    await page.request.post("/api/workspaces/open", { data: { rootPath: repoRoot } }).catch(() => undefined);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

async function latestRunStatus(page: Page, projectId: string, agentKind: string): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/agent-runs`);
  if (!response.ok()) return "unavailable";
  const runs = (await response.json()) as Array<{ agentKind: string; status: string }>;
  return runs.find((run) => run.agentKind === agentKind)?.status ?? "missing";
}

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const auditDir = resolve(process.cwd(), "../../.graphcode/ui-audit/agent-sidebar");
  mkdirSync(auditDir, { recursive: true });
  const body = await page.screenshot({
    path: resolve(auditDir, `${name}.png`),
    fullPage: true,
    animations: "disabled"
  });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
