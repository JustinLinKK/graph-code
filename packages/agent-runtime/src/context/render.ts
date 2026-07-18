import type { CodingWorkUnit, SourceWriteScope } from "@graphcode/graph-model";
import {
  renderedWorkUnitContextSchema,
  workUnitContextSchema,
  workUnitContextShadowComparisonSchema,
  type RenderedWorkUnitContext,
  type WorkUnitContext,
  type WorkUnitContextShadowComparison
} from "./contracts";

export type WorkUnitContextRenderOptions = {
  provider: RenderedWorkUnitContext["provider"];
  purpose: RenderedWorkUnitContext["purpose"];
};

export function renderWorkUnitContext(
  rawContext: WorkUnitContext,
  options: WorkUnitContextRenderOptions = { provider: "generic", purpose: "coding" }
): RenderedWorkUnitContext {
  const context = workUnitContextSchema.parse(rawContext);
  const rendered = renderUnchecked(context, options);
  if (rendered.estimatedInputTokens > context.budget.maxInputTokens) {
    throw new RangeError(
      `Rendered work-unit context requires ${rendered.estimatedInputTokens} estimated tokens, exceeding maxInputTokens=${context.budget.maxInputTokens}.`
    );
  }
  return renderedWorkUnitContextSchema.parse(rendered);
}

export function estimateRenderedWorkUnitContextTokens(context: WorkUnitContext, options: WorkUnitContextRenderOptions): number {
  return renderUnchecked(context, options).estimatedInputTokens;
}

export function compareWorkUnitContextToLegacy(
  rawContext: WorkUnitContext,
  input: { legacyCodingPromptCharacters: number; legacyReviewPromptCharacters: number }
): WorkUnitContextShadowComparison {
  const context = workUnitContextSchema.parse(rawContext);
  const coding = renderWorkUnitContext(context, { provider: "generic", purpose: "coding" });
  const review = renderWorkUnitContext(context, { provider: "generic", purpose: "review" });
  const isolatedPromptCharacters = Math.max(
    coding.systemPrompt.length + coding.userPrompt.length,
    review.systemPrompt.length + review.userPrompt.length
  );
  const isolatedEstimatedTokens = Math.max(coding.estimatedInputTokens, review.estimatedInputTokens);
  const legacyCodingTokens = Math.ceil(Math.max(0, input.legacyCodingPromptCharacters) / 4);
  const legacyReviewTokens = Math.ceil(Math.max(0, input.legacyReviewPromptCharacters) / 4);
  return workUnitContextShadowComparisonSchema.parse({
    workUnitId: context.workUnit.id,
    isolatedPromptCharacters,
    isolatedEstimatedTokens,
    legacyCodingPromptCharacters: Math.max(0, input.legacyCodingPromptCharacters),
    legacyReviewPromptCharacters: Math.max(0, input.legacyReviewPromptCharacters),
    codingTokenReductionRatio: reductionRatio(legacyCodingTokens, isolatedEstimatedTokens),
    reviewTokenReductionRatio: reductionRatio(legacyReviewTokens, isolatedEstimatedTokens),
    fullProjectReadUsed: false
  });
}

export function validateActualWriteScopes(workUnit: CodingWorkUnit, actualWriteScopes: SourceWriteScope[]): void {
  for (const actual of actualWriteScopes) {
    const authorized = workUnit.plannedWriteScopes.some((planned) => scopeContains(planned, actual));
    if (!authorized) {
      throw new Error(
        `Work unit ${workUnit.id} cannot write ${formatScope(actual)} outside its declared ownership${
          workUnit.selectedScale === "small" ? "; small-tier escalation is required" : ""
        }.`
      );
    }
  }
}

