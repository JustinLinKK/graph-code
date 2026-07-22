import type { AgentScale, ModelRoutingDecision, SourceWriteScope } from "@graphcode/graph-model";

export type SchedulerFailureKind =
  | "transient_provider"
  | "context_insufficient"
  | "validation_failure"
  | "contract_conflict"
  | "stale_revision"
  | "permanent";

export class WorkflowSchedulerFailure extends Error {
  constructor(
    readonly kind: SchedulerFailureKind,
    message: string,
    readonly usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 }
  ) {
    super(message);
    this.name = "WorkflowSchedulerFailure";
  }
}

export type ScheduledWorkUnit = {
  id: string;
  dependencyWorkUnitIds: string[];
  plannedWriteScopes: SourceWriteScope[];
  routingDecision: ModelRoutingDecision;
  baseRevisionKey: string;
  indexState: ModelRoutingDecision["features"]["indexState"];
  executionMode?: "apply_capable" | "proposal_only";
  coordinatedProposalUnitIds?: string[];
  initialOutcome?: "proposed" | "accepted" | "waived" | "failed" | "cancelled";
};

export type WorkflowDispatchResult = {
  outcome: "accepted" | "proposed";
  actualInputTokens: number;
  actualOutputTokens: number;
  testOutcome: "not_run" | "passed" | "failed" | "skipped";
};

export type WorkflowDispatchContext = {
  workUnitId: string;
  attempt: number;
  scale: AgentScale;
  providerId: string;
  modelId: string;
  signal: AbortSignal;
};

export type WorkflowSchedulerLimits = {
  globalConcurrency: number;
  providerConcurrency?: Record<string, number>;
  modelConcurrency?: Record<string, number>;
  modelCostBudgets?: Record<string, number>;
  globalCostBudget?: number;
  maxRetries: number;
  maxEscalations: number;
};

export type WorkflowSchedulerOptions = {
  units: ScheduledWorkUnit[];
  limits: WorkflowSchedulerLimits;
  execute: (context: WorkflowDispatchContext) => Promise<WorkflowDispatchResult>;
  validateRevision: (unit: ScheduledWorkUnit) => boolean | Promise<boolean>;
  indexStateAllowed?: (state: ScheduledWorkUnit["indexState"]) => boolean;
  assignmentForScale?: (scale: AgentScale, unit: ScheduledWorkUnit) => NonNullable<ModelRoutingDecision["assignment"]>;
};

export type ScheduledUnitStatus = "pending" | "running" | "proposed" | "accepted" | "waived" | "failed" | "blocked" | "stale" | "cancelled";

export type ScheduledUnitResult = {
  id: string;
  status: ScheduledUnitStatus;
  scale: AgentScale;
  providerId: string;
  modelId: string;
  attempts: number;
  reason: string | null;
  metrics: NonNullable<ModelRoutingDecision["metrics"]>;
};

export type WorkflowScheduleResult = {
  status: "succeeded" | "partial" | "failed" | "cancelled";
  units: ScheduledUnitResult[];
  peakConcurrency: number;
  dispatchWaves: number;
  elapsedMs: number;
  timeline: Array<{ type: "dispatch" | "complete" | "retry" | "escalate"; workUnitId: string; atMs: number }>;
};

type RuntimeUnit = {
  spec: ScheduledWorkUnit;
  status: ScheduledUnitStatus;
  scale: AgentScale;
  assignment: NonNullable<ModelRoutingDecision["assignment"]>;
  attempts: number;
  reason: string | null;
  controller: AbortController | null;
  metrics: NonNullable<ModelRoutingDecision["metrics"]>;
};

export class WorkflowScheduler {
  private readonly runtime = new Map<string, RuntimeUnit>();
  private readonly active = new Map<string, Promise<void>>();
  private readonly timeline: WorkflowScheduleResult["timeline"] = [];
  private readonly modelEstimatedSpend = new Map<string, number>();
  private estimatedSpend = 0;
  private readonly wakeWaiters = new Set<() => void>();
  private paused = false;
  private cancelled = false;
  private running = false;
  private peakConcurrency = 0;
  private dispatched = 0;
  private startedAt = 0;

