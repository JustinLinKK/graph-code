import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  type AgentKind,
  type AgentProvider,
  type AgentRun,
  type CanvasGraph,
  type CodingAgentRequest,
  type CodingWorkflow,
  type CodingWorkflowApplyLayerRequest,
  type CodingWorkflowStartRequest,
  type GithubDevicePollRequest,
  type GithubDevicePollResponse,
  type GithubDeviceStartRequest,
  type GithubDeviceStartResponse,
  type GraphPatch,
  type GraphStatusPatch,
  type GitStatusInfo,
  type LanguageType,
  type OpenWorkspaceResult,
  type OpenWorkspaceRequest,
  type PlanningChatRequest,
    type Project,
    type ReviewAgentRequest,
    type ReviewAgentMode,
    SCANNING_AGENT_MODES,
  type ScanningAgentRequest,
  type SettingsValidationResult,
  type WorkspaceSettings,
  type WorkspaceSettingsMutation
} from "@graphcode/graph-model";
import {
  runCodingAgent,
  runPlanningAgent,
  runReviewAgent,
  runScanningAgent,
  type GraphCodeToolbox,
  type ScanEdgeDraft,
  type ScanLocalOutput,
  type ScanNodeDraft,
  type ScanPipelineResult,
  type ScannableFile
} from "@graphcode/agent-runtime";
import { scanRepositoryCodeGraph, type CodeGraphSymbol } from "@graphcode/parser";
import { openDatabase, type GraphDatabase } from "./db/connection";
import { GraphRepository, validationError } from "./db/repository";
import { migrate } from "./db/schema";

const execFileAsync = promisify(execFile);
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_DEVICE_SCOPE = "repo read:user";

export class WorkspaceRuntime {
  private db: GraphDatabase;
  private repository: GraphRepository;

  constructor(private readonly fallbackDbPath: string, private readonly selfRootPath: string) {
    this.db = openDatabase(fallbackDbPath);
    migrate(this.db);
    this.repository = new GraphRepository(this.db);
  }

  repo(): GraphRepository {
    return this.repository;
  }

  seedSelfGraph(): Project {
    const project = this.repository.seedSelfGraph(this.selfRootPath);
    this.refreshCodeGraph(project.id);
    return project;
  }

  getSettings(projectId: string): WorkspaceSettings {
    return this.repository.getWorkspaceSettings(projectId);
  }

  async saveSettings(projectId: string, input: WorkspaceSettingsMutation): Promise<{ settings: WorkspaceSettings; validation: SettingsValidationResult }> {
    const validation = await this.validateSettings(projectId, input);
    if (validation.ok) {
      return {
        settings: this.repository.saveWorkspaceSettings(projectId, input),
        validation
      };
    }
    return {
      settings: this.repository.getWorkspaceSettings(projectId),
      validation
    };
  }

    async validateSettings(projectId: string, input: WorkspaceSettingsMutation): Promise<SettingsValidationResult> {
      const validation = this.repository.validateWorkspaceSettings(projectId, input);
      const fieldErrors = { ...validation.fieldErrors };
      const cliChecks = [
        ...input.agents.map((agent, index) => ({ provider: agent.provider, command: agent.model, field: `agents.${index}.model` })),
        ...(input.codingAgents ?? []).map((agent, index) => ({ provider: agent.provider, command: agent.model, field: `codingAgents.${index}.model` })),
        ...(input.reviewAgents ?? []).map((agent, index) => ({ provider: agent.provider, command: agent.model, field: `reviewAgents.${index}.model` })),
        ...(input.scanningAgents ?? []).map((agent, index) => ({ provider: agent.provider, command: agent.model, field: `scanningAgents.${index}.model` }))
      ];
      await Promise.all(
        cliChecks.map(async (check) => {
          if (!isCliProvider(check.provider)) {
            return;
          }
          const command = check.command.trim() || defaultCliCommand(check.provider);
          const error = await validateCliProvider(check.provider, command);
          if (error) {
            fieldErrors[check.field] = error;
          }
        })
      );
    return {
      ok: Object.keys(fieldErrors).length === 0,
      testedAt: new Date().toISOString(),
      fieldErrors
    };
  }

  listAgentRuns(projectId: string): AgentRun[] {
    return this.repository.listAgentRuns(projectId);
  }

  async startGithubDeviceFlow(projectId: string, input: GithubDeviceStartRequest): Promise<GithubDeviceStartResponse> {
    this.repository.getProject(projectId);
    const clientId = this.resolveGithubClientId(projectId, input.clientId);
    const body = await githubFormPost<Record<string, unknown>>(GITHUB_DEVICE_CODE_URL, {
      client_id: clientId,
      scope: GITHUB_DEVICE_SCOPE
    });
    if (typeof body.device_code !== "string" || typeof body.user_code !== "string" || typeof body.verification_uri !== "string") {
      throw validationError("GitHub did not return a valid device flow response.");
    }
    return {
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      expiresIn: typeof body.expires_in === "number" ? body.expires_in : 900,
      interval: typeof body.interval === "number" ? body.interval : 5,
      message: typeof body.message === "string" ? body.message : "Open GitHub and enter the code."
    };
  }

