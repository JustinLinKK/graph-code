import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const canvasSessionKey = "graphcode.canvasSession.v1";
const runCodexJourney = process.env.GRAPHCODE_RUN_CODEX_E2E === "1";
const codexModel = process.env.GRAPHCODE_CODEX_E2E_MODEL?.trim() || "gpt-5.6-luna";

const planningSystemPrompt = [
  "You are the GraphCode Planning agent for a small TypeScript pricing repository.",
  "Convert the user's request into a minimal, reviewable graph plan using only the node and edge IDs supplied in the user message.",
  "Return strict JSON only with this shape: {\"response\":\"short plan\",\"graphPatch\":{\"summary\":\"short summary\",\"operations\":[{\"entityType\":\"node\",\"entityId\":\"existing id\",\"action\":\"update\",\"fields\":{\"summary\":\"planned behavior\"}}]}}.",
  "Do not use markdown fences, invent IDs, edit files, or add prose outside the JSON."
].join(" ");

const codingSystemPrompt = [
  "You are the GraphCode Coding Small agent for a proposal-first workflow.",
  "Return only one valid unified diff with diff --git, ---, +++, and numbered @@ hunk headers. Do not use markdown fences or prose.",
  "Modify only the selected function inside its declared source path and line range. Keep surrounding context lines in the hunk so git apply can validate it.",
  "Do not edit .graphcode state, tests, other files, or apply the patch yourself."
].join(" ");

const reviewSystemPrompt = [
  "You are the GraphCode Review Small agent.",
  "Review the supplied proposal for correctness, exact source scope, clean unified-diff syntax, and regression risk.",
  "List concrete findings first. End with exactly one final line: GRAPHCODE_REVIEW_VERDICT: reviewed or GRAPHCODE_REVIEW_VERDICT: bugged.",
  "Do not edit files or return a replacement patch."
].join(" ");