  constructor(private readonly options: WorkflowSchedulerOptions) {
    validateOptions(options);
    for (const spec of [...options.units].sort((left, right) => left.id.localeCompare(right.id))) {
      const assignment = requiredAssignment(spec.routingDecision);
      this.runtime.set(spec.id, {
        spec,
        status: spec.initialOutcome ?? "pending",
        scale: spec.routingDecision.selectedScale,
        assignment,
        attempts: 0,
        reason:
          spec.initialOutcome === "waived"
            ? "Dependency explicitly waived."
            : spec.initialOutcome
              ? `Restored persisted ${spec.initialOutcome} state.`
              : null,
        controller: null,
        metrics: emptyMetrics(
          spec.initialOutcome === "accepted"
            ? "accepted"
            : spec.initialOutcome === "cancelled"
              ? "cancelled"
              : spec.initialOutcome === "failed"
                ? "failed"
                : "pending"
        )
      });
    }
  }

  pause(): void {
    this.paused = true;
    this.wake();
  }

  resume(): void {
    this.paused = false;
    this.wake();
  }

  cancel(): void {
    this.cancelled = true;
    for (const unit of this.runtime.values()) unit.controller?.abort();
    this.wake();
  }

  snapshot(): { paused: boolean; cancelled: boolean; activeWorkUnitIds: string[]; units: ScheduledUnitResult[] } {
    return {
      paused: this.paused,
      cancelled: this.cancelled,
      activeWorkUnitIds: [...this.active.keys()].sort(),
      units: this.results()
    };
  }

  async run(): Promise<WorkflowScheduleResult> {
    if (this.running) throw new Error("Workflow scheduler can only be run once.");
    this.running = true;
    this.startedAt = performance.now();
    while (true) {
      if (this.cancelled) {
        for (const unit of this.runtime.values()) {
          if (unit.status === "pending") {
            unit.status = "cancelled";
            unit.reason = "Workflow cancelled before dispatch.";
            unit.metrics.acceptanceOutcome = "cancelled";
          }
        }
      }

      if (!this.paused && !this.cancelled) {
        this.blockFailedDependencies();
        await this.dispatchReadyUnits();
      }

      if (this.active.size === 0) {
        if (this.cancelled || this.isTerminal()) break;
        if (this.paused) {
          await this.waitForWake();
          continue;
        }
        this.blockUnresolvableUnits();
        if (this.isTerminal()) break;
      }

      if (this.active.size > 0) await this.waitForProgress();
    }
    await Promise.allSettled(this.active.values());
    const elapsedMs = performance.now() - this.startedAt;
    const units = this.results();
    return {
      status: scheduleStatus(units, this.cancelled),
      units,
      peakConcurrency: this.peakConcurrency,
      dispatchWaves: Math.ceil(this.dispatched / this.options.limits.globalConcurrency),
      elapsedMs,
      timeline: [...this.timeline]
    };
  }

  private async dispatchReadyUnits(): Promise<void> {
    let progressed = true;
    while (progressed && this.active.size < this.options.limits.globalConcurrency && !this.paused && !this.cancelled) {
      progressed = false;
      for (const unit of this.runtime.values()) {
        if (unit.status !== "pending") continue;
        const readiness = await this.readiness(unit);
        if (readiness === "terminal") {
          progressed = true;
          continue;
        }
        if (readiness !== "ready") continue;
        this.dispatch(unit);
        progressed = true;
        if (this.active.size >= this.options.limits.globalConcurrency) break;
      }
    }
  }

