import {
    CODING_AGENT_MODES,
    REVIEW_AGENT_MODES,
    SCANNING_AGENT_MODES,
    type AgentConfig,
    type AgentKind,
    type AgentProvider,
    type ClaudeCliStatus,
    type ClaudeModelInfo,
    type CodingAgentConfig,
    type CodingAgentMode,
  type CodexCliStatus,
  type CodexModelInfo,
  type GithubDevicePollResponse,
  type GithubDeviceStartResponse,
    type Project,
    type ReviewAgentConfig,
    type ReviewAgentMode,
    type ScanningAgentConfig,
  type ScanningAgentMode,
  type SettingsValidationResult,
  type WorkspaceSettings,
  type WorkspaceSettingsMutation
  } from "@graphcode/graph-model";
import { Button } from "@heroui/react";
import { Bot, CheckCircle2, Boxes, ExternalLink, Github, Monitor, RefreshCw, Save, Terminal, Unplug, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getClaudeModels, getClaudeStatus, getCodexModels, getCodexStatus, installClaudeCli, installCodexCli, startClaudeAuth, startCodexAuth } from "../api";
import { agentKindLabel, codingAgentModeLabel, providerLabel, reviewAgentModeLabel, scanningAgentModeLabel } from "../displayLabels";

type SettingsPageProps = {
  project: Project;
  settings: WorkspaceSettings;
  validation: SettingsValidationResult | null;
  saving: boolean;
  onClose: () => void;
  onSave: (settings: WorkspaceSettingsMutation) => void;
  onStartGithubDeviceFlow: (input: { clientId?: string; repository?: string }) => Promise<GithubDeviceStartResponse>;
  onPollGithubDeviceFlow: (input: { deviceCode: string; clientId?: string; repository?: string }) => Promise<GithubDevicePollResponse>;
  onDisconnectGithub: () => Promise<WorkspaceSettings>;
};

const agentKinds: AgentKind[] = ["planning"];
const providers: AgentProvider[] = ["fake", "codex", "claudecode", "openai", "openrouter", "gemini", "deepseek"];

type AgentSecretDraft = { type: AgentConfig["apiKeySource"]["type"]; value: string };
type AgentPromptDraft = { type: AgentConfig["systemPromptSource"]["type"]; value: string };
type AgentSettingsLike = Pick<
  AgentConfig,
  | "provider"
  | "model"
  | "cliCommand"
  | "reasoningEffort"
  | "speedTier"
  | "permissionMode"
  | "codexSystemPromptMode"
  | "claudeSystemPromptMode"
  | "parallelLimit"
> & {
  apiKeySource: AgentSecretDraft;
  systemPromptSource: AgentPromptDraft;
};
type AgentSettingsPatch = Partial<AgentSettingsLike>;