function renderUnchecked(context: WorkUnitContext, options: WorkUnitContextRenderOptions): RenderedWorkUnitContext {
  const systemPrompt = providerSystemPrompt(options);
  const providerContext = compactProviderContext(context);
  const userPrompt = [
    `GRAPHCODE_WORK_UNIT_CONTEXT_JSON ${context.compilerVersion}`,
    "Treat this validated JSON capsule as the complete authorized context for the work unit. Do not infer access to omitted repository regions.",
    JSON.stringify(providerContext)
  ].join("\n\n");
  return {
    provider: options.provider,
    purpose: options.purpose,
    systemPrompt,
    userPrompt,
    estimatedInputTokens: estimateTextTokens(`${systemPrompt}\n\n${userPrompt}`)
  };
}

function compactProviderContext(context: WorkUnitContext) {
  return {
    schemaVersion: context.schemaVersion,
    compilerVersion: context.compilerVersion,
    workflowId: context.workflowId,
    projectId: context.projectId,
    task: context.task,
    workUnit: {
      id: context.workUnit.id,
      title: context.workUnit.title,
      objective: context.workUnit.objective,
      scale: context.scale,
      ownedNodeIds: context.workUnit.ownedNodeIds,
      parentWorkUnitId: context.workUnit.parentWorkUnitId,
      dependencyWorkUnitIds: context.workUnit.dependencyWorkUnitIds,
      coordinationWorkUnitIds: context.workUnit.coordinationWorkUnitIds,
      allowedWrites: context.allowedWrites,
      expectedOutputs: context.outputRequirements.expected
    },
    revision: context.revision,
    nodes: context.nodes.map(({ estimatedTokens: _estimatedTokens, ...node }) => node),
    edges: context.edges.map(({ estimatedTokens: _estimatedTokens, ...edge }) => edge),
    sources: context.sources.map(({ estimatedTokens: _estimatedTokens, ...source }) => source),
    contracts: context.contracts,
    upstreamAccepted: context.upstreamAccepted.map(({ estimatedTokens: _estimatedTokens, ...summary }) => summary),
    execution: context.execution.map(({ estimatedTokens: _estimatedTokens, ...execution }) => execution),
    architectureSummary: context.architectureSummary,
    omissions: context.omissions,
    responseRequirements: context.outputRequirements.responseFormat,
    provenance: context.provenance
  };
}

function providerSystemPrompt(options: WorkUnitContextRenderOptions): string {
  const providerInstruction =
    options.provider === "openai"
      ? "Follow the structured work-unit capsule exactly and return only the requested proposal envelope."
      : options.provider === "anthropic"
        ? "Use the structured work-unit capsule as the authoritative bounded evidence set."
        : options.provider === "google"
          ? "Ground the response only in the structured work-unit capsule and its cited provenance."
          : "Use only the structured work-unit capsule and preserve every explicit boundary.";
  const purposeInstruction =
    options.purpose === "review"
      ? "Review the proposed change against ownership, contracts, revisions, omissions, and required validation. Do not broaden write authority."
      : "Produce a structured proposal, not a direct workspace mutation. Writes must remain inside allowedWrites; crossing a boundary requires escalation or a new work unit.";
  return `${providerInstruction} ${purposeInstruction}`;
}

function scopeContains(planned: SourceWriteScope, actual: SourceWriteScope): boolean {
  if (planned.path !== actual.path || planned.permission !== actual.permission) return false;
  if (planned.startLine === null || planned.endLine === null) return true;
  if (actual.startLine === null || actual.endLine === null) return false;
  return actual.startLine >= planned.startLine && actual.endLine <= planned.endLine;
}

function formatScope(scope: SourceWriteScope): string {
  return `${scope.permission}:${scope.path}:${scope.startLine ?? "*"}-${scope.endLine ?? "*"}`;
}

function reductionRatio(legacyTokens: number, isolatedTokens: number): number {
  return legacyTokens === 0 ? 0 : (legacyTokens - isolatedTokens) / legacyTokens;
}

export function estimateTextTokens(value: string): number {
  return Math.ceil(value.length / 4);
}
