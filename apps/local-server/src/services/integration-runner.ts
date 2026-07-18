import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  sourceWriteScopeSchema,
  workspaceRelativePathSchema,
  type CodingWorkflowOrchestration,
  type ContractUpdate,
  type SourceWriteScope
} from "@graphcode/graph-model";
import {
  reconcileInterfaceContracts,
  type ContractReconciliationResult,
  type ProposedContractUpdate
} from "./contract-reconciler";

const execFileAsync = promisify(execFile);

export type DiffOperation = "edit" | "create" | "delete" | "rename";

export type ParsedDiffHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
};

export type ParsedDiffFile = {
  oldPath: string | null;
  newPath: string | null;
  operation: DiffOperation;
  hunks: ParsedDiffHunk[];
};

export type ParsedUnifiedDiff = {
  files: ParsedDiffFile[];
  actualWriteScopes: SourceWriteScope[];
};

export type IntegrationProposal = {
  proposalId: string;
  workUnitId: string;
  diff: string;
  contractUpdates?: ContractUpdate[];
  outputSummary?: string;
};

export type IntegrationCheckKind =
  | "actual_write_set"
  | "write_authorization"
  | "stale_revision"
  | "overlap_conflict"
  | "interface_contract"
  | "combined_patch"
  | "targeted_checks";

export type IntegrationCheckResult = {
  kind: IntegrationCheckKind;
  status: "passed" | "failed" | "blocked";
  itemId: string | null;
  diagnostics: Record<string, unknown>;
};

export type IntegrationValidationResult = {
  passed: boolean;
  diagnostics: string[];
  commandResults?: Array<{ command: string; passed: boolean; output: string }>;
};

export type BoundedIntegrationAgentContext = {
  schemaVersion: 1;
  workflowId: string;
  layerIndex: number;
  parent: { workUnitId: string | null; objective: string };
  children: Array<{
    workUnitId: string;
    objective: string;
    outputSummary: string;
    diff: string;
    contractUpdates: ContractUpdate[];
  }>;
  contracts: CodingWorkflowOrchestration["interfaceContracts"];
  failures: IntegrationCheckResult[];
  relevantSource: Array<{ path: string; startLine: number | null; endLine: number | null; content: string }>;
  authority: "propose_reconciliation_only";
};

export type IntegrationGateResult = {
  passed: boolean;
  applicable: boolean;
  checks: IntegrationCheckResult[];
  parsedProposals: Array<IntegrationProposal & ParsedUnifiedDiff>;
  combinedDiff: string;
  contractReconciliation: ContractReconciliationResult;
  integrationAgentInvoked: boolean;
  integrationAgentResponse: string | null;
};

export type RunIntegrationGateOptions = {
  orchestration: CodingWorkflowOrchestration;
  layerIndex: number;
  proposals: IntegrationProposal[];
  currentSourceHashes: Record<string, string>;
  validationCommands?: string[];
  validateCombinedPatch: (input: {
    combinedDiff: string;
    parsedFiles: ParsedDiffFile[];
    commands: string[];
  }) => Promise<IntegrationValidationResult>;
  invokeIntegrationAgent?: (input: {
    scale: "medium" | "large";
    context: BoundedIntegrationAgentContext;
  }) => Promise<string>;
  relevantSource?: BoundedIntegrationAgentContext["relevantSource"];
};