  private async readiness(unit: RuntimeUnit): Promise<"ready" | "wait" | "terminal"> {
    const dependencies = unit.spec.dependencyWorkUnitIds.map((id) => this.runtime.get(id)!);
    if (!dependencies.every((dependency) => dependency.status === "accepted" || dependency.status === "waived")) return "wait";
    const indexAllowed = this.options.indexStateAllowed?.(unit.spec.indexState) ?? unit.spec.indexState === "complete";
    if (!indexAllowed) {
      unit.status = "blocked";
      unit.reason = `Index state ${unit.spec.indexState} does not satisfy workflow policy.`;
      unit.metrics.acceptanceOutcome = "failed";
      return "terminal";
    }
    if (!(await this.options.validateRevision(unit.spec))) {
      unit.status = "stale";
      unit.reason = "Pinned workspace or graph revision is stale.";
      unit.metrics.acceptanceOutcome = "failed";
      return "terminal";
    }
    if (!this.hasCapacity(unit) || this.hasActiveWriteConflict(unit)) return "wait";
    const costKey = modelLimitKey(unit.assignment.providerId, unit.assignment.modelId);
    const budget = this.options.limits.modelCostBudgets?.[costKey];
    const estimatedCost = unit.spec.routingDecision.estimatedCost;
    if (this.options.limits.globalCostBudget !== undefined && estimatedCost === null) {
      unit.status = "blocked";
      unit.reason = "Estimated model cost is unavailable, so the configured workflow budget cannot be verified.";
      unit.metrics.acceptanceOutcome = "failed";
      return "terminal";
    }
    if (
      this.options.limits.globalCostBudget !== undefined &&
      estimatedCost !== null &&
      this.estimatedSpend + estimatedCost > this.options.limits.globalCostBudget
    ) {
      unit.status = "blocked";
      unit.reason = "Estimated model cost exceeds the configured workflow budget.";
      unit.metrics.acceptanceOutcome = "failed";
      return "terminal";
    }
    if (budget !== undefined && estimatedCost !== null && (this.modelEstimatedSpend.get(costKey) ?? 0) + estimatedCost > budget) {
      unit.status = "blocked";
      unit.reason = `Estimated model cost exceeds the configured ${costKey} budget.`;
      unit.metrics.acceptanceOutcome = "failed";
      return "terminal";
    }
    return "ready";
  }

  private dispatch(unit: RuntimeUnit): void {
    unit.status = "running";
    unit.controller = new AbortController();
    this.dispatched += 1;
    const costKey = modelLimitKey(unit.assignment.providerId, unit.assignment.modelId);
    this.modelEstimatedSpend.set(costKey, (this.modelEstimatedSpend.get(costKey) ?? 0) + (unit.spec.routingDecision.estimatedCost ?? 0));
    this.estimatedSpend += unit.spec.routingDecision.estimatedCost ?? 0;
    this.timeline.push({ type: "dispatch", workUnitId: unit.spec.id, atMs: this.now() });
    const promise = this.executeWithPolicy(unit)
      .catch((error: unknown) => {
        if (this.cancelled || unit.controller?.signal.aborted) {
          unit.status = "cancelled";
          unit.reason = "Active provider call cancelled.";
          unit.metrics.acceptanceOutcome = "cancelled";
          return;
        }
        unit.status = "failed";
        unit.reason = error instanceof Error ? error.message : "Unknown scheduler execution failure.";
        unit.metrics.acceptanceOutcome = "failed";
      })
      .finally(() => {
        unit.controller = null;
        this.active.delete(unit.spec.id);
        this.timeline.push({ type: "complete", workUnitId: unit.spec.id, atMs: this.now() });
        this.wake();
      });
    this.active.set(unit.spec.id, promise);
    this.peakConcurrency = Math.max(this.peakConcurrency, this.active.size);
  }

