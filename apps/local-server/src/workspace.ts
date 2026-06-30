import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  type AgentKind,
  type AgentRun,
  type CanvasGraph,
  type CodingAgentRequest,
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
  type ScanningAgentRequest,
  type SettingsValidationResult,
  type WorkspaceSettings,
  type WorkspaceSettingsMutation
} from "@graphcode/graph-model";
import { runCodingAgent, runPlanningAgent, runReviewAgent, runScanningAgent, type GraphCodeToolbox } from "@graphcode/agent-runtime";
import { scanRepositoryCodeGraph } from "@graphcode/parser";
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
    await Promise.all(
      input.agents.map(async (agent, index) => {
        if (agent.provider !== "claudecode") {
          return;
        }
        const command = agent.model.trim() || "claude";
        try {
          await execFileAsync(command, ["--version"], { timeout: 5000 });
        } catch {
          fieldErrors[`agents.${index}.model`] = `Claude Code command not found or not executable: ${command}`;
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
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "planning",
      targetNodeId: input.scopeNodeId ?? null,
      prompt: input.prompt,
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: input.prompt });
    return this.finishAgentRun(run, async () => {
      const result = await runPlanningAgent(input, {
        config: this.repository.getAgentConfig(input.projectId, "planning"),
        runId: run.id,
        toolbox: this.createToolbox(input.projectId)
      });
      if (result.graphPatch) {
        await this.applyGraphPatch(input.projectId, result.graphPatch, run.id);
      }
      return result;
    });
  }

  async runCoding(input: CodingAgentRequest): Promise<AgentRun> {
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "coding",
      targetNodeId: input.nodeId,
      prompt: input.prompt ?? "",
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: input.prompt ?? "Start code" });
    const codingRun = await this.finishAgentRun(run, () =>
      runCodingAgent(input, {
        config: this.repository.getAgentConfig(input.projectId, "coding"),
        runId: run.id,
        toolbox: this.createToolbox(input.projectId)
      })
    );
    if (codingRun.status === "succeeded" && this.repository.getWorkspaceSettings(input.projectId).automation.autoReviewAfterCoding) {
      await this.runReview({ projectId: input.projectId, runId: codingRun.id });
    }
    return codingRun;
  }

  async runReview(input: ReviewAgentRequest): Promise<AgentRun> {
    const targetRun = this.repository.getAgentRun(input.runId);
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "review",
      targetNodeId: targetRun.targetNodeId,
      prompt: `Review ${input.runId}`,
      status: "running"
    });
    return this.finishAgentRun(run, () =>
      runReviewAgent(
        {
          ...input,
          diff: targetRun.diff,
          targetNodeId: targetRun.targetNodeId
        },
        {
          config: this.repository.getAgentConfig(input.projectId, "review"),
          runId: run.id,
          toolbox: this.createToolbox(input.projectId)
        }
      )
    );
  }

  async runScanning(input: ScanningAgentRequest): Promise<AgentRun> {
    const project = this.repository.getProject(input.projectId);
    const enrichedInput = {
      ...input,
      projectDescription: input.projectDescription ?? project.description,
      scanningInstructions: input.scanningInstructions ?? project.scanningInstructions
    };
    const prompt = scanningPrompt(enrichedInput);
    const run = this.repository.createAgentRun({
      projectId: input.projectId,
      agentKind: "scanning",
      prompt,
      status: "running"
    });
    this.repository.addAgentMessage({ runId: run.id, role: "user", content: prompt });
    return this.finishAgentRun(run, () =>
      runScanningAgent(enrichedInput, {
        config: this.repository.getAgentConfig(input.projectId, "scanning"),
        runId: run.id,
        toolbox: this.createToolbox(input.projectId)
      })
    );
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
      this.refreshCodeGraph(project.id, rootPath);
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

  private createToolbox(projectId: string): GraphCodeToolbox {
    return {
      readGraph: async (inputProjectId) => ({
        nodes: this.repository.listProjectNodes(inputProjectId),
        edges: this.repository.listProjectEdges(inputProjectId)
      }),
      getNodeDetail: async (nodeId) => this.repository.getNodeDetail(nodeId),
      setStatuses: async (inputProjectId, patches) => {
        this.repository.setGraphStatuses(inputProjectId, patches);
      },
      applyGraphPatch: async (inputProjectId, patch, runId) => {
        await this.applyGraphPatch(inputProjectId, patch, runId);
      },
      readSourceFile: async (relativePath) => this.readSourceFile(projectId, relativePath),
      writeCodeProposal: async (inputProjectId, runId, targetNodeId, diff) => {
        this.repository.storeCodeProposal({ projectId: inputProjectId, agentRunId: runId, targetNodeId, diff });
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
    const absolutePath = path.resolve(project.rootPath, relativePath);
    const rootPath = path.resolve(project.rootPath);
    if (!absolutePath.startsWith(rootPath)) {
      throw validationError(`Refusing to read outside workspace: ${relativePath}`);
    }
    const stat = await fsp.stat(absolutePath).catch(() => null);
    if (!stat) {
      return "";
    }
    if (!stat.isFile()) {
      return "";
    }
    const text = await fsp.readFile(absolutePath, "utf8");
    return text.slice(0, 200000);
  }

  private async listScannableFiles(projectId: string): Promise<string[]> {
    const project = this.repository.getProject(projectId);
    if (!fs.existsSync(project.rootPath)) {
      return [];
    }
    try {
      const { stdout } = await execFileAsync("git", ["-C", project.rootPath, "ls-files", "-co", "--exclude-standard"], {
        timeout: 20000,
        maxBuffer: 1024 * 1024 * 4
      });
      return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && isScannablePath(line))
        .slice(0, 2000);
    } catch {
      return this.walkScannableFiles(project.rootPath, project.rootPath);
    }
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

function hashPath(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function samePath(first: string, second: string): boolean {
  return realPathOrResolve(first) === realPathOrResolve(second);
}

function realPathOrResolve(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
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