export async function runIntegrationGate(options: RunIntegrationGateOptions): Promise<IntegrationGateResult> {
  const checks: IntegrationCheckResult[] = [];
  const unitById = new Map(options.orchestration.workUnits.map((unit) => [unit.id, unit]));
  const parsedProposals: Array<IntegrationProposal & ParsedUnifiedDiff> = [];
  const parseFailures: Array<{ proposalId: string; workUnitId: string; error: string }> = [];
  const requiredLayerUnits = options.orchestration.workUnits.filter(
    (unit) => unit.layerIndex === options.layerIndex && unit.status !== "applied" && unit.status !== "skipped"
  );
  const proposalIdsByUnit = new Map<string, string[]>();
  for (const proposal of options.proposals) {
    const ids = proposalIdsByUnit.get(proposal.workUnitId) ?? [];
    ids.push(proposal.proposalId);
    proposalIdsByUnit.set(proposal.workUnitId, ids);
  }
  for (const unit of requiredLayerUnits) {
    const proposalIds = proposalIdsByUnit.get(unit.id) ?? [];
    if (proposalIds.length !== 1) {
      parseFailures.push({
        proposalId: proposalIds.join(",") || "missing",
        workUnitId: unit.id,
        error: proposalIds.length === 0
          ? `Required work unit ${unit.id} has no proposal.`
          : `Required work unit ${unit.id} has multiple proposals.`
      });
    }
  }

  for (const proposal of options.proposals) {
    const unit = unitById.get(proposal.workUnitId);
    if (!unit || unit.layerIndex !== options.layerIndex) {
      parseFailures.push({
        proposalId: proposal.proposalId,
        workUnitId: proposal.workUnitId,
        error: `Proposal ${proposal.proposalId} does not belong to layer ${options.layerIndex}.`
      });
      continue;
    }
    try {
      parsedProposals.push({ ...proposal, ...parseUnifiedDiff(proposal.diff) });
    } catch (error) {
      parseFailures.push({
        proposalId: proposal.proposalId,
        workUnitId: proposal.workUnitId,
        error: error instanceof Error ? error.message : "Unified diff parsing failed."
      });
    }
  }
  checks.push({
    kind: "actual_write_set",
    status:
      parseFailures.length === 0 &&
      parsedProposals.length === options.proposals.length &&
      parsedProposals.length === requiredLayerUnits.length &&
      parsedProposals.length > 0
        ? "passed"
        : "failed",
    itemId: null,
    diagnostics: {
      proposalCount: options.proposals.length,
      proposalIds: Object.fromEntries(options.proposals.map((proposal) => [proposal.workUnitId, proposal.proposalId])),
      requiredWorkUnitCount: requiredLayerUnits.length,
      parsedProposalCount: parsedProposals.length,
      failures: parseFailures,
      actualWriteScopes: Object.fromEntries(parsedProposals.map((proposal) => [proposal.workUnitId, proposal.actualWriteScopes]))
    }
  });

  const authorizationFailures: Array<{ workUnitId: string; scope: SourceWriteScope }> = [];
  for (const proposal of parsedProposals) {
    const unit = unitById.get(proposal.workUnitId)!;
    for (const actual of proposal.actualWriteScopes) {
      if (!unit.plannedWriteScopes.some((planned) => scopeContains(planned, actual))) {
        authorizationFailures.push({ workUnitId: proposal.workUnitId, scope: actual });
      }
    }
  }
  checks.push({
    kind: "write_authorization",
    status: authorizationFailures.length === 0 ? "passed" : "failed",
    itemId: null,
    diagnostics: { failures: authorizationFailures }
  });

  const staleFiles: Array<{ workUnitId: string; path: string; expected: string | null; observed: string | null; operation: DiffOperation }> = [];
  for (const proposal of parsedProposals) {
    const unit = unitById.get(proposal.workUnitId)!;
    for (const file of proposal.files) {
      const sourcePath = file.oldPath ?? file.newPath!;
      const expected = unit.baseRevision.sourceHashes[sourcePath] ?? null;
      const observed = options.currentSourceHashes[sourcePath] ?? null;
      if (file.operation === "create") {
        if (expected !== null || observed !== null) staleFiles.push({ workUnitId: unit.id, path: sourcePath, expected, observed, operation: file.operation });
      } else if (expected === null || expected !== observed) {
        staleFiles.push({ workUnitId: unit.id, path: sourcePath, expected, observed, operation: file.operation });
      }
      if (file.operation === "rename" && file.newPath && file.newPath !== file.oldPath && options.currentSourceHashes[file.newPath]) {
        staleFiles.push({
          workUnitId: unit.id,
          path: file.newPath,
          expected: null,
          observed: options.currentSourceHashes[file.newPath],
          operation: file.operation
        });
      }
    }
  }
  checks.push({
    kind: "stale_revision",
    status: staleFiles.length === 0 ? "passed" : "failed",
    itemId: null,
    diagnostics: { staleFiles }
  });

  const overlaps = detectProposalOverlaps(parsedProposals);
  checks.push({
    kind: "overlap_conflict",
    status: overlaps.length === 0 ? "passed" : "failed",
    itemId: null,
    diagnostics: { overlaps }
  });

  const contractUpdates: ProposedContractUpdate[] = parsedProposals.flatMap((proposal) =>
    (proposal.contractUpdates ?? []).map((update) => ({ ...update, workUnitId: proposal.workUnitId }))
  );
  const contractReconciliation = reconcileInterfaceContracts(options.orchestration, contractUpdates);
  const currentLayerUnitIds = new Set(requiredLayerUnits.map((unit) => unit.id));
  const blockingContractIssues = contractReconciliation.issues.filter(
    (issue) => issue.code !== "contract_change_unacknowledged" || issue.workUnitIds.some((workUnitId) => currentLayerUnitIds.has(workUnitId) && contractReconciliation.blockedWorkUnitIds.includes(workUnitId))
  );
  checks.push({
    kind: "interface_contract",
    status: blockingContractIssues.length === 0 ? "passed" : "failed",
    itemId: null,
    diagnostics: {
      issues: contractReconciliation.issues,
      blockingIssues: blockingContractIssues,
      blockedWorkUnitIds: contractReconciliation.blockedWorkUnitIds
    }
  });

  const deterministicPassed = checks.every((check) => check.status === "passed");
  const combinedDiff = deterministicPassed ? combineIndependentDiffs(parsedProposals) : "";
  let integrationAgentInvoked = false;
  let integrationAgentResponse: string | null = null;
  if (!deterministicPassed && options.invokeIntegrationAgent) {
    integrationAgentInvoked = true;
    const context = buildBoundedIntegrationAgentContext({
      orchestration: options.orchestration,
      layerIndex: options.layerIndex,
      proposals: options.proposals,
      checks,
      contracts: contractReconciliation.contracts,
      relevantSource: options.relevantSource ?? []
    });
    integrationAgentResponse = await options.invokeIntegrationAgent({ scale: integrationScale(options.orchestration, options.layerIndex), context });
  }

  if (!deterministicPassed) {
    checks.push({
      kind: "combined_patch",
      status: "blocked",
      itemId: null,
      diagnostics: {
        reason: "Deterministic preflight failed; a combined patch was not constructed.",
        integrationAgentInvoked,
        integrationAgentResponse: integrationAgentResponse?.slice(0, 12000) ?? null
      }
    });
    checks.push({
      kind: "targeted_checks",
      status: "blocked",
      itemId: null,
      diagnostics: { reason: "Targeted checks require a valid combined patch." }
    });
    return {
      passed: false,
      applicable: false,
      checks,
      parsedProposals,
      combinedDiff,
      contractReconciliation,
      integrationAgentInvoked,
      integrationAgentResponse
    };
  }

  const validation = await options.validateCombinedPatch({
    combinedDiff,
    parsedFiles: parsedProposals.flatMap((proposal) => proposal.files),
    commands: options.validationCommands ?? []
  });
  checks.push({
    kind: "combined_patch",
    status: validation.passed ? "passed" : "failed",
    itemId: null,
    diagnostics: { diagnostics: validation.diagnostics }
  });
  const commandsPassed = validation.passed && (validation.commandResults ?? []).every((result) => result.passed);
  checks.push({
    kind: "targeted_checks",
    status: commandsPassed ? "passed" : "failed",
    itemId: null,
    diagnostics: { commandResults: validation.commandResults ?? [] }
  });
  const passed = checks.every((check) => check.status === "passed");
  return {
    passed,
    applicable: passed,
    checks,
    parsedProposals,
    combinedDiff,
    contractReconciliation,
    integrationAgentInvoked,
    integrationAgentResponse
  };
}