  private async executeWithPolicy(unit: RuntimeUnit): Promise<void> {
    while (true) {
      if (this.cancelled) throw new DOMException("Cancelled", "AbortError");
      unit.attempts += 1;
      const attemptStartedAt = performance.now();
      try {
        const result = await this.options.execute({
          workUnitId: unit.spec.id,
          attempt: unit.attempts,
          scale: unit.scale,
          providerId: unit.assignment.providerId,
          modelId: unit.assignment.modelId,
          signal: unit.controller!.signal
        });
        unit.metrics.latencyMs += performance.now() - attemptStartedAt;
        unit.metrics.actualInputTokens += result.actualInputTokens;
        unit.metrics.actualOutputTokens += result.actualOutputTokens;
        unit.metrics.actualCost = actualCost(unit.metrics.actualInputTokens, unit.metrics.actualOutputTokens, unit.assignment);
        unit.metrics.testOutcome = result.testOutcome;
        unit.metrics.acceptanceOutcome = result.outcome === "accepted" ? "accepted" : "pending";
        unit.status = result.outcome;
        unit.reason = null;
        return;
      } catch (error) {
        unit.metrics.latencyMs += performance.now() - attemptStartedAt;
        if (!(error instanceof WorkflowSchedulerFailure)) throw error;
        unit.metrics.actualInputTokens += error.usage.inputTokens;
        unit.metrics.actualOutputTokens += error.usage.outputTokens;
        unit.metrics.actualCost = actualCost(unit.metrics.actualInputTokens, unit.metrics.actualOutputTokens, unit.assignment);
        if (error.kind === "stale_revision") {
          unit.status = "stale";
          unit.reason = error.message;
          unit.metrics.acceptanceOutcome = "failed";
          return;
        }
        if (error.kind === "contract_conflict") {
          unit.status = "blocked";
          unit.reason = error.message;
          unit.metrics.integrationFailureCount += 1;
          unit.metrics.acceptanceOutcome = "failed";
          return;
        }
        if (error.kind === "permanent") {
          unit.status = "failed";
          unit.reason = error.message;
          unit.metrics.acceptanceOutcome = "failed";
          return;
        }
        const canRetry = error.kind === "transient_provider" && unit.metrics.retryCount < this.options.limits.maxRetries;
        if (canRetry) {
          unit.metrics.retryCount += 1;
          this.timeline.push({ type: "retry", workUnitId: unit.spec.id, atMs: this.now() });
          continue;
        }
        const canEscalate =
          (error.kind === "context_insufficient" || error.kind === "validation_failure" || error.kind === "transient_provider") &&
          unit.metrics.escalationCount < this.options.limits.maxEscalations &&
          unit.scale !== "large" &&
          this.options.assignmentForScale;
        if (canEscalate) {
          unit.scale = nextScale(unit.scale);
          unit.assignment = this.options.assignmentForScale!(unit.scale, unit.spec);
          unit.metrics.escalationCount += 1;
          this.timeline.push({ type: "escalate", workUnitId: unit.spec.id, atMs: this.now() });
          continue;
        }
        unit.status = "failed";
        unit.reason = error.message;
        unit.metrics.acceptanceOutcome = "failed";
        return;
      }
    }
  }

  private hasCapacity(unit: RuntimeUnit): boolean {
    let providerActive = 0;
    let modelActive = 0;
    for (const activeId of this.active.keys()) {
      const active = this.runtime.get(activeId)!;
      if (active.assignment.providerId === unit.assignment.providerId) providerActive += 1;
      if (modelLimitKey(active.assignment.providerId, active.assignment.modelId) === modelLimitKey(unit.assignment.providerId, unit.assignment.modelId)) {
        modelActive += 1;
      }
    }
    const providerLimit = this.options.limits.providerConcurrency?.[unit.assignment.providerId] ?? unit.assignment.maxConcurrency;
    const modelLimit = this.options.limits.modelConcurrency?.[modelLimitKey(unit.assignment.providerId, unit.assignment.modelId)] ?? unit.assignment.maxConcurrency;
    return providerActive < providerLimit && modelActive < modelLimit;
  }

