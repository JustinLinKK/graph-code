import type { SourceWriteScope } from "@graphcode/graph-model";
import {
  workUnitContextRetrievalRequestSchema,
  workUnitContextSchema,
  type WorkUnitContext,
  type WorkUnitContextRetrievalRequest
} from "./contracts";

export class WorkUnitContextEscalationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkUnitContextEscalationRequiredError";
  }
}

export function validateWorkUnitContextRetrievalRequest(
  rawContext: WorkUnitContext,
  rawRequest: WorkUnitContextRetrievalRequest
): WorkUnitContextRetrievalRequest {
  const context = workUnitContextSchema.parse(rawContext);
  const request = workUnitContextRetrievalRequestSchema.parse(rawRequest);
  if (request.workUnitId !== context.workUnit.id) {
    throw new Error(`Retrieval request ${request.requestId} belongs to another work unit.`);
  }
  const remaining = {
    maxInputTokens: Math.max(0, context.budget.maxInputTokens - context.tokenUsage.estimatedInputTokens),
    maxSourceTokens: Math.max(0, context.budget.maxSourceTokens - context.tokenUsage.sourceTokens),
    maxGraphTokens: Math.max(0, context.budget.maxGraphTokens - context.tokenUsage.graphTokens),
    maxContractTokens: Math.max(0, context.budget.maxContractTokens - context.tokenUsage.contractTokens),
    maxFiles: Math.max(0, context.budget.maxFiles - new Set(context.sources.filter((source) => source.availability === "present").map((source) => source.path)).size),
    maxNodes: Math.max(0, context.budget.maxNodes - context.nodes.length),
    maxEdges: Math.max(0, context.budget.maxEdges - context.edges.length)
  };
  for (const key of Object.keys(remaining) as Array<keyof typeof remaining>) {
    if (request.remainingBudget[key] > remaining[key]) {
      throw new RangeError(
        `Retrieval request ${request.requestId} claims ${key}=${request.remainingBudget[key]}, exceeding the compiler's remaining ${remaining[key]}.`
      );
    }
  }
  for (const source of request.requestedSources.filter((candidate) => candidate.intent === "write")) {
    const requestedScope: SourceWriteScope = {
      path: source.path,
      startLine: source.startLine,
      endLine: source.endLine,
      symbolId: null,
      permission: "edit"
    };
    if (!context.allowedWrites.some((allowed) => scopeContains(allowed, requestedScope))) {
      throw new WorkUnitContextEscalationRequiredError(
        `Retrieval request ${request.requestId} crosses write ownership at ${source.path}; create or escalate a work unit instead of expanding read context.`
      );
    }
  }
  return request;
}

function scopeContains(planned: SourceWriteScope, requested: SourceWriteScope): boolean {
  if (planned.path !== requested.path || planned.permission !== requested.permission) return false;
  if (planned.startLine === null || planned.endLine === null) return true;
  if (requested.startLine === null || requested.endLine === null) return false;
  return requested.startLine >= planned.startLine && requested.endLine <= planned.endLine;
}