export function parseUnifiedDiff(diff: string): ParsedUnifiedDiff {
  if (!diff.trim()) throw new Error("Proposal diff is empty.");
  const files: ParsedDiffFile[] = [];
  let current: MutableDiffFile | null = null;
  const finish = () => {
    if (!current) return;
    const file = finishDiffFile(current);
    files.push(file);
    current = null;
  };

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finish();
      current = { oldPath: null, newPath: null, renameFrom: null, renameTo: null, hunks: [], sawOldHeader: false, sawNewHeader: false };
      continue;
    }
    if (line.startsWith("--- ")) {
      if (current?.sawNewHeader && current.hunks.length > 0) finish();
      current ??= { oldPath: null, newPath: null, renameFrom: null, renameTo: null, hunks: [], sawOldHeader: false, sawNewHeader: false };
      current.oldPath = normalizeDiffPath(line.slice(4));
      current.sawOldHeader = true;
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (!current) throw new Error("Unified diff has a new-file header without an old-file header.");
      current.newPath = normalizeDiffPath(line.slice(4));
      current.sawNewHeader = true;
      continue;
    }
    if (line.startsWith("rename from ")) {
      current ??= { oldPath: null, newPath: null, renameFrom: null, renameTo: null, hunks: [], sawOldHeader: false, sawNewHeader: false };
      current.renameFrom = normalizeRequiredDiffPath(line.slice("rename from ".length));
      continue;
    }
    if (line.startsWith("rename to ")) {
      if (!current) throw new Error("Unified diff has a rename destination without a source.");
      current.renameTo = normalizeRequiredDiffPath(line.slice("rename to ".length));
      continue;
    }
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      if (!current) throw new Error("Unified diff has a hunk without a file header.");
      current.hunks.push({
        oldStart: Number.parseInt(hunk[1], 10),
        oldCount: hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10),
        newStart: Number.parseInt(hunk[3], 10),
        newCount: hunk[4] === undefined ? 1 : Number.parseInt(hunk[4], 10)
      });
    }
  }
  finish();
  if (files.length === 0) throw new Error("Proposal did not contain a parseable unified diff file.");
  return { files, actualWriteScopes: files.flatMap(actualScopesForFile) };
}