  private hasActiveWriteConflict(unit: RuntimeUnit): boolean {
    for (const activeId of this.active.keys()) {
      const active = this.runtime.get(activeId)!;
      if (proposalOnlyCoordinationAllowsOverlap(unit.spec, active.spec)) continue;
      if (writeScopesOverlap(unit.spec.plannedWriteScopes, active.spec.plannedWriteScopes)) return true;
    }
    return false;
  }

  private blockFailedDependencies(): void {
    for (const unit of this.runtime.values()) {
      if (unit.status !== "pending") continue;
      const blocking = unit.spec.dependencyWorkUnitIds
        .map((id) => this.runtime.get(id)!)
        .find((dependency) => ["failed", "blocked", "stale", "cancelled", "proposed"].includes(dependency.status));
      if (blocking) {
        unit.status = "blocked";
        unit.reason = `Required dependency ${blocking.spec.id} ended ${blocking.status}.`;
        unit.metrics.acceptanceOutcome = "failed";
      }
    }
  }

  private blockUnresolvableUnits(): void {
    for (const unit of this.runtime.values()) {
      if (unit.status === "pending") {
        unit.status = "blocked";
        unit.reason = "No dependency-ready dispatch path remains; the DAG may contain a cycle or an unsatisfied requirement.";
        unit.metrics.acceptanceOutcome = "failed";
      }
    }
  }

  private isTerminal(): boolean {
    return [...this.runtime.values()].every((unit) => !["pending", "running"].includes(unit.status));
  }

  private results(): ScheduledUnitResult[] {
    return [...this.runtime.values()].map((unit) => ({
      id: unit.spec.id,
      status: unit.status,
      scale: unit.scale,
      providerId: unit.assignment.providerId,
      modelId: unit.assignment.modelId,
      attempts: unit.attempts,
      reason: unit.reason,
      metrics: { ...unit.metrics }
    }));
  }

  private waitForProgress(): Promise<void> {
    return Promise.race([...this.active.values(), this.waitForWake()]).then(() => undefined);
  }

  private waitForWake(): Promise<void> {
    return new Promise((resolve) => {
      const waiter = () => {
        this.wakeWaiters.delete(waiter);
        resolve();
      };
      this.wakeWaiters.add(waiter);
    });
  }

  private wake(): void {
    for (const waiter of [...this.wakeWaiters]) waiter();
  }

  private now(): number {
    return performance.now() - this.startedAt;
  }
}

export function createWorkflowScheduler(options: WorkflowSchedulerOptions): WorkflowScheduler {
  return new WorkflowScheduler(options);
}

export function modelLimitKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function writeScopesOverlap(left: SourceWriteScope[], right: SourceWriteScope[]): boolean {
  for (const leftScope of left) {
    for (const rightScope of right) {
      if (leftScope.path !== rightScope.path) continue;
      if (leftScope.permission !== "edit" || rightScope.permission !== "edit") return true;
      if (leftScope.startLine === null || leftScope.endLine === null || rightScope.startLine === null || rightScope.endLine === null) return true;
      if (leftScope.startLine <= rightScope.endLine && rightScope.startLine <= leftScope.endLine) return true;
    }
  }
  return false;
}

export class WorkspaceRevisionApplyLock {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(input: {
    workspaceId: string;
    expectedRevision: string;
    observeRevision: () => string | Promise<string>;
    apply: () => T | Promise<T>;
    signal?: AbortSignal;
  }): Promise<T> {
    if (!input.workspaceId.trim() || !input.expectedRevision.trim()) {
      throw new Error("Workspace apply locks require workspace and expected revision identifiers.");
    }
    const prior = this.tails.get(input.workspaceId) ?? Promise.resolve();
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.catch(() => undefined).then(() => turn);
    this.tails.set(input.workspaceId, tail);
    await prior.catch(() => undefined);
    try {
      if (input.signal?.aborted) throw new DOMException("Apply cancelled before lock acquisition.", "AbortError");
      const observedRevision = await input.observeRevision();
      if (observedRevision !== input.expectedRevision) {
        throw new WorkflowSchedulerFailure(
          "stale_revision",
          `Apply expected revision ${input.expectedRevision} but observed ${observedRevision}.`
        );
      }
      return await input.apply();
    } finally {
      release();
      if (this.tails.get(input.workspaceId) === tail) this.tails.delete(input.workspaceId);
    }
  }
}