  async pollGithubDeviceFlow(projectId: string, input: GithubDevicePollRequest): Promise<GithubDevicePollResponse> {
    this.repository.getProject(projectId);
    const clientId = this.resolveGithubClientId(projectId, input.clientId);
    const body = await githubFormPost<Record<string, unknown>>(GITHUB_ACCESS_TOKEN_URL, {
      client_id: clientId,
      device_code: input.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });

    if (typeof body.error === "string") {
      if (body.error === "authorization_pending" || body.error === "slow_down") {
        return { status: "pending", message: typeof body.error_description === "string" ? body.error_description : "Waiting for GitHub authorization." };
      }
      if (body.error === "expired_token") {
        return { status: "expired", message: "GitHub device code expired. Start a new connection." };
      }
      return { status: "failed", message: typeof body.error_description === "string" ? body.error_description : body.error };
    }

    if (typeof body.access_token !== "string" || !body.access_token.trim()) {
      return { status: "failed", message: "GitHub did not return an access token." };
    }

    const accessToken = body.access_token;
    const user = await githubApiGet<{ login?: string }>("/user", accessToken);
    const repository = input.repository?.trim() || this.repository.getWorkspaceSettings(projectId).github.repository.trim();
    if (repository) {
      await githubApiGet(`/repos/${repository}`, accessToken);
    }
    const scopes = typeof body.scope === "string" ? body.scope.split(",").map((scope) => scope.trim()).filter(Boolean) : [];
    const settings = this.repository.saveGithubAuth({
      projectId,
      accessToken,
      username: user.login ?? "github-user",
      scopes
    });
    return { status: "connected", message: "GitHub connected.", settings };
  }

  disconnectGithub(projectId: string): WorkspaceSettings {
    return this.repository.disconnectGithub(projectId);
  }

  async getCanvasGraph(input: { projectId: string; rootNodeId?: string | null; depth?: number | null; includeAttachments?: boolean }): Promise<CanvasGraph> {
    const canvas = await this.repository.getCanvasGraph(input);
    const settings = this.repository.getWorkspaceSettings(input.projectId);
    if (!settings.github.enabled) {
      return canvas;
    }
    const status = await this.readGitStatus(input.projectId);
    const statusByPath = parseGitStatusByPath(status);
    const nodes = canvas.nodes.map((node) => {
      const sourcePath = node.source.path ?? node.code.directory;
      const gitStatus = sourcePath ? findGitStatusForSource(sourcePath, statusByPath) : null;
      return { ...node, gitStatus };
    });
    const statusByNodeId = new Map(nodes.map((node) => [node.id, node.gitStatus]));
    const edges = canvas.edges.map((edge) => ({
      ...edge,
      gitStatus: mergeGitStatuses(statusByNodeId.get(edge.sourceNodeId) ?? null, statusByNodeId.get(edge.targetNodeId) ?? null)
    }));
    return { ...canvas, nodes, edges };
  }