export function SettingsPage({
  project,
  settings,
  validation,
  saving,
  onClose,
  onSave,
  onStartGithubDeviceFlow,
  onPollGithubDeviceFlow,
  onDisconnectGithub
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<"general" | "agents" | "extensions" | "integrations" | "github">("general");
  const [draft, setDraft] = useState(() => toMutation(settings));
  const [readSuccessByField, setReadSuccessByField] = useState<Record<string, string>>({});
  const [deviceFlow, setDeviceFlow] = useState<GithubDeviceStartResponse | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMessage, setGithubMessage] = useState("");
  const [codexStatus, setCodexStatus] = useState<CodexCliStatus | null>(null);
  const [codexModels, setCodexModels] = useState<CodexModelInfo[]>([]);
  const [codexBusy, setCodexBusy] = useState(false);
  const [codexMessage, setCodexMessage] = useState("");
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCliStatus | null>(null);
  const [claudeModels, setClaudeModels] = useState<ClaudeModelInfo[]>([]);
  const [claudeBusy, setClaudeBusy] = useState(false);
  const [claudeMessage, setClaudeMessage] = useState("");
  const errors = validation?.fieldErrors ?? {};
    const agentByKind = useMemo(() => new Map(draft.agents.map((agent) => [agent.agentKind, agent])), [draft.agents]);
    const codingAgentDrafts = useMemo(() => draft.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent), [draft.codingAgents]);
    const codingAgentByMode = useMemo(() => new Map(codingAgentDrafts.map((agent) => [agent.mode, agent])), [codingAgentDrafts]);
    const reviewAgentDrafts = useMemo(() => draft.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent), [draft.reviewAgents]);
    const reviewAgentByMode = useMemo(() => new Map(reviewAgentDrafts.map((agent) => [agent.mode, agent])), [reviewAgentDrafts]);
    const scanningAgentDrafts = useMemo(() => draft.scanningAgents ?? SCANNING_AGENT_MODES.map(defaultScanningAgent), [draft.scanningAgents]);
  const scanningAgentByMode = useMemo(() => new Map(scanningAgentDrafts.map((agent) => [agent.mode, agent])), [scanningAgentDrafts]);
  const codexModelsBySlug = useMemo(() => new Map(codexModels.map((model) => [model.slug, model])), [codexModels]);
  const claudeModelsBySlug = useMemo(() => new Map(claudeModels.map((model) => [model.slug, model])), [claudeModels]);

  const refreshCodex = async () => {
    setCodexBusy(true);
    setCodexMessage("");
    try {
      const status = await getCodexStatus();
      setCodexStatus(status);
      if (status.installed && status.authenticated) {
        const models = await getCodexModels();
        setCodexModels(models);
        setCodexMessage(models.length > 0 ? `Loaded ${models.length} Codex models.` : "Codex CLI returned no visible models.");
      } else {
        setCodexModels([]);
        setCodexMessage(status.error ?? "Codex CLI is not ready yet.");
      }
    } catch (error) {
      setCodexModels([]);
      setCodexMessage(error instanceof Error ? error.message : "Failed to inspect Codex CLI.");
    } finally {
      setCodexBusy(false);
    }
  };

  const refreshClaude = async () => {
    setClaudeBusy(true);
    setClaudeMessage("");
    try {
      const status = await getClaudeStatus();
      setClaudeStatus(status);
      if (status.installed && status.authenticated) {
        const models = await getClaudeModels();
        setClaudeModels(models);
        setClaudeMessage(models.length > 0 ? `Loaded ${models.length} Claude model aliases.` : "Claude Code returned no model aliases.");
      } else {
        setClaudeModels([]);
        setClaudeMessage(status.error ?? "Claude Code is not ready yet.");
      }
    } catch (error) {
      setClaudeModels([]);
      setClaudeMessage(error instanceof Error ? error.message : "Failed to inspect Claude Code.");
    } finally {
      setClaudeBusy(false);
    }
  };

  useEffect(() => {
    setDraft(toMutation(settings));
  }, [project.id]);

  useEffect(() => {
    void refreshCodex();
    void refreshClaude();
  }, []);

  useEffect(() => {
    const firstModel = codexModels[0];
    if (!firstModel) {
      return;
    }
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => applyInitialCodexModel(agent, firstModel)),
      codingAgents: (current.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent)).map((agent) => applyInitialCodexModel(agent, firstModel)),
      reviewAgents: (current.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent)).map((agent) => applyInitialCodexModel(agent, firstModel)),
      scanningAgents: (current.scanningAgents ?? SCANNING_AGENT_MODES.map(defaultScanningAgent)).map((agent) => applyInitialCodexModel(agent, firstModel))
    }));
  }, [codexModels]);

  useEffect(() => {
    const firstModel = claudeModels[0];
    if (!firstModel) {
      return;
    }
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => applyInitialClaudeModel(agent, firstModel)),
      codingAgents: (current.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent)).map((agent) => applyInitialClaudeModel(agent, firstModel)),
      reviewAgents: (current.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent)).map((agent) => applyInitialClaudeModel(agent, firstModel)),
      scanningAgents: (current.scanningAgents ?? SCANNING_AGENT_MODES.map(defaultScanningAgent)).map((agent) => applyInitialClaudeModel(agent, firstModel))
    }));
  }, [claudeModels]);

  const updateAgent = (agentKind: AgentKind, patch: AgentSettingsPatch) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.agentKind === agentKind ? { ...agent, ...patch } : agent))
    }));
  };

    const updateCodingAgent = (mode: CodingAgentMode, patch: AgentSettingsPatch) => {
    setDraft((current) => ({
      ...current,
      codingAgents: (current.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent)).map((agent) => (agent.mode === mode ? { ...agent, ...patch } : agent))
    }));
    };

    const updateReviewAgent = (mode: ReviewAgentMode, patch: AgentSettingsPatch) => {
      setDraft((current) => ({
        ...current,
        reviewAgents: (current.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent)).map((agent) => (agent.mode === mode ? { ...agent, ...patch } : agent))
      }));
    };

	  const updateScanningAgent = (mode: ScanningAgentMode, patch: AgentSettingsPatch) => {
    setDraft((current) => ({
      ...current,
      scanningAgents: (current.scanningAgents ?? SCANNING_AGENT_MODES.map(defaultScanningAgent)).map((agent) => (agent.mode === mode ? { ...agent, ...patch } : agent))
    }));
  };

  const toggleExtensionPackage = (packageId: WorkspaceSettings["extensions"]["enabledPackageIds"][number], enabled: boolean) => {
    setDraft((current) => {
      const extensions = current.extensions ?? { enabledPackageIds: [], configs: {} };
      const enabledPackageIds = new Set(extensions.enabledPackageIds);
      if (enabled) {
        enabledPackageIds.add(packageId);
      } else {
        enabledPackageIds.delete(packageId);
      }
      return {
        ...current,
        extensions: {
          ...extensions,
          enabledPackageIds: [...enabledPackageIds],
          configs: extensions.configs ?? {}
        }
      };
    });
  };

  const setApiKeySourceType = (agent: AgentConfig, type: AgentConfig["apiKeySource"]["type"]) => {
    updateAgent(agent.agentKind, {
      apiKeySource: { type, value: "" }
    });
  };

  const setSystemPromptSourceType = (agent: AgentConfig, type: AgentConfig["systemPromptSource"]["type"]) => {
    updateAgent(agent.agentKind, {
      systemPromptSource: { type, value: type === "manual" ? agent.systemPromptSource.value ?? "" : "" }
    });
  };

  const setCodingApiKeySourceType = (agent: CodingAgentConfig, type: CodingAgentConfig["apiKeySource"]["type"]) => {
    updateCodingAgent(agent.mode, {
      apiKeySource: { type, value: "" }
    });
  };

    const setCodingSystemPromptSourceType = (agent: CodingAgentConfig, type: CodingAgentConfig["systemPromptSource"]["type"]) => {
    updateCodingAgent(agent.mode, {
      systemPromptSource: { type, value: type === "manual" ? agent.systemPromptSource.value ?? "" : "" }
    });
    };

    const setReviewApiKeySourceType = (agent: ReviewAgentConfig, type: ReviewAgentConfig["apiKeySource"]["type"]) => {
      updateReviewAgent(agent.mode, {
        apiKeySource: { type, value: "" }
      });
    };

    const setReviewSystemPromptSourceType = (agent: ReviewAgentConfig, type: ReviewAgentConfig["systemPromptSource"]["type"]) => {
      updateReviewAgent(agent.mode, {
        systemPromptSource: { type, value: type === "manual" ? agent.systemPromptSource.value ?? "" : "" }
      });
    };

    const setScanningApiKeySourceType = (agent: ScanningAgentConfig, type: ScanningAgentConfig["apiKeySource"]["type"]) => {
    updateScanningAgent(agent.mode, {
      apiKeySource: { type, value: "" }
    });
  };

  const setScanningSystemPromptSourceType = (agent: ScanningAgentConfig, type: ScanningAgentConfig["systemPromptSource"]["type"]) => {
    updateScanningAgent(agent.mode, {
      systemPromptSource: { type, value: type === "manual" ? agent.systemPromptSource.value ?? "" : "" }
    });
  };

  const handleApiKeyFile = async (agent: AgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = parseSecretFile(await readFileText(file));
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`${agent.agentKind}.apiKey`]: "" }));
      return;
    }
    updateAgent(agent.agentKind, {
      apiKeySource: { type: "file", value }
    });
    setReadSuccessByField((current) => ({ ...current, [`${agent.agentKind}.apiKey`]: "API key read successfully" }));
  };

  const handlePromptFile = async (agent: AgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = (await readFileText(file)).trim();
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`${agent.agentKind}.prompt`]: "" }));
      return;
    }
    updateAgent(agent.agentKind, {
      systemPromptSource: { type: "file", value }
    });
    setReadSuccessByField((current) => ({ ...current, [`${agent.agentKind}.prompt`]: "System prompt read successfully" }));
  };

  const handleCodingApiKeyFile = async (agent: CodingAgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = parseSecretFile(await readFileText(file));
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`coding.${agent.mode}.apiKey`]: "" }));
      return;
    }
    updateCodingAgent(agent.mode, {
      apiKeySource: { type: "file", value }
    });
    setReadSuccessByField((current) => ({ ...current, [`coding.${agent.mode}.apiKey`]: "API key read successfully" }));
  };

    const handleCodingPromptFile = async (agent: CodingAgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = (await readFileText(file)).trim();
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`coding.${agent.mode}.prompt`]: "" }));
      return;
    }
    updateCodingAgent(agent.mode, {
      systemPromptSource: { type: "file", value }
    });
      setReadSuccessByField((current) => ({ ...current, [`coding.${agent.mode}.prompt`]: "System prompt read successfully" }));
    };

    const handleReviewApiKeyFile = async (agent: ReviewAgentConfig, file: File | null) => {
      if (!file) {
        return;
      }
      const value = parseSecretFile(await readFileText(file));
      if (!value) {
        setReadSuccessByField((current) => ({ ...current, [`review.${agent.mode}.apiKey`]: "" }));
        return;
      }
      updateReviewAgent(agent.mode, {
        apiKeySource: { type: "file", value }
      });
      setReadSuccessByField((current) => ({ ...current, [`review.${agent.mode}.apiKey`]: "API key read successfully" }));
    };

    const handleReviewPromptFile = async (agent: ReviewAgentConfig, file: File | null) => {
      if (!file) {
        return;
      }
      const value = (await readFileText(file)).trim();
      if (!value) {
        setReadSuccessByField((current) => ({ ...current, [`review.${agent.mode}.prompt`]: "" }));
        return;
      }
      updateReviewAgent(agent.mode, {
        systemPromptSource: { type: "file", value }
      });
      setReadSuccessByField((current) => ({ ...current, [`review.${agent.mode}.prompt`]: "System prompt read successfully" }));
    };

    const handleScanningApiKeyFile = async (agent: ScanningAgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = parseSecretFile(await readFileText(file));
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`scanning.${agent.mode}.apiKey`]: "" }));
      return;
    }
    updateScanningAgent(agent.mode, {
      apiKeySource: { type: "file", value }
    });
    setReadSuccessByField((current) => ({ ...current, [`scanning.${agent.mode}.apiKey`]: "API key read successfully" }));
  };

  const handleScanningPromptFile = async (agent: ScanningAgentConfig, file: File | null) => {
    if (!file) {
      return;
    }
    const value = (await readFileText(file)).trim();
    if (!value) {
      setReadSuccessByField((current) => ({ ...current, [`scanning.${agent.mode}.prompt`]: "" }));
      return;
    }
    updateScanningAgent(agent.mode, {
      systemPromptSource: { type: "file", value }
    });
    setReadSuccessByField((current) => ({ ...current, [`scanning.${agent.mode}.prompt`]: "System prompt read successfully" }));
  };

  const handleStartGithub = async () => {
    setGithubBusy(true);
    setGithubMessage("");
    try {
      const result = await onStartGithubDeviceFlow({
        clientId: draft.github.clientId,
        repository: draft.github.repository
      });
      setDeviceFlow(result);
      setGithubMessage("Open GitHub and enter the code.");
    } catch (error) {
      setGithubMessage(error instanceof Error ? error.message : "GitHub connection failed.");
    } finally {
      setGithubBusy(false);
    }
  };

  const handlePollGithub = async () => {
    if (!deviceFlow) {
      return;
    }
    setGithubBusy(true);
    try {
      const result = await onPollGithubDeviceFlow({
        deviceCode: deviceFlow.deviceCode,
        clientId: draft.github.clientId,
        repository: draft.github.repository
      });
      setGithubMessage(result.message);
      if (result.status === "connected") {
        setDeviceFlow(null);
      }
    } catch (error) {
      setGithubMessage(error instanceof Error ? error.message : "GitHub verification failed.");
    } finally {
      setGithubBusy(false);
    }
  };

  const handleDisconnectGithub = async () => {
    setGithubBusy(true);
    try {
      await onDisconnectGithub();
      setDeviceFlow(null);
      setGithubMessage("GitHub disconnected.");
    } catch (error) {
      setGithubMessage(error instanceof Error ? error.message : "GitHub disconnect failed.");
    } finally {
      setGithubBusy(false);
    }
  };

  const handleInstallCodex = async () => {
    setCodexBusy(true);
    setCodexMessage("");
    try {
      const result = await installCodexCli();
      setCodexStatus(result.status ?? null);
      setCodexMessage(result.message);
      await refreshCodex();
    } catch (error) {
      setCodexMessage(error instanceof Error ? error.message : "Codex install failed.");
    } finally {
      setCodexBusy(false);
    }
  };

  const handleStartCodexAuth = async () => {
    setCodexBusy(true);
    setCodexMessage("");
    try {
      const result = await startCodexAuth();
      setCodexStatus(result.status ?? null);
      setCodexMessage(result.message);
    } catch (error) {
      setCodexMessage(error instanceof Error ? error.message : "Codex auth failed.");
    } finally {
      setCodexBusy(false);
    }
  };

  const handleInstallClaude = async () => {
    setClaudeBusy(true);
    setClaudeMessage("");
    try {
      const result = await installClaudeCli();
      setClaudeStatus(result.status ?? null);
      setClaudeMessage(result.message);
      await refreshClaude();
    } catch (error) {
      setClaudeMessage(error instanceof Error ? error.message : "Claude Code install failed.");
    } finally {
      setClaudeBusy(false);
    }
  };

  const handleStartClaudeAuth = async () => {
    setClaudeBusy(true);
    setClaudeMessage("");
    try {
      const result = await startClaudeAuth();
      setClaudeStatus(result.status ?? null);
      setClaudeMessage(result.message);
    } catch (error) {
      setClaudeMessage(error instanceof Error ? error.message : "Claude Code auth failed.");
    } finally {
      setClaudeBusy(false);
    }
  };

  const renderModelControl = (agent: AgentSettingsLike, errorKey: string, onPatch: (patch: AgentSettingsPatch) => void) => {
    if (agent.provider === "codex") {
      const selectedModel = codexModelsBySlug.get(agent.model);
      return (
        <label className="form-field">
          <span title="Loaded from the authenticated Codex CLI model catalog.">Codex Model</span>
          <select
            value={agent.model}
            disabled={codexModels.length === 0}
            onChange={(event) => onPatch(codexModelPatch(event.target.value, codexModelsBySlug.get(event.target.value), agent))}
          >
            <option value="">{codexModels.length > 0 ? "Select a Codex model" : "No Codex models loaded"}</option>
            {codexModels.map((model) => (
              <option key={model.slug} value={model.slug} title={model.description}>
                {model.displayName}
              </option>
            ))}
          </select>
          {selectedModel?.description ? <small className="muted">{selectedModel.description}</small> : null}
          <FieldError value={errors[`${errorKey}.model`]} />
        </label>
      );
    }
    if (agent.provider === "claudecode") {
      const selectedModel = claudeModelsBySlug.get(agent.model);
      return (
        <label className="form-field">
          <span title="Loaded from Claude Code's documented CLI model aliases after CLI/auth status is verified.">Claude Model</span>
          <select
            value={agent.model}
            disabled={claudeModels.length === 0}
            onChange={(event) => onPatch(claudeModelPatch(event.target.value, claudeModelsBySlug.get(event.target.value), agent))}
          >
            <option value="">{claudeModels.length > 0 ? "Select a Claude model" : "No Claude models loaded"}</option>
            {claudeModels.map((model) => (
              <option key={model.slug} value={model.slug} title={model.description}>
                {model.displayName}
              </option>
            ))}
          </select>
          {selectedModel?.description ? <small className="muted">{selectedModel.description}</small> : null}
          <FieldError value={errors[`${errorKey}.model`]} />
        </label>
      );
    }
    return (
      <label className="form-field">
        <span>{modelFieldLabel(agent.provider)}</span>
        <input value={agent.model} onChange={(event) => onPatch({ model: event.target.value })} />
        <FieldError value={errors[`${errorKey}.model`]} />
      </label>
    );
  };

  const renderCodexControls = (agent: AgentSettingsLike, errorKey: string, onPatch: (patch: AgentSettingsPatch) => void) => {
    if (agent.provider !== "codex") {
      return null;
    }
    const selectedModel = codexModelsBySlug.get(agent.model);
    const reasoningLevels = selectedModel?.supportedReasoningLevels.length
      ? selectedModel.supportedReasoningLevels
      : [{ effort: "medium" as const, description: "Balances speed and reasoning depth for everyday tasks" }];
    const reasoningValue = reasoningLevels.some((level) => level.effort === agent.reasoningEffort) ? agent.reasoningEffort : reasoningLevels[0].effort;
    const fastAvailable = selectedModel?.speedTiers.includes("fast") ?? false;
    const speedTiers = fastAvailable ? ["standard", "fast"] as const : ["standard"] as const;
    const speedValue = fastAvailable && agent.speedTier === "fast" ? "fast" : "standard";
    return (
      <div className="codex-agent-controls">
        <div className="form-grid">
          <label className="form-field">
            <span title="Executable command GraphCode uses to launch Codex CLI for this agent.">CLI Command</span>
            <input value={agent.cliCommand || "codex"} onChange={(event) => onPatch({ cliCommand: event.target.value })} />
            <FieldError value={errors[`${errorKey}.cliCommand`]} />
          </label>
          <label className="form-field">
            <span title="Reasoning effort controls how much deliberation Codex applies before answering.">Reasoning Effort</span>
            <select value={reasoningValue} onChange={(event) => onPatch({ reasoningEffort: event.target.value as AgentSettingsLike["reasoningEffort"] })}>
              {reasoningLevels.map((level) => (
                <option key={level.effort} value={level.effort} title={level.description}>
                  {reasoningEffortLabel(level.effort)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span title="Fast mode prioritizes quicker Codex responses and may increase usage.">Speed</span>
            <select value={speedValue} onChange={(event) => onPatch({ speedTier: event.target.value as AgentSettingsLike["speedTier"] })}>
              <option value="standard">Standard</option>
              {fastAvailable ? (
                <option value="fast" title="Higher speed with increased usage.">
                  Fast
                </option>
              ) : null}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label className="form-field">
            <span title="Controls whether Codex proposes changes or can edit the workspace directly.">Permission Mode</span>
            <select value={agent.permissionMode} onChange={(event) => onPatch({ permissionMode: event.target.value as AgentSettingsLike["permissionMode"] })}>
              <option value="ask_for_permission">Ask for permission</option>
              <option value="approve_for_me">Approve for me</option>
              <option value="full_access">Full access</option>
            </select>
          </label>
          <label className="form-field">
            <span title="Use Codex's built-in system prompt or pass your custom prompt as Codex developer instructions.">System Prompt</span>
            <select
              value={agent.codexSystemPromptMode}
              onChange={(event) => onPatch({ codexSystemPromptMode: event.target.value as AgentSettingsLike["codexSystemPromptMode"] })}
            >
              <option value="default">Default Codex system prompt</option>
              <option value="custom">Custom prompt</option>
            </select>
          </label>
        </div>
        {agent.codexSystemPromptMode === "custom" ? (
          <label className="form-field">
            <span>Custom Prompt</span>
            <textarea
              rows={3}
              value={agent.systemPromptSource.value ?? ""}
              onChange={(event) => onPatch({ systemPromptSource: { type: "manual", value: event.target.value } })}
            />
            <FieldError value={errors[`${errorKey}.systemPromptSource.value`]} />
          </label>
        ) : null}
      </div>
    );
  };

  const renderClaudeControls = (agent: AgentSettingsLike, errorKey: string, onPatch: (patch: AgentSettingsPatch) => void) => {
    if (agent.provider !== "claudecode") {
      return null;
    }
    const selectedModel = claudeModelsBySlug.get(agent.model);
    const reasoningLevels = selectedModel?.supportedReasoningLevels.length
      ? selectedModel.supportedReasoningLevels
      : [{ effort: "medium" as const, description: "Balances speed and reasoning depth for everyday tasks" }];
    const reasoningValue = reasoningLevels.some((level) => level.effort === agent.reasoningEffort) ? agent.reasoningEffort : reasoningLevels[0].effort;
    const fastAvailable = selectedModel?.speedTiers.includes("fast") ?? false;
    const speedTiers = fastAvailable ? ["standard", "fast"] as const : ["standard"] as const;
    const speedValue = fastAvailable && agent.speedTier === "fast" ? "fast" : "standard";
    return (
      <div className="codex-agent-controls">
        <div className="form-grid">
          <label className="form-field">
            <span title="Executable command GraphCode uses to launch Claude Code for this agent.">CLI Command</span>
            <input value={agent.cliCommand || "claude"} onChange={(event) => onPatch({ cliCommand: event.target.value })} />
            <FieldError value={errors[`${errorKey}.cliCommand`]} />
          </label>
          <label className="form-field">
            <span title="Claude Code reasoning effort controls how much deliberation is used for this session.">Reasoning Effort</span>
            <select value={reasoningValue} onChange={(event) => onPatch({ reasoningEffort: event.target.value as AgentSettingsLike["reasoningEffort"] })}>
              {reasoningLevels.map((level) => (
                <option key={level.effort} value={level.effort} title={level.description}>
                  {reasoningEffortLabel(level.effort)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span title="Claude fast mode is available for supported Opus sessions and may increase usage.">Speed</span>
            <select value={speedValue} onChange={(event) => onPatch({ speedTier: event.target.value as AgentSettingsLike["speedTier"] })}>
              {speedTiers.map((tier) => (
                <option key={tier} value={tier} title={tier === "fast" ? "Higher speed with increased usage." : "Standard Claude Code response speed."}>
                  {tier === "fast" ? "Fast" : "Standard"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label className="form-field">
            <span title="Controls whether Claude Code plans only, accepts edits, or bypasses permission prompts.">Permission Mode</span>
            <select value={agent.permissionMode} onChange={(event) => onPatch({ permissionMode: event.target.value as AgentSettingsLike["permissionMode"] })}>
              <option value="ask_for_permission">Ask for permission</option>
              <option value="approve_for_me">Approve for me</option>
              <option value="full_access">Full access</option>
            </select>
          </label>
          <label className="form-field">
            <span title="Use Claude Code's built-in system prompt or append your custom GraphCode prompt for this run.">System Prompt</span>
            <select
              value={agent.claudeSystemPromptMode}
              onChange={(event) => onPatch({ claudeSystemPromptMode: event.target.value as AgentSettingsLike["claudeSystemPromptMode"] })}
            >
              <option value="default">Default Claude Code system prompt</option>
              <option value="custom">Custom prompt</option>
            </select>
          </label>
        </div>
        {agent.claudeSystemPromptMode === "custom" ? (
          <label className="form-field">
            <span>Custom Prompt</span>
            <textarea
              rows={3}
              value={agent.systemPromptSource.value ?? ""}
              onChange={(event) => onPatch({ systemPromptSource: { type: "manual", value: event.target.value } })}
            />
            <FieldError value={errors[`${errorKey}.systemPromptSource.value`]} />
          </label>
        ) : null}
      </div>
    );
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
      <div className="settings-page">
        <div className="settings-title">
          <div>
            <h2 id="settings-dialog-title">Settings</h2>
            <p>{project.rootPath}</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close settings" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" role="tablist" aria-label="Settings sections">
            <button type="button" id="settings-tab-general" role="tab" aria-selected={activeSection === "general"} aria-controls="settings-panel" className={activeSection === "general" ? "active" : ""} onClick={() => setActiveSection("general")}>
              <Monitor size={16} />
              General
            </button>
            <button type="button" id="settings-tab-agents" role="tab" aria-selected={activeSection === "agents"} aria-controls="settings-panel" className={activeSection === "agents" ? "active" : ""} onClick={() => setActiveSection("agents")}>
              <Bot size={16} />
              Agents
            </button>
            <button type="button" id="settings-tab-extensions" role="tab" aria-selected={activeSection === "extensions"} aria-controls="settings-panel" className={activeSection === "extensions" ? "active" : ""} onClick={() => setActiveSection("extensions")}>
              <Boxes size={16} />
              Extensions
            </button>
            <button type="button" id="settings-tab-integrations" role="tab" aria-selected={activeSection === "integrations"} aria-controls="settings-panel" className={activeSection === "integrations" ? "active" : ""} onClick={() => setActiveSection("integrations")}>
              <Terminal size={16} />
              Integrations
            </button>
            <button type="button" id="settings-tab-github" role="tab" aria-selected={activeSection === "github"} aria-controls="settings-panel" className={activeSection === "github" ? "active" : ""} onClick={() => setActiveSection("github")}>
              <Github size={16} />
              GitHub
            </button>
          </nav>

          <main id="settings-panel" className="settings-content" role="tabpanel" aria-labelledby={`settings-tab-${activeSection}`}>
            {activeSection === "general" ? (
              <section className="settings-section">
                <h3>General</h3>
                <label className="form-field">
                  <span>Display Theme</span>
                  <select value={draft.general.theme} onChange={(event) => setDraft({ ...draft, general: { theme: event.target.value as WorkspaceSettings["general"]["theme"] } })}>
                    <option value="system">System</option>
                    <option value="light">Day</option>
                    <option value="dark">Night</option>
                  </select>
                </label>
              </section>
            ) : null}

            {activeSection === "extensions" ? (
              <section className="settings-section agent-settings-grid">
                <h3>Extensions</h3>
                {settings.extensions.availablePackages.map((extensionPackage) => {
                  const enabled = (draft.extensions?.enabledPackageIds ?? []).includes(extensionPackage.id);
                  return (
                    <div className="agent-settings-card" key={extensionPackage.id}>
                      <h4>{extensionPackage.name}</h4>
                      <p className="muted">{extensionPackage.description}</p>
                      <label className="inline-control">
                        <input type="checkbox" checked={enabled} onChange={(event) => toggleExtensionPackage(extensionPackage.id, event.target.checked)} />
                        <span>Enabled</span>
                      </label>
                      <small className="muted">{extensionPackage.nodeKinds.length} block types</small>
                    </div>
                  );
                })}
              </section>
            ) : null}

            {activeSection === "integrations" ? (
              <section className="settings-section agent-settings-grid">
                <h3>Integrations</h3>
                <div className="agent-settings-card">
                  <h4>Codex CLI</h4>
                  <div className="github-auth-box">
                    <div>
                      <span className={codexStatus?.installed && codexStatus.authenticated && codexStatus.modelsAvailable ? "settings-ok" : "settings-error"}>
                        {codexStatus?.installed
                          ? codexStatus.authenticated
                            ? codexStatus.modelsAvailable
                              ? "Installed, authenticated, and model catalog ready"
                              : "Installed and authenticated; model catalog unavailable"
                            : "Installed; authentication required"
                          : "Not installed"}
                      </span>
                      <small>Command: {codexStatus?.resolvedPath ?? codexStatus?.command ?? "codex"}</small>
                      {codexStatus?.version ? <small>Version: {codexStatus.version}</small> : null}
                      {codexStatus?.authStatus ? <small>{codexStatus.authStatus}</small> : null}
                      <small>Models loaded: {codexModels.length}</small>
                    </div>
                    <div className="github-auth-actions">
                      <Button size="sm" variant="ghost" isDisabled={codexBusy} onPress={() => void refreshCodex()}>
                        <RefreshCw size={15} />
                        Refresh
                      </Button>
                      <Button size="sm" variant="secondary" isDisabled={codexBusy || codexStatus?.installed === true} onPress={() => void handleInstallCodex()}>
                        <Terminal size={15} />
                        Install
                      </Button>
                      <Button size="sm" variant="primary" isDisabled={codexBusy || !codexStatus?.installed || codexStatus.authenticated} onPress={() => void handleStartCodexAuth()}>
                        <ExternalLink size={15} />
                        Auth
                      </Button>
                    </div>
                  </div>
	                  {codexMessage ? <p className="settings-note">{codexMessage}</p> : null}
	                  {codexStatus?.error ? <FieldError value={codexStatus.error} /> : null}
	                </div>
	                <div className="agent-settings-card">
	                  <h4>Claude Code CLI</h4>
	                  <div className="github-auth-box">
	                    <div>
	                      <span className={claudeStatus?.installed && claudeStatus.authenticated && claudeStatus.modelsAvailable ? "settings-ok" : "settings-error"}>
	                        {claudeStatus?.installed
	                          ? claudeStatus.authenticated
	                            ? claudeStatus.modelsAvailable
	                              ? "Installed, authenticated, and model aliases ready"
	                              : "Installed and authenticated; model aliases unavailable"
	                            : "Installed; authentication required"
	                          : "Not installed"}
	                      </span>
	                      <small>Command: {claudeStatus?.resolvedPath ?? claudeStatus?.command ?? "claude"}</small>
	                      {claudeStatus?.version ? <small>Version: {claudeStatus.version}</small> : null}
	                      {claudeStatus?.authStatus ? <small>{claudeStatus.authStatus}</small> : null}
	                      <small>Models loaded: {claudeModels.length}</small>
	                    </div>
	                    <div className="github-auth-actions">
	                      <Button size="sm" variant="ghost" isDisabled={claudeBusy} onPress={() => void refreshClaude()}>
	                        <RefreshCw size={15} />
	                        Refresh
	                      </Button>
	                      <Button size="sm" variant="secondary" isDisabled={claudeBusy || claudeStatus?.installed === true} onPress={() => void handleInstallClaude()}>
	                        <Terminal size={15} />
	                        Install
	                      </Button>
	                      <Button size="sm" variant="primary" isDisabled={claudeBusy || !claudeStatus?.installed || claudeStatus.authenticated} onPress={() => void handleStartClaudeAuth()}>
	                        <ExternalLink size={15} />
	                        Auth
	                      </Button>
	                    </div>
	                  </div>
	                  {claudeMessage ? <p className="settings-note">{claudeMessage}</p> : null}
	                  {claudeStatus?.error ? <FieldError value={claudeStatus.error} /> : null}
	                </div>
	              </section>
	            ) : null}

            {activeSection === "agents" ? (
              <section className="settings-section agent-settings-grid">
                <h3>Agents</h3>
                <label className="inline-control">
                  <input
                    type="checkbox"
                    checked={draft.automation.autoReviewAfterCoding}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        automation: { ...draft.automation, autoReviewAfterCoding: event.target.checked }
                      })
                    }
                  />
                  <span>Auto-run Review After Coding</span>
                </label>
                {agentKinds.map((agentKind) => {
                  const agent = agentByKind.get(agentKind)!;
                  const index = draft.agents.findIndex((item) => item.agentKind === agentKind);
                  return (
                    <div className="agent-settings-card" key={agentKind}>
                      <h4>{agentKindLabel(agentKind)}</h4>
                      <div className="form-grid">
                        <label className="form-field">
                          <span>Provider</span>
                          <select value={agent.provider} onChange={(event) => updateAgent(agentKind, providerPatch(agent.model, event.target.value as AgentProvider, codexModels[0], claudeModels[0]))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderModelControl(agent, `agents.${index}`, (patch) => updateAgent(agentKind, patch))}
                      </div>
                      {renderCodexControls(agent, `agents.${index}`, (patch) => updateAgent(agentKind, patch))}
                      {renderClaudeControls(agent, `agents.${index}`, (patch) => updateAgent(agentKind, patch))}
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>API Key Source</span>
                          <select
                            value={agent.apiKeySource.type}
                            disabled={isCliProvider(agent.provider)}
                            onChange={(event) => setApiKeySourceType(agent, event.target.value as AgentConfig["apiKeySource"]["type"])}
                          >
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                            <option value="env">Environment Variable</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{authEntryLabel(agent.provider, agent.apiKeySource.type)}</span>
                          <ApiKeyEntry
                            agent={agent}
                            configured={settings.agents.find((item) => item.agentKind === agentKind)?.apiKeyConfigured ?? false}
                            onChange={(value) => updateAgent(agentKind, { apiKeySource: { ...agent.apiKeySource, value } })}
                            onFile={(file) => void handleApiKeyFile(agent, file)}
                          />
                          <ReadSuccess value={readSuccessByField[`${agentKind}.apiKey`]} />
                          <FieldError value={errors[`agents.${index}.apiKeySource.value`]} />
                        </div>
                      </div>
                      ) : null}
                      <label className="form-field">
                        <span>Parallel Calls</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={agent.parallelLimit}
                          onChange={(event) => updateAgent(agentKind, { parallelLimit: Number.parseInt(event.target.value, 10) || 1 })}
                        />
                      </label>
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>System Prompt Source</span>
                          <select value={agent.systemPromptSource.type} onChange={(event) => setSystemPromptSourceType(agent, event.target.value as AgentConfig["systemPromptSource"]["type"])}>
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{agent.systemPromptSource.type === "file" ? "System Prompt File" : "System Prompt"}</span>
                          {agent.systemPromptSource.type === "file" ? (
                            <>
                              <FilePicker label="Select Prompt File" accept=".txt,.md,.prompt,*/*" onFile={(file) => void handlePromptFile(agent, file)} />
                              <ReadSuccess value={readSuccessByField[`${agentKind}.prompt`]} />
                            </>
                          ) : (
                            <textarea
                              rows={3}
                              value={agent.systemPromptSource.value ?? ""}
                              onChange={(event) =>
                                updateAgent(agentKind, {
                                  systemPromptSource: { ...agent.systemPromptSource, value: event.target.value }
                                })
                              }
                            />
                          )}
                          <FieldError value={errors[`agents.${index}.systemPromptSource.value`]} />
                        </div>
                      </div>
                      ) : null}
                    </div>
                  );
                })}
                  {CODING_AGENT_MODES.map((mode) => {
                    const agent = codingAgentByMode.get(mode)!;
                    const index = codingAgentDrafts.findIndex((item) => item.mode === mode);
                  return (
                    <div className="agent-settings-card" key={`coding-${mode}`}>
                      <h4>Coding {codingAgentModeLabel(mode)}</h4>
                      <div className="form-grid">
                        <label className="form-field">
                          <span>Provider</span>
                          <select value={agent.provider} onChange={(event) => updateCodingAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider, codexModels[0], claudeModels[0]))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderModelControl(agent, `codingAgents.${index}`, (patch) => updateCodingAgent(mode, patch))}
                      </div>
                      {renderCodexControls(agent, `codingAgents.${index}`, (patch) => updateCodingAgent(mode, patch))}
                      {renderClaudeControls(agent, `codingAgents.${index}`, (patch) => updateCodingAgent(mode, patch))}
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>API Key Source</span>
                          <select
                            value={agent.apiKeySource.type}
                            disabled={isCliProvider(agent.provider)}
                            onChange={(event) => setCodingApiKeySourceType(agent, event.target.value as CodingAgentConfig["apiKeySource"]["type"])}
                          >
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                            <option value="env">Environment Variable</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{authEntryLabel(agent.provider, agent.apiKeySource.type)}</span>
                          <ApiKeyEntry
                            agent={agent}
                            configured={(settings.codingAgents ?? []).find((item) => item.mode === mode)?.apiKeyConfigured ?? false}
                            onChange={(value) => updateCodingAgent(mode, { apiKeySource: { ...agent.apiKeySource, value } })}
                            onFile={(file) => void handleCodingApiKeyFile(agent, file)}
                          />
                          <ReadSuccess value={readSuccessByField[`coding.${mode}.apiKey`]} />
                          <FieldError value={errors[`codingAgents.${index}.apiKeySource.value`]} />
                        </div>
                      </div>
                      ) : null}
                      <label className="form-field">
                        <span>Parallel Calls</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={agent.parallelLimit}
                          onChange={(event) => updateCodingAgent(mode, { parallelLimit: Number.parseInt(event.target.value, 10) || 1 })}
                        />
                      </label>
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>System Prompt Source</span>
                          <select value={agent.systemPromptSource.type} onChange={(event) => setCodingSystemPromptSourceType(agent, event.target.value as CodingAgentConfig["systemPromptSource"]["type"])}>
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{agent.systemPromptSource.type === "file" ? "System Prompt File" : "System Prompt"}</span>
                          {agent.systemPromptSource.type === "file" ? (
                            <>
                              <FilePicker label="Select Prompt File" accept=".txt,.md,.prompt,*/*" onFile={(file) => void handleCodingPromptFile(agent, file)} />
                              <ReadSuccess value={readSuccessByField[`coding.${mode}.prompt`]} />
                            </>
                          ) : (
                            <textarea
                              rows={3}
                              value={agent.systemPromptSource.value ?? ""}
                              onChange={(event) =>
                                updateCodingAgent(mode, {
                                  systemPromptSource: { ...agent.systemPromptSource, value: event.target.value }
                                })
                              }
                            />
                          )}
                          <FieldError value={errors[`codingAgents.${index}.systemPromptSource.value`]} />
                        </div>
                      </div>
                      ) : null}
                      </div>
                    );
                  })}
                  {REVIEW_AGENT_MODES.map((mode) => {
                    const agent = reviewAgentByMode.get(mode)!;
                    const index = reviewAgentDrafts.findIndex((item) => item.mode === mode);
                    return (
                      <div className="agent-settings-card" key={`review-${mode}`}>
                        <h4>Review {reviewAgentModeLabel(mode)}</h4>
                        <div className="form-grid">
                          <label className="form-field">
                            <span>Provider</span>
                            <select value={agent.provider} onChange={(event) => updateReviewAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider, codexModels[0], claudeModels[0]))}>
                              {providers.map((provider) => (
                                <option key={provider} value={provider}>
                                  {providerLabel(provider)}
                                </option>
                              ))}
                            </select>
                          </label>
                          {renderModelControl(agent, `reviewAgents.${index}`, (patch) => updateReviewAgent(mode, patch))}
                        </div>
                        {renderCodexControls(agent, `reviewAgents.${index}`, (patch) => updateReviewAgent(mode, patch))}
                        {renderClaudeControls(agent, `reviewAgents.${index}`, (patch) => updateReviewAgent(mode, patch))}
                        {!isCliProvider(agent.provider) ? (
                        <div className="form-grid">
                          <label className="form-field">
                            <span>API Key Source</span>
                            <select
                              value={agent.apiKeySource.type}
                              disabled={isCliProvider(agent.provider)}
                              onChange={(event) => setReviewApiKeySourceType(agent, event.target.value as ReviewAgentConfig["apiKeySource"]["type"])}
                            >
                              <option value="manual">Manual</option>
                              <option value="file">Read File</option>
                              <option value="env">Environment Variable</option>
                            </select>
                          </label>
                          <div className="form-field">
                            <span>{authEntryLabel(agent.provider, agent.apiKeySource.type)}</span>
                            <ApiKeyEntry
                              agent={agent}
                              configured={(settings.reviewAgents ?? []).find((item) => item.mode === mode)?.apiKeyConfigured ?? false}
                              onChange={(value) => updateReviewAgent(mode, { apiKeySource: { ...agent.apiKeySource, value } })}
                              onFile={(file) => void handleReviewApiKeyFile(agent, file)}
                            />
                            <ReadSuccess value={readSuccessByField[`review.${mode}.apiKey`]} />
                            <FieldError value={errors[`reviewAgents.${index}.apiKeySource.value`]} />
                          </div>
                        </div>
                        ) : null}
                        <label className="form-field">
                          <span>Parallel Calls</span>
                          <input
                            type="number"
                            min={1}
                            max={64}
                            value={agent.parallelLimit}
                            onChange={(event) => updateReviewAgent(mode, { parallelLimit: Number.parseInt(event.target.value, 10) || 1 })}
                          />
                        </label>
                        {!isCliProvider(agent.provider) ? (
                        <div className="form-grid">
                          <label className="form-field">
                            <span>System Prompt Source</span>
                            <select value={agent.systemPromptSource.type} onChange={(event) => setReviewSystemPromptSourceType(agent, event.target.value as ReviewAgentConfig["systemPromptSource"]["type"])}>
                              <option value="manual">Manual</option>
                              <option value="file">Read File</option>
                            </select>
                          </label>
                          <div className="form-field">
                            <span>{agent.systemPromptSource.type === "file" ? "System Prompt File" : "System Prompt"}</span>
                            {agent.systemPromptSource.type === "file" ? (
                              <>
                                <FilePicker label="Select Prompt File" accept=".txt,.md,.prompt,*/*" onFile={(file) => void handleReviewPromptFile(agent, file)} />
                                <ReadSuccess value={readSuccessByField[`review.${mode}.prompt`]} />
                              </>
                            ) : (
                              <textarea
                                rows={3}
                                value={agent.systemPromptSource.value ?? ""}
                                onChange={(event) =>
                                  updateReviewAgent(mode, {
                                    systemPromptSource: { ...agent.systemPromptSource, value: event.target.value }
                                  })
                                }
                              />
                            )}
                            <FieldError value={errors[`reviewAgents.${index}.systemPromptSource.value`]} />
                          </div>
                        </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {SCANNING_AGENT_MODES.map((mode) => {
                  const agent = scanningAgentByMode.get(mode)!;
                  const index = scanningAgentDrafts.findIndex((item) => item.mode === mode);
                  return (
                    <div className="agent-settings-card" key={`scanning-${mode}`}>
                      <h4>Scanning {scanningAgentModeLabel(mode)}</h4>
                      <div className="form-grid">
                        <label className="form-field">
                          <span>Provider</span>
                          <select value={agent.provider} onChange={(event) => updateScanningAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider, codexModels[0], claudeModels[0]))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {renderModelControl(agent, `scanningAgents.${index}`, (patch) => updateScanningAgent(mode, patch))}
                      </div>
                      {renderCodexControls(agent, `scanningAgents.${index}`, (patch) => updateScanningAgent(mode, patch))}
                      {renderClaudeControls(agent, `scanningAgents.${index}`, (patch) => updateScanningAgent(mode, patch))}
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>API Key Source</span>
                          <select
                            value={agent.apiKeySource.type}
                            disabled={isCliProvider(agent.provider)}
                            onChange={(event) => setScanningApiKeySourceType(agent, event.target.value as ScanningAgentConfig["apiKeySource"]["type"])}
                          >
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                            <option value="env">Environment Variable</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{authEntryLabel(agent.provider, agent.apiKeySource.type)}</span>
                          <ApiKeyEntry
                            agent={agent}
                            configured={(settings.scanningAgents ?? []).find((item) => item.mode === mode)?.apiKeyConfigured ?? false}
                            onChange={(value) => updateScanningAgent(mode, { apiKeySource: { ...agent.apiKeySource, value } })}
                            onFile={(file) => void handleScanningApiKeyFile(agent, file)}
                          />
                          <ReadSuccess value={readSuccessByField[`scanning.${mode}.apiKey`]} />
                          <FieldError value={errors[`scanningAgents.${index}.apiKeySource.value`]} />
                        </div>
                      </div>
                      ) : null}
                      <label className="form-field">
                        <span>Parallel Calls</span>
                        <input
                          type="number"
                          min={1}
                          max={64}
                          value={agent.parallelLimit}
                          onChange={(event) => updateScanningAgent(mode, { parallelLimit: Number.parseInt(event.target.value, 10) || 1 })}
                        />
                      </label>
                      {!isCliProvider(agent.provider) ? (
                      <div className="form-grid">
                        <label className="form-field">
                          <span>System Prompt Source</span>
                          <select value={agent.systemPromptSource.type} onChange={(event) => setScanningSystemPromptSourceType(agent, event.target.value as ScanningAgentConfig["systemPromptSource"]["type"])}>
                            <option value="manual">Manual</option>
                            <option value="file">Read File</option>
                          </select>
                        </label>
                        <div className="form-field">
                          <span>{agent.systemPromptSource.type === "file" ? "System Prompt File" : "System Prompt"}</span>
                          {agent.systemPromptSource.type === "file" ? (
                            <>
                              <FilePicker label="Select Prompt File" accept=".txt,.md,.prompt,*/*" onFile={(file) => void handleScanningPromptFile(agent, file)} />
                              <ReadSuccess value={readSuccessByField[`scanning.${mode}.prompt`]} />
                            </>
                          ) : (
                            <textarea
                              rows={3}
                              value={agent.systemPromptSource.value ?? ""}
                              onChange={(event) =>
                                updateScanningAgent(mode, {
                                  systemPromptSource: { ...agent.systemPromptSource, value: event.target.value }
                                })
                              }
                            />
                          )}
                          <FieldError value={errors[`scanningAgents.${index}.systemPromptSource.value`]} />
                        </div>
                      </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ) : null}

            {activeSection === "github" ? (
              <section className="settings-section">
                <h3>GitHub</h3>
                <label className="inline-control">
                  <input
                    type="checkbox"
                    checked={draft.github.enabled}
                    onChange={(event) => setDraft({ ...draft, github: { ...draft.github, enabled: event.target.checked } })}
                  />
                  <span>Enable GitHub Integration</span>
                </label>
                <label className="form-field">
                  <span>Repository</span>
                  <input
                    value={draft.github.repository}
                    placeholder="owner/repository"
                    onChange={(event) => setDraft({ ...draft, github: { ...draft.github, repository: event.target.value } })}
                  />
                  <FieldError value={errors["github.repository"]} />
                </label>
                <label className="form-field">
                  <span>OAuth Client ID</span>
                  <input
                    value={draft.github.clientId}
                    placeholder="Uses GRAPHCODE_GITHUB_CLIENT_ID when blank"
                    onChange={(event) => setDraft({ ...draft, github: { ...draft.github, clientId: event.target.value } })}
                  />
                  <FieldError value={errors["github.clientId"]} />
                </label>

                <div className="github-auth-box">
                  <div>
                    <span className={settings.github.auth.connected ? "settings-ok" : "settings-error"}>
                      {settings.github.auth.connected ? `Connected as ${settings.github.auth.username}` : "Not Connected"}
                    </span>
                    {settings.github.auth.scopes.length > 0 ? <small>Scopes: {settings.github.auth.scopes.join(", ")}</small> : null}
                    {settings.github.auth.lastValidatedAt ? <small>Last validated: {settings.github.auth.lastValidatedAt}</small> : null}
                  </div>
                  <div className="github-auth-actions">
                    <Button size="sm" variant="secondary" isDisabled={githubBusy} onPress={() => void handleStartGithub()}>
                      <Github size={15} />
                      Connect
                    </Button>
                    <Button size="sm" variant="ghost" isDisabled={githubBusy || !settings.github.auth.tokenConfigured} onPress={() => void handleDisconnectGithub()}>
                      <Unplug size={15} />
                      Disconnect
                    </Button>
                  </div>
                </div>

                {deviceFlow ? (
                  <div className="github-device-box">
                    <div>
                      <span>Verification Code</span>
                      <strong>{deviceFlow.userCode}</strong>
                    </div>
                    <a href={deviceFlow.verificationUri} target="_blank" rel="noreferrer">
                      Open GitHub
                      <ExternalLink size={14} />
                    </a>
                    <Button size="sm" variant="primary" isDisabled={githubBusy} onPress={() => void handlePollGithub()}>
                      I Authorized
                    </Button>
                  </div>
                ) : null}
                {githubMessage ? <p className="settings-note">{githubMessage}</p> : null}
              </section>
            ) : null}
          </main>
        </div>

        <div className="settings-actions">
          {validation ? <span className={validation.ok ? "settings-ok" : "settings-error"}>{validation.ok ? "Settings Test Passed" : "Settings Test Found Errors"}</span> : null}
          <Button variant="primary" isDisabled={saving} onPress={() => onSave(draft)}>
            <Save size={16} />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyEntry({
    agent,
    configured,
    onChange,
    onFile
}: {
    agent:
      | Pick<AgentConfig, "provider" | "apiKeySource">
      | Pick<CodingAgentConfig, "provider" | "apiKeySource">
      | Pick<ReviewAgentConfig, "provider" | "apiKeySource">
      | Pick<ScanningAgentConfig, "provider" | "apiKeySource">;
  configured: boolean;
  onChange: (value: string) => void;
  onFile: (file: File | null) => void;
}) {
  if (isCliProvider(agent.provider)) {
    return <small className="muted">Uses your logged-in {providerLabel(agent.provider)} account. No API key is stored.</small>;
  }
  if (agent.apiKeySource.type === "file") {
    return <FilePicker label="Select Key File" accept=".env,.txt,*/*" onFile={onFile} />;
  }
  if (agent.apiKeySource.type === "env") {
    return <input value={agent.apiKeySource.value ?? ""} placeholder="OPENAI_API_KEY" onChange={(event) => onChange(event.target.value)} />;
  }
  return <input type="password" value={agent.apiKeySource.value ?? ""} placeholder={configured ? "Configured - leave blank to keep" : "Paste API key"} onChange={(event) => onChange(event.target.value)} />;
}

function FilePicker({ label, accept, onFile }: { label: string; accept: string; onFile: (file: File | null) => void }) {
  return (
    <label className="file-picker-button">
      <input type="file" accept={accept} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
      {label}
    </label>
  );
}

function ReadSuccess({ value }: { value?: string }) {
  return value ? (
    <small className="read-success">
      <CheckCircle2 size={13} />
      {value}
    </small>
  ) : null;
}

function FieldError({ value }: { value?: string }) {
  return value ? <small className="field-error">{value}</small> : null;
}

function parseSecretFile(value: string): string {
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const parsed = line.includes("=") ? line.slice(line.indexOf("=") + 1).trim() : line;
    return parsed.replace(/^['"]|['"]$/g, "");
  }
  return "";
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

function modelFieldLabel(provider: AgentProvider): string {
  return provider === "claudecode" ? "Claude Model" : "Model";
}

function authEntryLabel(provider: AgentProvider, type: AgentConfig["apiKeySource"]["type"]): string {
  return isCliProvider(provider) ? "CLI Account" : apiKeyEntryLabel(type);
}

function apiKeyEntryLabel(type: AgentConfig["apiKeySource"]["type"]): string {
  if (type === "env") {
    return "Environment Variable Name";
  }
  if (type === "file") {
    return "API Key File";
  }
  return "API Key Entry";
}

function providerPatch(currentModel: string, provider: AgentProvider, firstCodexModel?: CodexModelInfo, firstClaudeModel?: ClaudeModelInfo): AgentSettingsPatch {
  if (provider === "codex") {
    return {
      provider,
      model: firstCodexModel?.slug ?? "",
      cliCommand: "codex",
      reasoningEffort: firstCodexModel?.defaultReasoningLevel ?? "medium",
      speedTier: "standard",
      permissionMode: "ask_for_permission",
      codexSystemPromptMode: "default",
      apiKeySource: { type: "env", value: "" },
      systemPromptSource: { type: "manual", value: "" }
    };
  }
  if (provider === "claudecode") {
    return {
      provider,
      model: firstClaudeModel?.slug ?? "",
      cliCommand: "claude",
      reasoningEffort: firstClaudeModel?.defaultReasoningLevel ?? "medium",
      speedTier: "standard",
      permissionMode: "ask_for_permission",
      claudeSystemPromptMode: "default",
      apiKeySource: { type: "env", value: "" },
      systemPromptSource: { type: "manual", value: "" }
    };
  }
  return {
    provider,
    model: currentModel,
    cliCommand: ""
  };
}

function isCliProvider(provider: AgentProvider): provider is "codex" | "claudecode" {
  return provider === "codex" || provider === "claudecode";
}

function codexModelPatch(modelSlug: string, model: CodexModelInfo | undefined, agent: AgentSettingsLike): AgentSettingsPatch {
  return {
    model: modelSlug,
    reasoningEffort: model?.defaultReasoningLevel ?? agent.reasoningEffort,
    speedTier: model?.speedTiers.includes(agent.speedTier) ? agent.speedTier : "standard"
  };
}

function claudeModelPatch(modelSlug: string, model: ClaudeModelInfo | undefined, agent: AgentSettingsLike): AgentSettingsPatch {
  return {
    model: modelSlug,
    reasoningEffort: model?.defaultReasoningLevel ?? agent.reasoningEffort,
    speedTier: model?.speedTiers.includes(agent.speedTier) ? agent.speedTier : "standard"
  };
}

function applyInitialCodexModel<T extends AgentSettingsLike>(agent: T, model: CodexModelInfo): T {
  if (agent.provider !== "codex" || agent.model.trim()) {
    return agent;
  }
  return {
    ...agent,
    model: model.slug,
    cliCommand: agent.cliCommand?.trim() || "codex",
    reasoningEffort: model.defaultReasoningLevel,
    speedTier: "standard",
    permissionMode: agent.permissionMode ?? "ask_for_permission",
    codexSystemPromptMode: agent.codexSystemPromptMode ?? "default"
  };
}

function applyInitialClaudeModel<T extends AgentSettingsLike>(agent: T, model: ClaudeModelInfo): T {
  if (agent.provider !== "claudecode" || agent.model.trim()) {
    return agent;
  }
  return {
    ...agent,
    model: model.slug,
    cliCommand: agent.cliCommand?.trim() || "claude",
    reasoningEffort: model.defaultReasoningLevel,
    speedTier: "standard",
    permissionMode: agent.permissionMode ?? "ask_for_permission",
    claudeSystemPromptMode: agent.claudeSystemPromptMode ?? "default"
  };
}

function reasoningEffortLabel(value: AgentSettingsLike["reasoningEffort"]): string {
  switch (value) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra high";
    case "max":
      return "Max";
    case "ultra":
      return "Ultra";
    default:
      return value;
  }
}

function defaultCodingAgent(mode: CodingAgentMode): CodingAgentConfig {
  return {
    mode,
    provider: "fake",
    model: "graphcode-fake-v1",
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: mode === "large" ? 8 : mode === "medium" ? 4 : 2,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `Use ${mode} scoped coding context.` }
  };
}

function defaultReviewAgent(mode: ReviewAgentMode): ReviewAgentConfig {
  return {
    mode,
    provider: "fake",
    model: "graphcode-fake-v1",
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: mode === "large" ? 4 : mode === "medium" ? 2 : 1,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `Use ${mode} scoped review context.` }
  };
}

function defaultScanningAgent(mode: ScanningAgentMode): ScanningAgentConfig {
  return {
    mode,
    provider: "fake",
    model: `graphcode-scanner-${mode}-v1`,
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: mode === "local" ? 8 : mode === "medium" ? 4 : 1,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `Use ${mode} scanner context.` }
  };
}

function toMutation(settings: WorkspaceSettings) {
  const settingsCodingAgents = settings.codingAgents ?? [];
  const codingAgents = settingsCodingAgents.length > 0 ? settingsCodingAgents : CODING_AGENT_MODES.map(defaultCodingAgent);
  const settingsReviewAgents = settings.reviewAgents ?? [];
  const reviewAgents = settingsReviewAgents.length > 0 ? settingsReviewAgents : REVIEW_AGENT_MODES.map(defaultReviewAgent);
  const settingsScanningAgents = settings.scanningAgents ?? [];
  const scanningAgents = settingsScanningAgents.length > 0 ? settingsScanningAgents : SCANNING_AGENT_MODES.map(defaultScanningAgent);
  const extensionSettings = settings.extensions ?? { enabledPackageIds: [], configs: {} };
  return {
    general: settings.general,
    github: {
      enabled: settings.github.enabled,
      repository: settings.github.repository,
      clientId: settings.github.clientId
    },
    automation: settings.automation,
    extensions: {
      enabledPackageIds: extensionSettings.enabledPackageIds,
      configs: extensionSettings.configs
    },
    agents: settings.agents.map((agent) => ({
      agentKind: agent.agentKind,
      provider: agent.provider,
      model: agent.model,
      cliCommand: agent.cliCommand,
      reasoningEffort: agent.reasoningEffort,
      speedTier: agent.speedTier,
      permissionMode: agent.permissionMode,
      codexSystemPromptMode: agent.codexSystemPromptMode,
      claudeSystemPromptMode: agent.claudeSystemPromptMode,
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
      systemPromptSource: { ...agent.systemPromptSource, value: agent.systemPromptSource.value ?? "" }
    })),
      codingAgents: codingAgents.map((agent) => ({
        mode: agent.mode,
      provider: agent.provider,
      model: agent.model,
      cliCommand: agent.cliCommand,
      reasoningEffort: agent.reasoningEffort,
      speedTier: agent.speedTier,
      permissionMode: agent.permissionMode,
      codexSystemPromptMode: agent.codexSystemPromptMode,
      claudeSystemPromptMode: agent.claudeSystemPromptMode,
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
        systemPromptSource: { ...agent.systemPromptSource, value: agent.systemPromptSource.value ?? "" }
      })),
      reviewAgents: reviewAgents.map((agent) => ({
        mode: agent.mode,
        provider: agent.provider,
        model: agent.model,
        cliCommand: agent.cliCommand,
        reasoningEffort: agent.reasoningEffort,
        speedTier: agent.speedTier,
        permissionMode: agent.permissionMode,
        codexSystemPromptMode: agent.codexSystemPromptMode,
        claudeSystemPromptMode: agent.claudeSystemPromptMode,
        parallelLimit: agent.parallelLimit,
        apiKeySource: { ...agent.apiKeySource, value: "" },
        systemPromptSource: { ...agent.systemPromptSource, value: agent.systemPromptSource.value ?? "" }
      })),
      scanningAgents: scanningAgents.map((agent) => ({
      mode: agent.mode,
      provider: agent.provider,
      model: agent.model,
      cliCommand: agent.cliCommand,
      reasoningEffort: agent.reasoningEffort,
      speedTier: agent.speedTier,
      permissionMode: agent.permissionMode,
      codexSystemPromptMode: agent.codexSystemPromptMode,
      claudeSystemPromptMode: agent.claudeSystemPromptMode,
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
      systemPromptSource: { ...agent.systemPromptSource, value: agent.systemPromptSource.value ?? "" }
    }))
  };
}