function proposalOnlyCoordinationAllowsOverlap(left: ScheduledWorkUnit, right: ScheduledWorkUnit): boolean {
  return (
    left.executionMode === "proposal_only" &&
    right.executionMode === "proposal_only" &&
    (left.coordinatedProposalUnitIds?.includes(right.id) ?? false) &&
    (right.coordinatedProposalUnitIds?.includes(left.id) ?? false)
  );
}

function requiredAssignment(decision: ModelRoutingDecision): NonNullable<ModelRoutingDecision["assignment"]> {
  if (!decision.assignment) throw new Error(`Routing decision ${decision.id} has no provider/model assignment.`);
  return decision.assignment;
}

function nextScale(scale: AgentScale): AgentScale {
  return scale === "small" ? "medium" : "large";
}

function emptyMetrics(outcome: NonNullable<ModelRoutingDecision["metrics"]>["acceptanceOutcome"]): NonNullable<ModelRoutingDecision["metrics"]> {
  return {
    actualInputTokens: 0,
    actualOutputTokens: 0,
    actualCost: null,
    latencyMs: 0,
    retryCount: 0,
    escalationCount: 0,
    integrationFailureCount: 0,
    acceptanceOutcome: outcome,
    testOutcome: "not_run"
  };
}

function actualCost(
  inputTokens: number,
  outputTokens: number,
  assignment: NonNullable<ModelRoutingDecision["assignment"]>
): number | null {
  if (assignment.inputPricePerMillion === null || assignment.outputPricePerMillion === null) return null;
  return (inputTokens * assignment.inputPricePerMillion + outputTokens * assignment.outputPricePerMillion) / 1_000_000;
}

function scheduleStatus(units: ScheduledUnitResult[], cancelled: boolean): WorkflowScheduleResult["status"] {
  if (cancelled) return "cancelled";
  if (units.every((unit) => unit.status === "accepted" || unit.status === "waived")) return "succeeded";
  if (units.some((unit) => unit.status === "accepted" || unit.status === "proposed" || unit.status === "waived")) return "partial";
  return "failed";
}

function validateOptions(options: WorkflowSchedulerOptions): void {
  if (!Number.isInteger(options.limits.globalConcurrency) || options.limits.globalConcurrency < 1) {
    throw new RangeError("Workflow global concurrency must be a positive integer.");
  }
  for (const [label, value] of Object.entries({
    maxRetries: options.limits.maxRetries,
    maxEscalations: options.limits.maxEscalations
  })) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
  }
  const ids = new Set<string>();
  for (const unit of options.units) {
    if (ids.has(unit.id)) throw new Error(`Duplicate scheduled work unit: ${unit.id}.`);
    ids.add(unit.id);
  }
  for (const unit of options.units) {
    for (const dependencyId of unit.dependencyWorkUnitIds) {
      if (!ids.has(dependencyId)) throw new Error(`Work unit ${unit.id} references missing dependency ${dependencyId}.`);
      if (dependencyId === unit.id) throw new Error(`Work unit ${unit.id} cannot depend on itself.`);
    }
  }
  for (const [name, limit] of Object.entries({
    ...(options.limits.providerConcurrency ?? {}),
    ...(options.limits.modelConcurrency ?? {})
  })) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`Concurrency limit ${name} must be a positive integer.`);
  }
}