  async runPlanning(input: PlanningChatRequest): Promise<AgentRun> {
    const project = this.repository.getProject(input.projectId);
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "planning",
      targetNodeId: input.scopeNodeId ?? null,
      prompt: input.prompt,
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: input.prompt });
    const execute = () =>
      runPlanningAgent(input, {
        config: this.repository.getAgentConfig(input.projectId, "planning"),
        runId: run.id,
        workspaceRoot: project.rootPath,
        toolbox: this.createToolbox(input.projectId)
      });
    if (input.background) {
      void this.finishAgentRun(run, execute);
      return run;
    }
    return this.finishAgentRun(run, execute);
  }

  async runCoding(input: CodingAgentRequest, options: { autoReview?: boolean } = {}): Promise<AgentRun> {
    const project = this.repository.getProject(input.projectId);
    const mode = input.mode ?? "medium";
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "coding",
      codingMode: mode,
      targetNodeId: input.nodeId,
      prompt: input.prompt ?? "",
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: input.prompt ?? "Start code" });
      const codingRun = await this.finishAgentRun(run, () =>
      runCodingAgent(input, {
        config: { ...this.repository.getCodingAgentConfig(input.projectId, mode), agentKind: "coding" },
        runId: run.id,
        workspaceRoot: project.rootPath,
        toolbox: this.createToolbox(input.projectId)
      })
      );
      if (codingRun.status === "succeeded" && (options.autoReview ?? true) && this.repository.getWorkspaceSettings(input.projectId).automation.autoReviewAfterCoding) {
        await this.runReview({ projectId: input.projectId, runId: codingRun.id, mode: codingRun.codingMode ?? "medium" });
      }
    return codingRun;
  }

  previewCodingWorkflow(input: { projectId: string; scopeNodeId: string }): CodingWorkflow {
    return this.repository.previewCodingWorkflow(input.projectId, input.scopeNodeId);
  }

  getCodingWorkflow(projectId: string, workflowId: string): CodingWorkflow {
    const workflow = this.repository.getCodingWorkflow(workflowId);
    if (workflow.projectId !== projectId) {
      throw validationError("Coding workflow does not belong to this project.");
    }
    return workflow;
  }

  async startCodingWorkflow(input: CodingWorkflowStartRequest): Promise<CodingWorkflow> {
    const workflow = this.repository.createCodingWorkflow(input.projectId, input.scopeNodeId, input.modeOverrides, "running");
    await this.runCodingWorkflowCurrentLayer(workflow.id);
    return this.repository.getCodingWorkflow(workflow.id);
  }

  async applyCodingWorkflowLayer(input: CodingWorkflowApplyLayerRequest): Promise<CodingWorkflow> {
    const workflow = this.repository.applyCodingWorkflowLayer(input.projectId, input.workflowId, input.layerIndex);
    if (workflow.status === "blocked") {
      await this.runCodingWorkflowCurrentLayer(workflow.id);
    }
    return this.repository.getCodingWorkflow(workflow.id);
  }

    async runReview(input: ReviewAgentRequest): Promise<AgentRun> {
      const targetRun = this.repository.getAgentRun(input.runId);
      if (targetRun.projectId !== input.projectId) {
        throw validationError("Review target run does not belong to this project.");
      }
      const mode: ReviewAgentMode = input.mode ?? targetRun.codingMode ?? "medium";
      const run = this.repository.createAgentRun({
        projectId: input.projectId,
        agentKind: "review",
        reviewMode: mode,
        targetNodeId: targetRun.targetNodeId,
        prompt: `Review ${input.runId}`,
        status: "running"
    });
    return this.finishAgentRun(run, () =>
      runReviewAgent(
        {
            ...input,
            mode,
            targetRun,
            diff: targetRun.diff,
            targetNodeId: targetRun.targetNodeId
          },
          {
            config: { ...this.repository.getReviewAgentConfig(input.projectId, mode), agentKind: "review" },
          runId: run.id,
          workspaceRoot: this.repository.getProject(input.projectId).rootPath,
          toolbox: this.createToolbox(input.projectId)
        }
      )
    );
  }

  applyAgentGraphPatch(projectId: string, runId: string): AgentRun {
    return this.repository.applyAgentGraphPatch(projectId, runId);
  }

  async runScanning(input: ScanningAgentRequest): Promise<AgentRun> {
    const project = this.repository.getProject(input.projectId);
    const settings = this.repository.getWorkspaceSettings(input.projectId);
    const enrichedInput: ScanningAgentRequest = {
      ...input,
      projectDescription: input.projectDescription ?? project.description,
      scanningInstructions: input.scanningInstructions ?? project.scanningInstructions,
      enabledExtensionPackageIds: settings.extensions.enabledPackageIds
    };
    const prompt = scanningPrompt(enrichedInput);
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "scanning",
      prompt,
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: prompt });
    const execute = () =>
      runScanningAgent(enrichedInput, {
        config: this.repository.getAgentConfig(input.projectId, "scanning"),
        scanningConfigs: Object.fromEntries(SCANNING_AGENT_MODES.map((mode) => [mode, this.repository.getScanningAgentConfig(input.projectId, mode)])),
        runId: run.id,
        workspaceRoot: project.rootPath,
        toolbox: this.createToolbox(input.projectId)
      });
    if (input.background) {
      void this.finishAgentRun(run, execute);
      return run;
    }
    return this.finishAgentRun(run, execute);
  }

  openWorkspace(input: OpenWorkspaceRequest): OpenWorkspaceResult {
    const rootPath = path.resolve(input.rootPath);
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
      throw validationError(`Workspace directory does not exist: ${rootPath}`);
    }

    const graphcodePath = path.join(rootPath, ".graphcode");
    const graphcodeWasMissing = !fs.existsSync(graphcodePath);
    if (!fs.existsSync(graphcodePath)) {
      if (!input.createIfMissing) {
        return {
          status: "missing_graphcode",
          rootPath,
          graphcodePath,
          message: "This directory does not contain a .graphcode workspace."
        };
      }
      fs.mkdirSync(graphcodePath, { recursive: true });
    }

    this.switchDatabase(path.join(graphcodePath, "graphcode.sqlite"));
    const existingProject = this.repository.listProjects()[0] ?? null;

    if (existingProject) {
      this.writeWorkspaceManifest(graphcodePath, existingProject, rootPath);
      return {
        status: "opened",
        project: existingProject,
        graphcodePath
      };
    }

    if (!input.createIfMissing) {
      return {
        status: "empty_graphcode",
        rootPath,
        graphcodePath,
        message: "This .graphcode workspace is empty."
      };
    }

    const creationMode = input.creationMode ?? "scan";
    const initialization = normalizeCreationInitialization(input.initialization, creationMode);
    const project = this.repository.createProject({
      id: workspaceProjectId(rootPath),
      name: initialization.projectName,
      rootPath,
      description: initialization.projectDescription,
      scanningInstructions: initialization.scanningInstructions
    });

    this.writeWorkspaceManifest(graphcodePath, project, rootPath);
    if (creationMode === "scan") {
      void this.runScanning({
        projectId: project.id,
        rootPath,
        projectDescription: project.description,
        scanningInstructions: project.scanningInstructions,
        background: true
      });
    }

    return {
      status: "created",
      project,
      graphcodePath
    };
  }

  private writeWorkspaceManifest(graphcodePath: string, project: Project, rootPath: string): void {
    fs.writeFileSync(
      path.join(graphcodePath, "workspace.json"),
      JSON.stringify(
        {
          projectId: project.id,
          projectName: project.name,
          projectDescription: project.description,
          scanningInstructions: project.scanningInstructions,
          rootPath,
          graphcodePath,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  }

  close(): void {
    this.db.close();
  }

  async readGitStatus(projectId: string): Promise<string> {
    const project = this.repository.getProject(projectId);
    try {
      const { stdout } = await execFileAsync("git", ["-C", project.rootPath, "status", "--porcelain=v1"], {
        timeout: 10000,
        maxBuffer: 1024 * 512
      });
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private resolveGithubClientId(projectId: string, override?: string): string {
    const settings = this.repository.getWorkspaceSettings(projectId);
    const clientId = override?.trim() || settings.github.clientId.trim() || process.env.GRAPHCODE_GITHUB_CLIENT_ID?.trim() || "";
    if (!clientId) {
      throw validationError("GitHub OAuth client ID is required.");
    }
    return clientId;
  }

  private switchDatabase(dbPath: string): void {
    this.db.close();
    this.db = openDatabase(dbPath);
    migrate(this.db);
    this.repository = new GraphRepository(this.db);
  }

  private async finishAgentRun(run: AgentRun, execute: () => Promise<{ response: string; diff?: string; graphPatch?: GraphPatch | null }>): Promise<AgentRun> {
    try {
      const result = await execute();
      this.repository.addAgentMessage({ runId: run.id, role: "assistant", content: result.response });
      return this.repository.updateAgentRun(run.id, {
        status: "succeeded",
        response: result.response,
        diff: result.diff ?? "",
        graphPatch: result.graphPatch ?? null,
        error: null
      });
    } catch (error) {
      return this.repository.updateAgentRun(run.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Agent run failed."
      });
    }
  }

  private async runCodingWorkflowCurrentLayer(workflowId: string): Promise<void> {
    let workflow = this.repository.getCodingWorkflow(workflowId);
    const readyItems = this.repository.getReadyCodingWorkflowItems(workflowId);
    if (readyItems.length === 0) {
      const hasPending = workflow.items.some((item) => item.status === "pending" || item.status === "blocked" || item.status === "running");
      this.repository.updateCodingWorkflowStatus(workflowId, hasPending ? "blocked" : "succeeded");
      return;
    }
    this.repository.updateCodingWorkflowStatus(workflowId, "running");
    const groups = new Map<string, typeof readyItems>();
    for (const item of readyItems) {
      const group = groups.get(item.conflictGroup) ?? [];
      group.push(item);
      groups.set(item.conflictGroup, group);
    }
    await Promise.all(
      [...groups.values()].map(async (group) => {
        for (const item of group) {
          this.repository.updateCodingWorkflowItem({ itemId: item.id, status: "running" });
          const run = await this.runCoding({
            projectId: item.projectId,
            nodeId: item.nodeId,
            mode: item.selectedMode,
            recommendedModeReason: item.modeReason,
            prompt: `Layered coding workflow ${workflowId}, layer ${item.layerIndex}. Implement the scoped planning block ${item.nodeName}.`
          }, { autoReview: false });
          const proposal = run.status === "succeeded" ? this.repository.getLatestCodeProposalForRun(run.id) : null;
          this.repository.updateCodingWorkflowItem({
            itemId: item.id,
            status: run.status === "succeeded" ? "proposed" : "failed",
            agentRunId: run.id,
            proposalId: proposal?.id ?? null
          });
        }
      })
    );
    workflow = this.repository.getCodingWorkflow(workflowId);
    const currentLayerItems = workflow.items.filter((item) => item.layerIndex === workflow.currentLayer);
    const complete = currentLayerItems.every((item) => item.status === "proposed" || item.status === "failed" || item.status === "skipped" || item.status === "applied");
    this.repository.updateCodingWorkflowStatus(workflowId, complete ? "blocked" : "running");
  }

  private createToolbox(projectId: string): GraphCodeToolbox {
    return {
      readGraph: async (inputProjectId) => ({
        nodes: this.repository.listProjectNodes(inputProjectId),
        edges: this.repository.listProjectEdges(inputProjectId)
      }),
      getNodeDetail: async (nodeId) => this.repository.getNodeDetail(nodeId),
      getCanvasGraph: async (inputProjectId, rootNodeId, includeAttachments) =>
        this.repository.getCanvasGraph({ projectId: inputProjectId, rootNodeId, includeAttachments: includeAttachments ?? true }),
      setStatuses: async (inputProjectId, patches) => {
        this.repository.setGraphStatuses(inputProjectId, patches);
      },
      applyGraphPatch: async (inputProjectId, patch, runId) => {
        await this.applyGraphPatch(inputProjectId, patch, runId);
      },
      listScannableFiles: async (inputProjectId) => this.listScannableFiles(inputProjectId),
      getScanFileStates: async (inputProjectId) =>
        this.repository.listScanFileStates(inputProjectId).map((state) => ({
          filePath: state.filePath,
          contentHash: state.contentHash
        })),
      buildFakeLocalScanOutput: async (inputProjectId, file) => this.buildFakeLocalScanOutput(inputProjectId, file),
      applyScanResult: async (inputProjectId, result, runId) => {
        await this.validateScanResultSourceRanges(inputProjectId, result);
        return this.repository.applyScanPipelineResult(inputProjectId, result, runId);
      },
      readSourceFile: async (relativePath) => this.readSourceFile(projectId, relativePath),
      resolveExecutionMetadata: async (nodeId) => this.repository.resolveExecutionMetadata(nodeId),
      writeCodeProposal: async (inputProjectId, runId, targetNodeId, diff, artifactManifest) => {
        this.repository.storeCodeProposal({ projectId: inputProjectId, agentRunId: runId, targetNodeId, diff, artifactManifest });
      },
      readGitStatus: async (inputProjectId) => this.readGitStatus(inputProjectId),
      refreshCodeGraph: async (inputProjectId, rootPath) => this.refreshCodeGraph(inputProjectId, rootPath)
    };
  }

  private refreshCodeGraph(projectId: string, requestedRootPath?: string) {
    const project = this.repository.getProject(projectId);
    const rootPath = path.resolve(project.rootPath);
    if (requestedRootPath && !samePath(requestedRootPath, rootPath)) {
      throw validationError("Scanning root path must match the active project root.");
    }
    const snapshot = scanRepositoryCodeGraph(rootPath);
    return this.repository.replaceScannedCodeGraph(projectId, snapshot);
  }

  private async readSourceFile(projectId: string, relativePath: string): Promise<string> {
    const project = this.repository.getProject(projectId);
    const absolutePath = resolveWorkspaceRelativePath(project.rootPath, relativePath, "source file");
    const stat = await fsp.stat(absolutePath).catch(() => null);
    if (!stat) {
      return "";
    }
    if (!stat.isFile()) {
      return "";
    }
    await assertRealPathInside(project.rootPath, absolutePath, `Refusing to read outside workspace: ${relativePath}`);
    const text = await fsp.readFile(absolutePath, "utf8");
    return text.slice(0, 200000);
  }

  private async listScannableFiles(projectId: string): Promise<ScannableFile[]> {
    const project = this.repository.getProject(projectId);
    if (!fs.existsSync(project.rootPath)) {
      return [];
    }
    let relativePaths: string[];
    try {
      const { stdout } = await execFileAsync("git", ["-C", project.rootPath, "ls-files", "-co", "--exclude-standard"], {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 4
      });
      relativePaths = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && isScannablePath(line))
        .slice(0, 2000);
    } catch {
      relativePaths = await this.walkScannableFiles(project.rootPath, project.rootPath);
    }
    const uniquePaths = [...new Set(relativePaths.map((relativePath) => normalizeGitPath(relativePath)))].sort();
    const files = await Promise.all(uniquePaths.map((relativePath) => this.scannableFile(project.rootPath, relativePath)));
    return files.filter((file): file is ScannableFile => Boolean(file));
  }

  private async scannableFile(rootPath: string, relativePath: string): Promise<ScannableFile | null> {
    let absolutePath: string;
    try {
      absolutePath = resolveWorkspaceRelativePath(rootPath, relativePath, "scannable file");
    } catch {
      return null;
    }
    const stat = await fsp.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
      return null;
    }
    await assertRealPathInside(rootPath, absolutePath, `Refusing to scan outside workspace: ${relativePath}`);
    const buffer = await fsp.readFile(absolutePath);
    return {
      path: normalizeGitPath(relativePath),
      contentHash: crypto.createHash("sha1").update(buffer).digest("hex"),
      size: stat.size,
      language: normalizeLanguage(languageForFilePath(relativePath))
    };
  }

  private async walkScannableFiles(rootPath: string, currentPath: string): Promise<string[]> {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if ([".git", ".graphcode", "node_modules", "dist", "build", "coverage"].includes(entry.name)) {
        continue;
      }
      const absolute = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walkScannableFiles(rootPath, absolute)));
      } else {
        const relative = path.relative(rootPath, absolute);
        if (isScannablePath(relative)) {
          files.push(relative);
        }
      }
      if (files.length >= 2000) {
        break;
      }
    }
    return files;
  }

  private async buildFakeLocalScanOutput(projectId: string, file: ScannableFile): Promise<ScanLocalOutput> {
    const project = this.repository.getProject(projectId);
    const snapshot = scanRepositoryCodeGraph(project.rootPath, { files: [file.path] });
    const parsedFile = snapshot.files.find((item) => item.path === file.path);
    if (!parsedFile) {
      return { filePath: file.path, contentHash: file.contentHash, summary: "No scannable source entities found.", nodes: [], edges: [] };
    }
    const nodes: ScanNodeDraft[] = [
      {
        stableKey: parsedFile.id,
        kind: "module",
        name: parsedFile.name,
        summary: `${parsedFile.language} file module with ${(snapshot.symbols ?? []).filter((symbol) => symbol.filePath === file.path).length} symbols`,
        codeContext: `Generated local scan file module for ${parsedFile.path}. Imports: ${parsedFile.imports.map((item) => item.moduleSpecifier).join(", ") || "none"}. Exports: ${parsedFile.exports.join(", ") || "none"}.`,
        source: { path: parsedFile.path, startLine: parsedFile.startLine, endLine: parsedFile.endLine },
        language: parsedFile.language,
        parentStableKey: `dir:${parsedFile.directoryPath}`
      }
    ];
    const edges: ScanEdgeDraft[] = [];
    const symbols = snapshot.symbols.filter((symbol) => symbol.filePath === file.path);
    for (const symbol of symbols) {
      nodes.push({
        stableKey: symbol.id,
        kind: symbol.kind,
        name: symbol.name,
        summary: symbol.summary,
        codeContext: `${symbol.signature}\n${symbol.summary}`,
        source: { path: symbol.filePath, startLine: symbol.startLine, endLine: symbol.endLine },
        language: parsedFile.language,
        parentStableKey: symbol.parentSymbolId ?? parsedFile.id
      });
      if (symbol.kind === "function") {
        this.addFakeWorkflowDrafts(symbol, parsedFile.language, nodes, edges);
      }
    }
    for (const edge of snapshot.edges) {
      edges.push({
        stableKey: edge.id,
        kind: edge.kind,
        sourceStableKey: edge.sourceId,
        targetStableKey: edge.targetId,
        label: edge.label,
        codeContext: edge.codeContext,
        source: sourceForEdge(edge.sourceId, symbols, parsedFile.path)
      });
    }
    return {
      filePath: file.path,
      contentHash: file.contentHash,
      summary: `Local scanner analyzed ${parsedFile.path}.`,
      nodes,
      edges
    };
  }

  private addFakeWorkflowDrafts(symbol: CodeGraphSymbol, language: LanguageType, nodes: ScanNodeDraft[], edges: ScanEdgeDraft[]): void {
    const workflow = symbol.workflow ?? {
      nodes: [
        {
          id: `${symbol.id}-process`,
          kind: "entry" as const,
          name: `Entry ${symbol.name}`,
          summary: `Function entry for ${symbol.name}`,
          codeContext: symbol.signature,
          startLine: symbol.startLine,
          endLine: symbol.endLine
        }
      ],
      edges: []
    };
    const entryNode = workflow.nodes.find((node) => node.kind === "entry") ?? workflow.nodes[0];
    const hasThrowPath = workflow.nodes.some((node) => node.kind === "throw");
    const outputId = `${symbol.id}-output`;
    const outputFormatId = `${outputId}-format`;
    const throwOutputId = `${symbol.id}-throw-output`;
    const throwOutputFormatId = `${throwOutputId}-format`;

    for (const workflowNode of workflow.nodes) {
      nodes.push({
        stableKey: workflowNode.id,
        kind: "process",
        name: workflowNode.kind === "entry" ? `Entry ${symbol.name}` : workflowNode.name,
        summary: workflowNode.summary,
        codeContext: workflowNode.codeContext,
        source: { path: symbol.filePath, startLine: workflowNode.startLine, endLine: workflowNode.endLine },
        language,
        attachedToStableKey: symbol.id,
        detail: {
          processKind: workflowNode.kind === "condition" ? "condition" : "analyze",
          trigger: workflowNode.kind,
          notes: workflowNode.codeContext
        }
      });
    }

    nodes.push({
      stableKey: outputId,
      kind: "output",
      name: symbol.returnHint ? `Returns ${symbol.returnHint}` : "Return value",
      summary: `Output produced by ${symbol.name}`,
      codeContext: `Generated output boundary for ${symbol.name}.`,
      source: { path: symbol.filePath, startLine: symbol.startLine, endLine: symbol.endLine },
      language,
      attachedToStableKey: symbol.id,
      detail: { ioKind: "artifact", channel: `${symbol.name} return`, schemaHint: symbol.returnHint ?? "unknown" }
    });
    nodes.push({
      stableKey: outputFormatId,
      kind: "format",
      name: symbol.returnHint ?? "return type",
      summary: "Return format",
      codeContext: `Generated return format for ${symbol.name}.`,
      source: { path: symbol.filePath, startLine: null, endLine: null },
      language,
      attachedToStableKey: outputId,
      detail: { formatKind: "type", spec: symbol.returnHint ?? "unknown" }
    });
    edges.push({
      stableKey: `code-edge-${hashPath(`${outputId}:describes_format:${outputFormatId}`)}`,
      kind: "describes_format",
      sourceStableKey: outputId,
      targetStableKey: outputFormatId,
      label: "format",
      codeContext: `${outputFormatId} describes the return type of ${symbol.name}.`,
      source: { path: symbol.filePath, startLine: null, endLine: null }
    });

    if (hasThrowPath) {
      nodes.push({
        stableKey: throwOutputId,
        kind: "output",
        name: "Throws error",
        summary: `Exceptional output produced by ${symbol.name}`,
        codeContext: `Generated throw boundary for ${symbol.name}.`,
        source: { path: symbol.filePath, startLine: symbol.startLine, endLine: symbol.endLine },
        language,
        attachedToStableKey: symbol.id,
        detail: { ioKind: "artifact", channel: `${symbol.name} throw`, schemaHint: "Error" }
      });
      nodes.push({
        stableKey: throwOutputFormatId,
        kind: "format",
        name: "Error",
        summary: "Throw format",
        codeContext: `Generated throw format for ${symbol.name}.`,
        source: { path: symbol.filePath, startLine: null, endLine: null },
        language,
        attachedToStableKey: throwOutputId,
        detail: { formatKind: "type", spec: "Error" }
      });
      edges.push({
        stableKey: `code-edge-${hashPath(`${throwOutputId}:describes_format:${throwOutputFormatId}`)}`,
        kind: "describes_format",
        sourceStableKey: throwOutputId,
        targetStableKey: throwOutputFormatId,
        label: "format",
        codeContext: `${throwOutputFormatId} describes the throw output type of ${symbol.name}.`,
        source: { path: symbol.filePath, startLine: null, endLine: null }
      });
    }

    const workflowInputs = symbol.parameters.length > 0 ? symbol.parameters : [{ name: "Invocation", typeHint: "function call" }];
    workflowInputs.forEach((parameter, index) => {
      const inputId = `${symbol.id}-input-${hashPath(`${parameter.name}:${index}`)}`;
      const inputFormatId = `${inputId}-format`;
      nodes.push({
        stableKey: inputId,
        kind: "input",
        name: parameter.name,
        summary: `Input to ${symbol.name}`,
        codeContext: `Generated input boundary for ${symbol.name} parameter ${parameter.name}.`,
        source: { path: symbol.filePath, startLine: symbol.startLine, endLine: symbol.endLine },
        language,
        attachedToStableKey: symbol.id,
        detail: { ioKind: "artifact", channel: `${symbol.name}.${parameter.name}`, schemaHint: parameter.typeHint ?? "unknown" }
      });
      nodes.push({
        stableKey: inputFormatId,
        kind: "format",
        name: parameter.typeHint ?? "input type",
        summary: "Input format",
        codeContext: `Generated input format for ${symbol.name}.${parameter.name}.`,
        source: { path: symbol.filePath, startLine: null, endLine: null },
        language,
        attachedToStableKey: inputId,
        detail: { formatKind: "type", spec: parameter.typeHint ?? "unknown" }
      });
      edges.push({
        stableKey: `code-edge-${hashPath(`${inputId}:flows:${entryNode.id}`)}`,
        kind: "flows",
        sourceStableKey: inputId,
        targetStableKey: entryNode.id,
        label: "parameter",
        codeContext: `${parameter.name} flows into ${symbol.name}.`,
        source: { path: symbol.filePath, startLine: symbol.startLine, endLine: symbol.endLine },
        animated: true
      });
      edges.push({
        stableKey: `code-edge-${hashPath(`${inputId}:describes_format:${inputFormatId}`)}`,
        kind: "describes_format",
        sourceStableKey: inputId,
        targetStableKey: inputFormatId,
        label: "format",
        codeContext: `${inputFormatId} describes the ${parameter.name} input type.`,
        source: { path: symbol.filePath, startLine: null, endLine: null }
      });
    });

    for (const edge of workflow.edges) {
      edges.push({
        stableKey: edge.id,
        kind: "flows",
        sourceStableKey: edge.sourceId,
        targetStableKey: edge.targetId,
        label: edge.label,
        codeContext: edge.codeContext,
        source: sourceForWorkflowEdge(edge.sourceId, workflow.nodes, symbol.filePath),
        animated: true
      });
    }

    const workflowOutgoing = new Set(workflow.edges.map((edge) => edge.sourceId));
    for (const workflowNode of workflow.nodes) {
      if (workflowNode.kind === "return") {
        edges.push({
          stableKey: `code-edge-${hashPath(`${workflowNode.id}:flows:${outputId}`)}`,
          kind: "flows",
          sourceStableKey: workflowNode.id,
          targetStableKey: outputId,
          label: "return",
          codeContext: `${symbol.name} returns through ${workflowNode.name}.`,
          source: { path: symbol.filePath, startLine: workflowNode.startLine, endLine: workflowNode.endLine },
          animated: true
        });
      } else if (workflowNode.kind === "throw" && hasThrowPath) {
        edges.push({
          stableKey: `code-edge-${hashPath(`${workflowNode.id}:flows:${throwOutputId}`)}`,
          kind: "flows",
          sourceStableKey: workflowNode.id,
          targetStableKey: throwOutputId,
          label: "throw",
          codeContext: `${symbol.name} throws through ${workflowNode.name}.`,
          source: { path: symbol.filePath, startLine: workflowNode.startLine, endLine: workflowNode.endLine },
          animated: true
        });
      } else if (!workflowOutgoing.has(workflowNode.id)) {
        edges.push({
          stableKey: `code-edge-${hashPath(`${workflowNode.id}:flows:${outputId}`)}`,
          kind: "flows",
          sourceStableKey: workflowNode.id,
          targetStableKey: outputId,
          label: "return",
          codeContext: `${symbol.name} falls through to its return output.`,
          source: { path: symbol.filePath, startLine: workflowNode.startLine, endLine: workflowNode.endLine },
          animated: true
        });
      }
    }
  }

  private async validateScanResultSourceRanges(projectId: string, result: ScanPipelineResult): Promise<void> {
    const project = this.repository.getProject(projectId);
    const ranges = [
      ...result.globalOutput.nodes.map((node) => node.source),
      ...result.globalOutput.edges.map((edge) => edge.source),
      ...result.mediumOutputs.flatMap((output) => [...output.nodes.map((node) => node.source), ...output.edges.map((edge) => edge.source)]),
      ...result.localOutputs.flatMap((output) => [...output.nodes.map((node) => node.source), ...output.edges.map((edge) => edge.source)])
    ];
    const lineCountByPath = new Map<string, number>();
    for (const range of ranges) {
      if (!range.path || range.startLine === null || range.endLine === null) {
        continue;
      }
      if (range.startLine > range.endLine) {
        throw validationError(`Invalid scan source range ${range.path}:${range.startLine}-${range.endLine}.`);
      }
      let lineCount = lineCountByPath.get(range.path);
      if (lineCount === undefined) {
        const absolutePath = resolveWorkspaceRelativePath(project.rootPath, range.path, "scan source range");
        await assertRealPathInside(project.rootPath, absolutePath, `Scanner source range escaped workspace: ${range.path}`);
        const text = await fsp.readFile(absolutePath, "utf8").catch(() => "");
        lineCount = Math.max(1, text.split(/\r?\n/).length);
        lineCountByPath.set(range.path, lineCount);
      }
      if (range.endLine > lineCount) {
        throw validationError(`Scan source range exceeds file length: ${range.path}:${range.startLine}-${range.endLine}.`);
      }
    }
  }

  private async applyGraphPatch(projectId: string, patch: GraphPatch, runId?: string): Promise<void> {
    const statuses: GraphStatusPatch[] = patch.operations.map((operation) => ({
      entityType: operation.entityType,
      entityId: operation.entityId,
      status: "planning",
      note: patch.summary,
      agentRunId: runId ?? null
    }));
    if (statuses.length > 0) {
      this.repository.setGraphStatuses(projectId, statuses);
    }
  }
}