export function combineIndependentDiffs(proposals: Array<Pick<IntegrationProposal, "diff" | "workUnitId">>): string {
  return [...proposals]
    .sort((left, right) => left.workUnitId.localeCompare(right.workUnitId))
    .map((proposal) => proposal.diff.trimEnd())
    .join("\n")
    .concat("\n");
}

export function buildBoundedIntegrationAgentContext(input: {
  orchestration: CodingWorkflowOrchestration;
  layerIndex: number;
  proposals: IntegrationProposal[];
  checks: IntegrationCheckResult[];
  contracts: CodingWorkflowOrchestration["interfaceContracts"];
  relevantSource: BoundedIntegrationAgentContext["relevantSource"];
}): BoundedIntegrationAgentContext {
  const unitById = new Map(input.orchestration.workUnits.map((unit) => [unit.id, unit]));
  const layerUnits = input.orchestration.workUnits.filter((unit) => unit.layerIndex === input.layerIndex);
  const parentIds = [...new Set(layerUnits.map((unit) => unit.parentWorkUnitId).filter((id): id is string => Boolean(id)))];
  const parent = parentIds.length === 1 ? unitById.get(parentIds[0]) ?? null : null;
  const childIds = new Set(input.proposals.map((proposal) => proposal.workUnitId));
  const relevantContracts = input.contracts.filter(
    (contract) => childIds.has(contract.producerWorkUnitId) || childIds.has(contract.consumerWorkUnitId)
  );
  return {
    schemaVersion: 1,
    workflowId: input.orchestration.workflowId,
    layerIndex: input.layerIndex,
    parent: {
      workUnitId: parent?.id ?? null,
      objective: parent?.objective ?? `Reconcile workflow layer ${input.layerIndex}.`
    },
    children: input.proposals.map((proposal) => ({
      workUnitId: proposal.workUnitId,
      objective: unitById.get(proposal.workUnitId)?.objective ?? "Unknown child objective.",
      outputSummary: (proposal.outputSummary ?? "Child produced a code proposal.").slice(0, 4000),
      diff: proposal.diff.slice(0, 30000),
      contractUpdates: proposal.contractUpdates ?? []
    })),
    contracts: relevantContracts,
    failures: input.checks.filter((check) => check.status !== "passed"),
    relevantSource: input.relevantSource.map((source) => ({ ...source, content: source.content.slice(0, 12000) })),
    authority: "propose_reconciliation_only"
  };
}

