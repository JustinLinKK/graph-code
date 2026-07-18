import { describe, expect, it, vi } from "vitest";
import type { AgentScale, ModelRoutingDecision, SourceWriteScope } from "@graphcode/graph-model";
import {
  createWorkflowScheduler,
  modelLimitKey,
  WorkspaceRevisionApplyLock,
  WorkflowSchedulerFailure,
  type ScheduledWorkUnit,
  type WorkflowDispatchContext
} from "./workflow-scheduler";

const assignments: Record<AgentScale, NonNullable<ModelRoutingDecision["assignment"]>> = {
  small: { providerId: "provider-a", modelId: "small", maxConcurrency: 8, inputPricePerMillion: 1, outputPricePerMillion: 2, currency: "USD" },
  medium: { providerId: "provider-a", modelId: "medium", maxConcurrency: 4, inputPricePerMillion: 2, outputPricePerMillion: 4, currency: "USD" },
  large: { providerId: "provider-b", modelId: "large", maxConcurrency: 2, inputPricePerMillion: 4, outputPricePerMillion: 8, currency: "USD" }
};

function scope(path: string, startLine = 1, endLine = 10): SourceWriteScope {
  return { path, startLine, endLine, symbolId: path, permission: "edit" };
}

function decision(id: string, scale: AgentScale = "small"): ModelRoutingDecision {
  return {
    id: `route-${id}`,
    workUnitId: id,
    recommendedScale: scale,
    selectedScale: scale,
    featureVersion: "ma4-deterministic-router-v1",
    features: {
      ownedSymbolCount: 1,
      estimatedSourceTokens: 100,
      controlFlowComplexity: 1,
      cutEdgeCount: 0,
      cutEdgeWeight: 0,
      crossFileRelationshipCount: 0,
      crossPackageRelationshipCount: 0,
      upstreamWorkUnitCount: 0,
      downstreamWorkUnitCount: 0,
      interfaceChangeRequested: false,
      publicApiInvolvement: false,
      sharedStateInvolvement: false,
      testAvailability: "available",
      blastRadius: "local",
      languageConfidence: 1,
      indexState: "complete",
      taskAmbiguity: "low",
      planningConfidence: 1,
      risks: []
    },
    reasons: ["Test route."],
    estimatedInputTokens: 100,
    estimatedOutputTokens: 20,
    estimatedCost: 0.001,
    assignment: assignments[scale],
    override: null
  };
}

function unit(id: string, options: { dependencies?: string[]; scopes?: SourceWriteScope[]; scale?: AgentScale } = {}): ScheduledWorkUnit {
  return {
    id,
    dependencyWorkUnitIds: options.dependencies ?? [],
    plannedWriteScopes: options.scopes ?? [scope(`src/${id}.ts`)],
    routingDecision: decision(id, options.scale),
    baseRevisionKey: "revision-1",
    indexState: "complete"
  };
}

function accepted() {
  return { outcome: "accepted" as const, actualInputTokens: 80, actualOutputTokens: 15, testOutcome: "passed" as const };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }, { once: true });
  });
}