function workspaceProjectId(rootPath: string): string {
  const hash = crypto.createHash("sha1").update(rootPath).digest("hex").slice(0, 10);
  return `workspace-${hash}`;
}

function normalizeCreationInitialization(
  initialization: OpenWorkspaceRequest["initialization"],
  creationMode: NonNullable<OpenWorkspaceRequest["creationMode"]>
): { projectName: string; projectDescription: string; scanningInstructions: string } {
  if (!initialization?.projectName?.trim()) {
    throw validationError("Project name is required to create a GraphCode workspace.");
  }
  if (creationMode === "scan") {
    if (!("projectDescription" in initialization) || !initialization.projectDescription.trim() || !("scanningInstructions" in initialization) || !initialization.scanningInstructions.trim()) {
      throw validationError("Project name, description, and scanning instructions are required to scan a GraphCode workspace.");
    }
    return {
      projectName: initialization.projectName.trim(),
      projectDescription: initialization.projectDescription.trim(),
      scanningInstructions: initialization.scanningInstructions.trim()
    };
  }

  return {
    projectName: initialization.projectName.trim(),
    projectDescription: initialization.projectDescription?.trim() ?? "",
    scanningInstructions: ""
  };
}

function scanningPrompt(input: ScanningAgentRequest): string {
  return [
    input.rootPath ? `Root path: ${input.rootPath}` : "",
    input.projectDescription ? `Project description:\n${input.projectDescription}` : "",
    input.scanningInstructions ? `Scanning instructions:\n${input.scanningInstructions}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function sourceForEdge(sourceId: string, symbols: CodeGraphSymbol[], fallbackPath: string): { path: string; startLine: number; endLine: number } {
  const symbol = symbols.find((item) => item.id === sourceId);
  return {
    path: symbol?.filePath ?? fallbackPath,
    startLine: symbol?.startLine ?? 1,
    endLine: symbol?.endLine ?? 1
  };
}

function sourceForWorkflowEdge(
  sourceId: string,
  workflowNodes: Array<{ id: string; startLine: number; endLine: number }>,
  fallbackPath: string
): { path: string; startLine: number; endLine: number } {
  const source = workflowNodes.find((node) => node.id === sourceId);
  return {
    path: fallbackPath,
    startLine: source?.startLine ?? 1,
    endLine: source?.endLine ?? 1
  };
}

function languageForFilePath(filePath: string): string {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
    return "typescript";
  }
  if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return "javascript";
  }
  if (filePath.endsWith(".py")) {
    return "python";
  }
  if (filePath.endsWith(".json")) {
    return "json";
  }
  if (filePath.endsWith(".md")) {
    return "markdown";
  }
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return "yaml";
  }
  if (filePath.endsWith(".css")) {
    return "css";
  }
  if (filePath.endsWith(".html")) {
    return "html";
  }
  return "other";
}

function hashPath(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function samePath(first: string, second: string): boolean {
  return realPathOrResolve(first) === realPathOrResolve(second);
}

function resolveWorkspaceRelativePath(rootPath: string, relativePath: string, label: string): string {
  const normalizedPath = normalizeGitPath(relativePath);
  if (!normalizedPath || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw validationError(`Workspace ${label} must be a relative path.`);
  }
  if (normalizedPath.split("/").some((part) => part === "..")) {
    throw validationError(`Workspace ${label} cannot contain parent directory traversal.`);
  }
  const absolutePath = path.resolve(rootPath, normalizedPath);
  if (!isPathInside(rootPath, absolutePath)) {
    throw validationError(`Workspace ${label} escaped the workspace.`);
  }
  return absolutePath;
}

async function assertRealPathInside(rootPath: string, absolutePath: string, message: string): Promise<void> {
  const [realRoot, realCandidate] = await Promise.all([fsp.realpath(rootPath), fsp.realpath(absolutePath)]);
  if (!isPathInside(realRoot, realCandidate)) {
    throw validationError(message);
  }
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function realPathOrResolve(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function isCliProvider(provider: AgentProvider): provider is "codex" | "claudecode" {
  return provider === "codex" || provider === "claudecode";
}

function defaultCliCommand(provider: "codex" | "claudecode"): string {
  return provider === "codex" ? "codex" : "claude";
}

function cliProviderLabel(provider: "codex" | "claudecode"): string {
  return provider === "codex" ? "Codex CLI" : "Claude Code";
}

async function validateCliProvider(provider: "codex" | "claudecode", command: string): Promise<string | null> {
  const label = cliProviderLabel(provider);
  try {
    await execFileAsync(command, ["--version"], { timeout: 5000 });
  } catch {
    return `${label} command not found or not executable: ${command}`;
  }
  const authArgs = provider === "codex" ? ["login", "status"] : ["auth", "status"];
  try {
    await execFileAsync(command, authArgs, { timeout: 10000 });
  } catch {
    return `${label} account login is not available. Run ${command} ${authArgs.join(" ")} or sign in with the CLI before saving.`;
  }
  return null;
}

function isScannablePath(value: string): boolean {
  if (value.includes("/node_modules/") || value.startsWith("node_modules/") || value.startsWith(".graphcode/")) {
    return false;
  }
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|json|md|yaml|yml|css|html)$/.test(value);
}

function normalizeLanguage(value: string): LanguageType {
  const languages = new Set([
    "unknown",
    "typescript",
    "javascript",
    "python",
    "java",
    "go",
    "rust",
    "c",
    "cpp",
    "csharp",
    "kotlin",
    "swift",
    "ruby",
    "php",
    "sql",
    "shell",
    "json",
    "yaml",
    "markdown",
    "html",
    "css",
    "other"
  ]);
  return languages.has(value) ? (value as LanguageType) : "other";
}

function parseGitStatusByPath(status: string): Map<string, GitStatusInfo> {
  const result = new Map<string, GitStatusInfo>();
  for (const line of status.split(/\r?\n/)) {
    if (line.length < 4) {
      continue;
    }
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const rawPath = normalizeGitPath(line.slice(3).split(" -> ").at(-1) ?? line.slice(3));
    const pathStatus: GitStatusInfo = line.startsWith("??")
      ? { worktree: "untracked", change: "new" }
      : {
          worktree: worktreeStatus !== " " ? "pending" : indexStatus !== " " ? "staged" : "committed",
          change: gitChangeForPorcelain(indexStatus, worktreeStatus)
        };
    result.set(rawPath, mergeGitStatuses(result.get(rawPath) ?? null, pathStatus) ?? pathStatus);
  }
  return result;
}

function findGitStatusForSource(sourcePath: string, statusByPath: Map<string, GitStatusInfo>): GitStatusInfo {
  const source = normalizeGitPath(sourcePath);
  let selected = statusByPath.get(source) ?? null;
  for (const [filePath, status] of statusByPath) {
    if (filePath === source || filePath.startsWith(`${source}/`)) {
      selected = mergeGitStatuses(selected, status);
    }
  }
  return selected ?? { worktree: "committed", change: null };
}

function mergeGitStatuses(first: GitStatusInfo | null, second: GitStatusInfo | null): GitStatusInfo | null {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  const firstWorktree = worktreePriority(first.worktree);
  const secondWorktree = worktreePriority(second.worktree);
  if (firstWorktree !== secondWorktree) {
    return firstWorktree > secondWorktree ? first : second;
  }
  return changePriority(first.change) >= changePriority(second.change) ? first : second;
}

function worktreePriority(status: GitStatusInfo["worktree"]): number {
  switch (status) {
    case "untracked":
      return 4;
    case "pending":
      return 3;
    case "staged":
      return 2;
    case "committed":
      return 1;
    default:
      return 0;
  }
}

function changePriority(status: GitStatusInfo["change"]): number {
  switch (status) {
    case "deleted":
      return 3;
    case "new":
      return 2;
    case "modified":
      return 1;
    default:
      return 0;
  }
}

function gitChangeForPorcelain(indexStatus: string, worktreeStatus: string): GitStatusInfo["change"] {
  if (indexStatus === "D" || worktreeStatus === "D") {
    return "deleted";
  }
  if (indexStatus === "A" || worktreeStatus === "A" || indexStatus === "?" || worktreeStatus === "?") {
    return "new";
  }
  return "modified";
}

function normalizeGitPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^"\s*/, "").replace(/"$/, "").replace(/\/+$/, "");
}

async function githubFormPost<T>(url: string, fields: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(fields)
  });
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw validationError(`GitHub request failed: ${response.status}`);
  }
  return body;
}

async function githubApiGet<T>(pathName: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_URL}${pathName}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw validationError(`GitHub API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
