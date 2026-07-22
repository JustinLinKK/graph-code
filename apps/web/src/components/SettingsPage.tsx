import {
    CODING_AGENT_MODES,
    REVIEW_AGENT_MODES,
    SCANNING_AGENT_MODES,
    type AgentConfig,
    type AgentKind,
    type AgentProvider,
    type CodingAgentConfig,
    type CodingAgentMode,
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
import { Bot, CheckCircle2, Boxes, ExternalLink, Github, Monitor, Save, Unplug, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [activeSection, setActiveSection] = useState<"general" | "agents" | "extensions" | "github">("general");
  const [draft, setDraft] = useState<WorkspaceSettingsMutation>(() => toMutation(settings));
  const [readSuccessByField, setReadSuccessByField] = useState<Record<string, string>>({});
  const [deviceFlow, setDeviceFlow] = useState<GithubDeviceStartResponse | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMessage, setGithubMessage] = useState("");
  const errors = validation?.fieldErrors ?? {};
    const agentByKind = useMemo(() => new Map(draft.agents.map((agent) => [agent.agentKind, agent])), [draft.agents]);
    const codingAgentDrafts = useMemo(() => draft.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent), [draft.codingAgents]);
    const codingAgentByMode = useMemo(() => new Map(codingAgentDrafts.map((agent) => [agent.mode, agent])), [codingAgentDrafts]);
    const reviewAgentDrafts = useMemo(() => draft.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent), [draft.reviewAgents]);
    const reviewAgentByMode = useMemo(() => new Map(reviewAgentDrafts.map((agent) => [agent.mode, agent])), [reviewAgentDrafts]);
    const scanningAgentDrafts = useMemo(() => draft.scanningAgents ?? SCANNING_AGENT_MODES.map(defaultScanningAgent), [draft.scanningAgents]);
  const scanningAgentByMode = useMemo(() => new Map(scanningAgentDrafts.map((agent) => [agent.mode, agent])), [scanningAgentDrafts]);

  useEffect(() => {
    setDraft(toMutation(settings));
  }, [project.id]);

  const updateAgent = (agentKind: AgentKind, patch: Partial<AgentConfig>) => {
    setDraft((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.agentKind === agentKind ? { ...agent, ...patch } : agent))
    }));
  };

    const updateCodingAgent = (mode: CodingAgentMode, patch: Partial<CodingAgentConfig>) => {
    setDraft((current) => ({
      ...current,
      codingAgents: (current.codingAgents ?? CODING_AGENT_MODES.map(defaultCodingAgent)).map((agent) => (agent.mode === mode ? { ...agent, ...patch } : agent))
    }));
    };

    const updateReviewAgent = (mode: ReviewAgentMode, patch: Partial<ReviewAgentConfig>) => {
      setDraft((current) => ({
        ...current,
        reviewAgents: (current.reviewAgents ?? REVIEW_AGENT_MODES.map(defaultReviewAgent)).map((agent) => (agent.mode === mode ? { ...agent, ...patch } : agent))
      }));
    };

	  const updateScanningAgent = (mode: ScanningAgentMode, patch: Partial<ScanningAgentConfig>) => {
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

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-page">
        <div className="settings-title">
          <div>
            <h2>Settings</h2>
            <p>{project.rootPath}</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close settings" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            <button type="button" className={activeSection === "general" ? "active" : ""} onClick={() => setActiveSection("general")}>
              <Monitor size={16} />
              General
            </button>
            <button type="button" className={activeSection === "agents" ? "active" : ""} onClick={() => setActiveSection("agents")}>
              <Bot size={16} />
              Agents
            </button>
            <button type="button" className={activeSection === "extensions" ? "active" : ""} onClick={() => setActiveSection("extensions")}>
              <Boxes size={16} />
              Extensions
            </button>
            <button type="button" className={activeSection === "github" ? "active" : ""} onClick={() => setActiveSection("github")}>
              <Github size={16} />
              GitHub
            </button>
          </nav>

          <main className="settings-content">
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
                          <select value={agent.provider} onChange={(event) => updateAgent(agentKind, providerPatch(agent.model, event.target.value as AgentProvider))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span>{modelFieldLabel(agent.provider)}</span>
                          <input value={agent.model} onChange={(event) => updateAgent(agentKind, { model: event.target.value })} />
                          <FieldError value={errors[`agents.${index}.model`]} />
                        </label>
                      </div>
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
                          <select value={agent.provider} onChange={(event) => updateCodingAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span>{modelFieldLabel(agent.provider)}</span>
                          <input value={agent.model} onChange={(event) => updateCodingAgent(mode, { model: event.target.value })} />
                          <FieldError value={errors[`codingAgents.${index}.model`]} />
                        </label>
                      </div>
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
                            <select value={agent.provider} onChange={(event) => updateReviewAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider))}>
                              {providers.map((provider) => (
                                <option key={provider} value={provider}>
                                  {providerLabel(provider)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="form-field">
                            <span>{modelFieldLabel(agent.provider)}</span>
                            <input value={agent.model} onChange={(event) => updateReviewAgent(mode, { model: event.target.value })} />
                            <FieldError value={errors[`reviewAgents.${index}.model`]} />
                          </label>
                        </div>
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
                          <select value={agent.provider} onChange={(event) => updateScanningAgent(mode, providerPatch(agent.model, event.target.value as AgentProvider))}>
                            {providers.map((provider) => (
                              <option key={provider} value={provider}>
                                {providerLabel(provider)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span>{modelFieldLabel(agent.provider)}</span>
                          <input value={agent.model} onChange={(event) => updateScanningAgent(mode, { model: event.target.value })} />
                          <FieldError value={errors[`scanningAgents.${index}.model`]} />
                        </label>
                      </div>
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
  return isCliProvider(provider) ? "CLI Command" : "Model";
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

function providerPatch(currentModel: string, provider: AgentProvider): Pick<AgentConfig, "provider" | "model"> {
  return {
    provider,
    model: isCliProvider(provider) ? defaultCliCommand(provider) : currentModel
  };
}

function isCliProvider(provider: AgentProvider): provider is "codex" | "claudecode" {
  return provider === "codex" || provider === "claudecode";
}

function defaultCliCommand(provider: "codex" | "claudecode"): string {
  return provider === "codex" ? "codex" : "claude";
}

function defaultCodingAgent(mode: CodingAgentMode): CodingAgentConfig {
  return {
    mode,
    provider: "fake",
    model: "graphcode-fake-v1",
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
    parallelLimit: mode === "local" ? 8 : mode === "medium" ? 4 : 1,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `Use ${mode} scanner context.` }
  };
}

function toMutation(settings: WorkspaceSettings): WorkspaceSettingsMutation {
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
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
      systemPromptSource: agent.systemPromptSource
    })),
      codingAgents: codingAgents.map((agent) => ({
        mode: agent.mode,
      provider: agent.provider,
      model: agent.model,
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
        systemPromptSource: agent.systemPromptSource
      })),
      reviewAgents: reviewAgents.map((agent) => ({
        mode: agent.mode,
        provider: agent.provider,
        model: agent.model,
        parallelLimit: agent.parallelLimit,
        apiKeySource: { ...agent.apiKeySource, value: "" },
        systemPromptSource: agent.systemPromptSource
      })),
      scanningAgents: scanningAgents.map((agent) => ({
      mode: agent.mode,
      provider: agent.provider,
      model: agent.model,
      parallelLimit: agent.parallelLimit,
      apiKeySource: { ...agent.apiKeySource, value: "" },
      systemPromptSource: agent.systemPromptSource
    }))
  };
}