describe("dynamic MA-4 workflow scheduler", () => {
  it("runs independent fake-provider units in ceil(N/concurrency) dispatch waves", async () => {
    let active = 0;
    let peak = 0;
    const scheduler = createWorkflowScheduler({
      units: ["a", "b", "c", "d", "e"].map((id) => unit(id)),
      limits: { globalConcurrency: 2, maxRetries: 0, maxEscalations: 0 },
      validateRevision: () => true,
      execute: async ({ signal }) => {
        active += 1;
        peak = Math.max(peak, active);
        try {
          await delay(12, signal);
          return accepted();
        } finally {
          active -= 1;
        }
      }
    });

    const result = await scheduler.run();

    expect(result.status).toBe("succeeded");
    expect(result.peakConcurrency).toBe(2);
    expect(peak).toBe(2);
    expect(result.dispatchWaves).toBe(3);
    expect(result.units.every((item) => item.status === "accepted")).toBe(true);
  });

  it("never overlaps conflicting writes and blocks consumers until required producers are accepted", async () => {
    let conflictingActive = 0;
    let conflictingPeak = 0;
    const completed = new Set<string>();
    const starts: string[] = [];
    const scheduler = createWorkflowScheduler({
      units: [
        unit("producer", { scopes: [scope("src/shared.ts", 1, 20)] }),
        unit("conflict", { scopes: [scope("src/shared.ts", 15, 30)] }),
        unit("consumer", { dependencies: ["producer"] }),
        unit("independent")
      ],
      limits: { globalConcurrency: 3, maxRetries: 0, maxEscalations: 0 },
      validateRevision: () => true,
      execute: async ({ workUnitId, signal }) => {
        starts.push(workUnitId);
        if (workUnitId === "consumer") expect(completed.has("producer")).toBe(true);
        if (workUnitId === "producer" || workUnitId === "conflict") {
          conflictingActive += 1;
          conflictingPeak = Math.max(conflictingPeak, conflictingActive);
        }
        await delay(8, signal);
        if (workUnitId === "producer" || workUnitId === "conflict") conflictingActive -= 1;
        completed.add(workUnitId);
        return accepted();
      }
    });

    const result = await scheduler.run();

    expect(result.status).toBe("succeeded");
    expect(conflictingPeak).toBe(1);
    expect(starts.indexOf("consumer")).toBeGreaterThan(starts.indexOf("producer"));
  });

  it("dispatches each scale to its assigned provider/model while enforcing per-model limits", async () => {
    const seen: Array<Pick<WorkflowDispatchContext, "workUnitId" | "scale" | "providerId" | "modelId">> = [];
    let activeSmall = 0;
    let peakSmall = 0;
    const scheduler = createWorkflowScheduler({
      units: [unit("small-a"), unit("small-b"), unit("medium", { scale: "medium" }), unit("large", { scale: "large" })],
      limits: {
        globalConcurrency: 4,
        modelConcurrency: { [modelLimitKey("provider-a", "small")]: 1 },
        maxRetries: 0,
        maxEscalations: 0
      },
      validateRevision: () => true,
      execute: async ({ signal, ...context }) => {
        seen.push(context);
        if (context.modelId === "small") {
          activeSmall += 1;
          peakSmall = Math.max(peakSmall, activeSmall);
        }
        await delay(6, signal);
        if (context.modelId === "small") activeSmall -= 1;
        return accepted();
      }
    });

    await scheduler.run();

    expect(peakSmall).toBe(1);
    expect(seen).toEqual(expect.arrayContaining([
      expect.objectContaining({ scale: "small", providerId: "provider-a", modelId: "small" }),
      expect.objectContaining({ scale: "medium", providerId: "provider-a", modelId: "medium" }),
      expect.objectContaining({ scale: "large", providerId: "provider-b", modelId: "large" })
    ]));
  });

  it("blocks dispatch before execution when the workflow cost budget is exceeded", async () => {
    const execute = vi.fn(async () => accepted());
    const scheduler = createWorkflowScheduler({
      units: [unit("budgeted")],
      limits: { globalConcurrency: 1, globalCostBudget: 0.0001, maxRetries: 0, maxEscalations: 0 },
      validateRevision: () => true,
      execute
    });

    const result = await scheduler.run();

    expect(execute).not.toHaveBeenCalled();
    expect(result.units[0]).toMatchObject({ status: "blocked", reason: expect.stringContaining("workflow budget") });
  });

  it("fails closed when a workflow cost cap is configured but the selected model is unpriced", async () => {
    const execute = vi.fn(async () => accepted());
    const unpriced = unit("unpriced");
    unpriced.routingDecision.estimatedCost = null;
    const scheduler = createWorkflowScheduler({
      units: [unpriced],
      limits: { globalConcurrency: 1, globalCostBudget: 1, maxRetries: 0, maxEscalations: 0 },
      validateRevision: () => true,
      execute
    });

    const result = await scheduler.run();

    expect(execute).not.toHaveBeenCalled();
    expect(result.units[0]).toMatchObject({ status: "blocked", reason: expect.stringContaining("unavailable") });
  });

  it("records bounded retries and escalates context failures to the next configured tier", async () => {
    const execute = vi.fn(async ({ attempt, scale }: WorkflowDispatchContext) => {
      if (attempt === 1) throw new WorkflowSchedulerFailure("transient_provider", "Temporary rate limit.");
      if (attempt === 2) throw new WorkflowSchedulerFailure("context_insufficient", "Need broader context.");
      expect(scale).toBe("medium");
      return accepted();
    });
    const scheduler = createWorkflowScheduler({
      units: [unit("retry")],
      limits: { globalConcurrency: 1, maxRetries: 1, maxEscalations: 1 },
      validateRevision: () => true,
      assignmentForScale: (scale) => assignments[scale],
      execute
    });

    const result = await scheduler.run();
    const item = result.units[0];

    expect(item).toMatchObject({ status: "accepted", scale: "medium", attempts: 3, providerId: "provider-a", modelId: "medium" });
    expect(item.metrics).toMatchObject({ retryCount: 1, escalationCount: 1, acceptanceOutcome: "accepted", testOutcome: "passed" });
  });

  it("honors pause/resume, marks stale revisions, and blocks their consumers", async () => {
    const execute = vi.fn(async () => accepted());
    const scheduler = createWorkflowScheduler({
      units: [unit("stale"), unit("consumer", { dependencies: ["stale"] }), unit("healthy")],
      limits: { globalConcurrency: 2, maxRetries: 0, maxEscalations: 0 },
      validateRevision: (candidate) => candidate.id !== "stale",
      execute
    });
    scheduler.pause();
    const running = scheduler.run();
    await delay(1);
    expect(execute).not.toHaveBeenCalled();
    scheduler.resume();

    const result = await running;

    expect(result.units.find((item) => item.id === "stale")?.status).toBe("stale");
    expect(result.units.find((item) => item.id === "consumer")?.status).toBe("blocked");
    expect(result.units.find((item) => item.id === "healthy")?.status).toBe("accepted");
  });

  it("cancels active provider calls and preserves already accepted work", async () => {
    const scheduler = createWorkflowScheduler({
      units: [unit("a-done"), unit("b-active"), unit("c-queued")],
      limits: { globalConcurrency: 1, maxRetries: 0, maxEscalations: 0 },
      validateRevision: () => true,
      execute: async ({ workUnitId, signal }) => {
        if (workUnitId === "a-done") return accepted();
        await delay(100, signal);
        return accepted();
      }
    });
    const running = scheduler.run();
    while (!scheduler.snapshot().activeWorkUnitIds.includes("b-active")) await delay(1);
    scheduler.cancel();

    const result = await running;

    expect(result.status).toBe("cancelled");
    expect(result.units.find((item) => item.id === "a-done")?.status).toBe("accepted");
    expect(result.units.find((item) => item.id === "b-active")?.status).toBe("cancelled");
    expect(result.units.find((item) => item.id === "c-queued")?.status).toBe("cancelled");
  });

  it("serializes workspace apply operations and revalidates the revision after lock acquisition", async () => {
    const lock = new WorkspaceRevisionApplyLock();
    let revision = "revision-1";
    let active = 0;
    let peak = 0;
    const apply = (label: string, expectedRevision: string) =>
      lock.runExclusive({
        workspaceId: "workspace-1",
        expectedRevision,
        observeRevision: () => revision,
        apply: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await delay(5);
          active -= 1;
          revision = `${label}-applied`;
          return label;
        }
      });

    const first = apply("first", "revision-1");
    const staleSecond = apply("second", "revision-1");
    const staleExpectation = expect(staleSecond).rejects.toMatchObject({ kind: "stale_revision" });

    await expect(first).resolves.toBe("first");
    await staleExpectation;
    expect(peak).toBe(1);
  });
});