test.describe("real Codex provider", () => {
  test.skip(!runCodexJourney, "Set GRAPHCODE_RUN_CODEX_E2E=1 to run account-backed Codex CLI calls.");

  test("completes planning, coding, review, and implementation", async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    const repoRoot = resolve(process.cwd(), "../..");
    const temporaryRoot = mkdtempSync(join(tmpdir(), "graphcode-codex-workflow-"));
    const exampleRoot = join(temporaryRoot, "review-proposal-lab");
    cpSync(resolve(repoRoot, "examples/review-proposal-lab"), exampleRoot, { recursive: true });
    const implementationPath = join(exampleRoot, "src/discount.ts");
    const originalSource = readFileSync(implementationPath, "utf8");

    try {
      const openResponse = await page.request.post("/api/workspaces/open", {
        data: {
          rootPath: exampleRoot,
          createIfMissing: true,
          creationMode: "scan",
          initialization: {
            projectName: "Codex Review Proposal Lab",
            projectDescription: "Small TypeScript pricing service used to verify GraphCode's complete proposal-first Codex workflow.",
            scanningInstructions: "Group pricing functions and tests. Preserve exact source paths and line ranges for calculateDiscount."
          }
        }
      });
      expect(openResponse.ok()).toBeTruthy();
      const opened = (await openResponse.json()) as { project: { id: string } };
      const projectId = opened.project.id;

      await expect.poll(async () => {
        const response = await page.request.get(`/api/v2/projects/${projectId}/index-state`);
        if (!response.ok()) return "unavailable";
        const state = (await response.json()) as { completeness: { status: string } };
        return state.completeness.status;
      }, { timeout: 45_000, intervals: [250, 500, 1_000] }).toBe("complete");

      await page.addInitScript(
        ({ key, id }) => window.localStorage.setItem(
          key,
          JSON.stringify({ lastProjectId: id, lastOpenedProjectId: id, projects: { [id]: { lastScopeNodeId: null, viewports: {} } } })
        ),
        { key: canvasSessionKey, id: projectId }
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/");
      await expect(page.locator(".workspace-flow")).toBeVisible();

      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Settings" });
      await settings.getByRole("tab", { name: "Agents", exact: true }).click();
      const autoReview = settings.getByRole("checkbox", { name: "Auto-run Review After Coding" });
      if (!(await autoReview.isChecked())) await autoReview.check();

      await configureCodexCard(settings, "Planning", planningSystemPrompt);
      await configureCodexCard(settings, "Coding Small", codingSystemPrompt);
      await configureCodexCard(settings, "Review Small", reviewSystemPrompt);
      await captureScreenshot(page, testInfo, "01-codex-system-prompts");
      const settingsResponse = page.waitForResponse(
        (response) => response.url().endsWith(`/api/projects/${projectId}/settings`) && response.request().method() === "PUT"
      );
      await settings.getByRole("button", { name: "Save", exact: true }).click();
      expect((await settingsResponse).ok()).toBeTruthy();
      await settings.getByRole("button", { name: "Close settings", exact: true }).click();
      await expect(settings).toHaveCount(0);

      await page.getByRole("textbox", { name: "Search hierarchy" }).fill("calculateDiscount");
      await page.locator(".tree-label").filter({ hasText: "calculateDiscount" }).first().click();
      const rightPanel = page.locator(".right-panel");
      await expect(rightPanel.getByRole("heading", { name: "calculateDiscount", exact: true })).toBeVisible();

      await page.getByRole("tab", { name: "Planning", exact: true }).click();
      const planningPrompt = "Plan the smallest graph and code change that makes every order below 50 return zero discount.";
      await rightPanel.getByRole("textbox", { name: "Prompt" }).fill(planningPrompt);
      await rightPanel.getByRole("button", { name: "Send", exact: true }).click();
      const planningTicket = page.locator(".agent-ticket-card").filter({ hasText: planningPrompt }).first();
      await expect(planningTicket).toContainText("Ready to apply", { timeout: 150_000 });
      await captureScreenshot(page, testInfo, "02-codex-plan-ready");
      await planningTicket.getByRole("button", { name: "Apply graph patch", exact: true }).click();
      await expect(planningTicket).toContainText("Applied");

      await page.getByRole("tab", { name: "Details", exact: true }).click();
      const codingTask = "Fix calculateDiscount so every order below 50 returns zero before tier or coupon discounts. Keep the patch inside this function and do not modify tests.";
      await rightPanel.getByRole("textbox", { name: "Coding task" }).fill(codingTask);
      await rightPanel.getByRole("button", { name: "Start coding", exact: true }).click();

      await expect.poll(async () => latestRunStatus(page, projectId, "coding"), {
        timeout: 150_000,
        intervals: [1_000, 2_000, 5_000]
      }).toBe("succeeded");
      await expect.poll(async () => latestRunStatus(page, projectId, "review"), {
        timeout: 150_000,
        intervals: [1_000, 2_000, 5_000]
      }).toBe("succeeded");

      await page.getByRole("tab", { name: "Planning", exact: true }).click();
      const codingActivity = page.locator(".agent-activity-row").filter({ hasText: "Coding Small" }).first();
      await expect(codingActivity).toContainText("Review attached");
      await expect(codingActivity).toContainText("Proposal ready");
      await codingActivity.locator("summary").filter({ hasText: "Inspect proposal" }).click();
      await expect(codingActivity.getByText("Proposed diff", { exact: true })).toBeVisible();
      await captureScreenshot(page, testInfo, "03-codex-reviewed-proposal");
      await codingActivity.locator("summary").filter({ hasText: "Inspect proposal" }).click();

      const implementProposal = codingActivity.getByRole("button", { name: "Implement proposal", exact: true });
      await expect(implementProposal).toBeVisible({ timeout: 30_000 });
      await implementProposal.click();
      await expect(codingActivity).toContainText("Implemented", { timeout: 60_000 });
      await expect(page.locator(".index-state-badge")).toHaveText("Index complete · 3/3", { timeout: 60_000 });
      await expect(page.locator(".notice.error")).toHaveCount(0);
      await captureScreenshot(page, testInfo, "04-codex-implemented");

      const implementedSource = readFileSync(implementationPath, "utf8");
      expect(implementedSource).not.toBe(originalSource);
      expect(implementedSource).toMatch(/input\.subtotal\s*<\s*50/);
      expect(implementedSource.indexOf("input.subtotal < 50")).toBeLessThan(implementedSource.indexOf('input.tier === "member"'));
    } finally {
      await page.request.post("/api/workspaces/open", { data: { rootPath: repoRoot } }).catch(() => undefined);
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

async function configureCodexCard(settings: Locator, heading: string, systemPrompt: string): Promise<void> {
  const resolvedCard = settings
    .getByRole("heading", { name: heading, exact: true })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' agent-settings-card ')][1]");
  await resolvedCard.getByLabel("Provider").selectOption("codex");
  await expect(resolvedCard.getByLabel("Codex Model")).toBeVisible({ timeout: 30_000 });
  await resolvedCard.getByLabel("Codex Model").selectOption(codexModel);
  await resolvedCard.getByLabel("Reasoning Effort").selectOption("low");
  await resolvedCard.getByLabel("Permission Mode").selectOption("ask_for_permission");
  await resolvedCard.getByLabel("System Prompt").selectOption("custom");
  await resolvedCard.getByRole("textbox", { name: "Custom Prompt", exact: true }).fill(systemPrompt);
}

async function latestRunStatus(page: Page, projectId: string, agentKind: string): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/agent-runs`);
  if (!response.ok()) return "unavailable";
  const runs = (await response.json()) as Array<{ agentKind: string; status: string }>;
  return runs.find((run) => run.agentKind === agentKind)?.status ?? "missing";
}

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const auditDir = resolve(process.cwd(), "../../.graphcode/ui-audit/codex-workflow");
  mkdirSync(auditDir, { recursive: true });
  const body = await page.screenshot({
    path: resolve(auditDir, `${name}.png`),
    fullPage: true,
    animations: "disabled"
  });
  await testInfo.attach(name, { body, contentType: "image/png" });
}