export async function readCurrentSourceHashes(workspaceRoot: string, relativePaths: string[]): Promise<Record<string, string>> {
  const root = path.resolve(workspaceRoot);
  const result: Record<string, string> = {};
  for (const relativePath of [...new Set(relativePaths)].sort()) {
    workspaceRelativePathSchema.parse(relativePath);
    const absolutePath = path.resolve(root, relativePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) throw new Error(`Source path escapes workspace: ${relativePath}.`);
    try {
      const content = await fsp.readFile(absolutePath);
      result[relativePath] = crypto.createHash("sha1").update(content).digest("hex");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return result;
}

export async function validateCombinedPatchInTemporaryWorkspace(input: {
  workspaceRoot: string;
  combinedDiff: string;
  commands: string[];
  timeoutMs?: number;
}): Promise<IntegrationValidationResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "graphcode-integration-"));
  const diagnostics: string[] = [];
  const commandResults: Array<{ command: string; passed: boolean; output: string }> = [];
  try {
    await fsp.cp(workspaceRoot, temporaryRoot, {
      recursive: true,
      dereference: false,
      filter: (source) => {
        const relative = path.relative(workspaceRoot, source);
        if (!relative) return true;
        const top = relative.split(path.sep)[0];
        return ![".git", ".graphcode", "node_modules", "dist", ".turbo", "coverage"].includes(top);
      }
    });
    const sourceNodeModules = path.join(workspaceRoot, "node_modules");
    const targetNodeModules = path.join(temporaryRoot, "node_modules");
    if (fs.existsSync(sourceNodeModules)) {
      await fsp.symlink(sourceNodeModules, targetNodeModules, process.platform === "win32" ? "junction" : "dir");
    }
    const patchPath = path.join(temporaryRoot, ".graphcode-integration.patch");
    await fsp.writeFile(patchPath, input.combinedDiff, "utf8");
    try {
      await execFileAsync("git", ["apply", "--whitespace=nowarn", patchPath], {
        cwd: temporaryRoot,
        timeout: input.timeoutMs ?? 120000,
        maxBuffer: 10 * 1024 * 1024
      });
      diagnostics.push("Combined patch applied cleanly in an isolated temporary workspace.");
    } catch (error) {
      diagnostics.push(commandError(error));
      return { passed: false, diagnostics, commandResults };
    }
    for (const command of input.commands) {
      try {
        const { stdout, stderr } = await runShellCommand(command, temporaryRoot, input.timeoutMs ?? 120000);
        commandResults.push({ command, passed: true, output: `${stdout}${stderr}`.slice(-12000) });
      } catch (error) {
        commandResults.push({ command, passed: false, output: commandError(error).slice(-12000) });
        return { passed: false, diagnostics, commandResults };
      }
    }
    return { passed: true, diagnostics, commandResults };
  } finally {
    await fsp.rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function applyCombinedPatchToWorkspace(input: {
  workspaceRoot: string;
  combinedDiff: string;
  timeoutMs?: number;
}): Promise<void> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "graphcode-apply-"));
  const patchPath = path.join(temporaryDirectory, "layer.patch");
  try {
    await fsp.writeFile(patchPath, input.combinedDiff, "utf8");
    await execFileAsync("git", ["apply", "--check", "--whitespace=nowarn", patchPath], {
      cwd: workspaceRoot,
      timeout: input.timeoutMs ?? 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    await execFileAsync("git", ["apply", "--whitespace=nowarn", patchPath], {
      cwd: workspaceRoot,
      timeout: input.timeoutMs ?? 60000,
      maxBuffer: 10 * 1024 * 1024
    });
  } finally {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

type MutableDiffFile = {
  oldPath: string | null;
  newPath: string | null;
  renameFrom: string | null;
  renameTo: string | null;
  hunks: ParsedDiffHunk[];
  sawOldHeader: boolean;
  sawNewHeader: boolean;
};

function finishDiffFile(raw: MutableDiffFile): ParsedDiffFile {
  const oldPath = raw.renameFrom ?? raw.oldPath;
  const newPath = raw.renameTo ?? raw.newPath;
  if (!oldPath && !newPath) throw new Error("Unified diff file has no source or destination path.");
  const operation: DiffOperation = raw.renameFrom || raw.renameTo || (oldPath && newPath && oldPath !== newPath)
    ? "rename"
    : oldPath === null
      ? "create"
      : newPath === null
        ? "delete"
        : "edit";
  if (operation !== "rename" && raw.hunks.length === 0) throw new Error(`Unified diff ${operation} for ${newPath ?? oldPath} has no hunks.`);
  if (operation === "rename" && (!oldPath || !newPath)) throw new Error("Rename diffs require both source and destination paths.");
  return { oldPath, newPath, operation, hunks: raw.hunks };
}

function actualScopesForFile(file: ParsedDiffFile): SourceWriteScope[] {
  if (file.operation === "rename") {
    return [file.oldPath!, file.newPath!].map((path) => sourceWriteScopeSchema.parse({
      path,
      startLine: null,
      endLine: null,
      symbolId: null,
      permission: "rename"
    }));
  }
  const targetPath = file.operation === "delete" ? file.oldPath! : file.newPath!;
  if (file.operation === "create" || file.operation === "delete") {
    return [sourceWriteScopeSchema.parse({ path: targetPath, startLine: null, endLine: null, symbolId: null, permission: file.operation })];
  }
  return file.hunks.map((hunk) => {
    const count = Math.max(1, hunk.newCount || hunk.oldCount);
    return sourceWriteScopeSchema.parse({
      path: targetPath,
      startLine: Math.max(1, hunk.newStart),
      endLine: Math.max(1, hunk.newStart) + count - 1,
      symbolId: null,
      permission: "edit"
    });
  });
}

function normalizeRequiredDiffPath(value: string): string {
  const normalized = normalizeDiffPath(value);
  if (!normalized) throw new Error("Rename path cannot be /dev/null.");
  return normalized;
}

function normalizeDiffPath(value: string): string | null {
  let candidate = value.split("\t", 1)[0].trim();
  if (candidate === "/dev/null") return null;
  if (candidate.startsWith('"') && candidate.endsWith('"')) {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      throw new Error(`Unified diff contains an invalid quoted path: ${candidate}.`);
    }
  }
  candidate = candidate.replace(/^[ab]\//, "");
  workspaceRelativePathSchema.parse(candidate);
  return candidate;
}

function scopeContains(planned: SourceWriteScope, actual: SourceWriteScope): boolean {
  if (planned.path !== actual.path || planned.permission !== actual.permission) return false;
  if (planned.startLine === null || planned.endLine === null) return true;
  if (actual.startLine === null || actual.endLine === null) return false;
  return actual.startLine >= planned.startLine && actual.endLine <= planned.endLine;
}

function detectProposalOverlaps(proposals: Array<IntegrationProposal & ParsedUnifiedDiff>) {
  const overlaps: Array<{ leftWorkUnitId: string; rightWorkUnitId: string; path: string; reason: string }> = [];
  for (let leftIndex = 0; leftIndex < proposals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < proposals.length; rightIndex += 1) {
      const left = proposals[leftIndex];
      const right = proposals[rightIndex];
      for (const leftFile of left.files) {
        for (const rightFile of right.files) {
          const sharedPaths = affectedPaths(leftFile).filter((candidate) => affectedPaths(rightFile).includes(candidate));
          for (const sharedPath of sharedPaths) {
            if (leftFile.operation !== "edit" || rightFile.operation !== "edit") {
              overlaps.push({ leftWorkUnitId: left.workUnitId, rightWorkUnitId: right.workUnitId, path: sharedPath, reason: `${leftFile.operation}/${rightFile.operation} file conflict` });
              continue;
            }
            if (hunksOverlap(leftFile.hunks, rightFile.hunks)) {
              overlaps.push({ leftWorkUnitId: left.workUnitId, rightWorkUnitId: right.workUnitId, path: sharedPath, reason: "overlapping edit hunks" });
            }
          }
        }
      }
    }
  }
  return overlaps;
}

function affectedPaths(file: ParsedDiffFile): string[] {
  return [...new Set([file.oldPath, file.newPath].filter((value): value is string => Boolean(value)))];
}

function hunksOverlap(left: ParsedDiffHunk[], right: ParsedDiffHunk[]): boolean {
  return left.some((leftHunk) => {
    const leftStart = Math.max(1, leftHunk.newStart);
    const leftEnd = leftStart + Math.max(1, leftHunk.newCount || leftHunk.oldCount) - 1;
    return right.some((rightHunk) => {
      const rightStart = Math.max(1, rightHunk.newStart);
      const rightEnd = rightStart + Math.max(1, rightHunk.newCount || rightHunk.oldCount) - 1;
      return leftStart <= rightEnd && rightStart <= leftEnd;
    });
  });
}

function integrationScale(orchestration: CodingWorkflowOrchestration, layerIndex: number): "medium" | "large" {
  return orchestration.workUnits.some((unit) => unit.layerIndex === layerIndex && unit.selectedScale === "large") ? "large" : "medium";
}

function commandError(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = error as { message?: string; stdout?: string; stderr?: string };
    return [candidate.message, candidate.stdout, candidate.stderr].filter(Boolean).join("\n");
  }
  return String(error);
}

async function runShellCommand(command: string, cwd: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  if (process.platform === "win32") {
    return execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], { cwd, timeout, maxBuffer: 10 * 1024 * 1024 });
  }
  return execFileAsync("/bin/sh", ["-lc", command], { cwd, timeout, maxBuffer: 10 * 1024 * 1024 });
}
