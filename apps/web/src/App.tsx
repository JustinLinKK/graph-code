import type {
  AgentRun,
  BoundaryMutation,
  BoundaryUpdate,
  CanvasGraph,
  CodingAgentMode,
  CodingWorkflow,
  CodingWorkflowExecutionPolicy,
  CodingWorkflowPartitionConstraints,
  CreateCustomBlockType,
  CustomBlockType,
  EdgeMutation,
  EdgePointingDirection,
  EdgeUpdate,
  GraphBoundary,
  GraphEdge,
  GraphNodeKind,
  GraphTag,
  HierarchyNode,
  IndexState,
  NodeDetail,
  NodeTypeStyle,
  NodeMutation,
  NodeUpdate,
  Project,
  BlankWorkspaceInitialization,
  WorkspaceCreationMode,
  WorkspaceInitialization,
  WorkspaceSettings,
  WorkspaceSettingsMutation,
  SettingsValidationResult,
  TagAssignment
} from "@graphcode/graph-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyAgentGraphPatch,
  applyCodeProposal,
  applyCodingWorkflowLayer,
  autoLayoutCanvas,
  cancelCurrentIndexRun,
  controlCodingWorkflow,
  createBoundary,
  createCustomBlockType,
  createEdge,
  createNode,
  deleteBoundary,
  deleteEdge,
  getCanvasGraph,
  getCodingWorkflow,
  getHierarchy,
  getIndexState,
  getGitStatus,
  getNodeDetail,
  getWorkspaceSettings,
  listAgentRuns,
  listProjects,
  openWorkspace,
  pickWorkspaceFolder,
  previewCodingWorkflow,
  disconnectGithub,
  pollGithubDeviceFlow,
  runCodingAgent,
  runPlanningAgent,
  runReviewAgent,
  runScanningAgent,
  saveWorkspaceSettings,
  seedSelfWorkspace,
  startGithubDeviceFlow,
  startCodingWorkflow,
  updateCustomBlockType,
  updateBoundary,
  updateBoundaryTags,
  updateEdge,
  updateEdgeTags,
  updateNode,
  updateNodeLayout,
  updateNodeTags,
  updateNodeTypeStyle
} from "./api";
import { AppShell } from "./components/AppShell";
import { BlockEditorDialog } from "./components/BlockEditorDialog";
import { BoundaryEditorDialog, type BoundaryDraft } from "./components/BoundaryEditorDialog";
import { EdgeEditorDialog } from "./components/EdgeEditorDialog";
import type { MemberLayout } from "./components/WorkspaceCanvas";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import { SettingsPage } from "./components/SettingsPage";
import {
  getStoredCanvasProjectId,
  getStoredCanvasScope,
  getStoredCanvasViewport,
  rememberCanvasScope,
  rememberCanvasViewport,
  type CanvasViewport
} from "./canvasSession";
import { nodePalette } from "./graphStyles";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [canvas, setCanvas] = useState<CanvasGraph | null>(null);
  const [indexState, setIndexState] = useState<IndexState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceMissingPath, setWorkspaceMissingPath] = useState<string | null>(null);
  const [workspaceInitializationStatus, setWorkspaceInitializationStatus] = useState<"missing_graphcode" | "empty_graphcode" | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspacePicking, setWorkspacePicking] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockDialogMode, setBlockDialogMode] = useState<"create" | "edit">("create");
  const [editingDetail, setEditingDetail] = useState<NodeDetail | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);
  const [edgeDialogMode, setEdgeDialogMode] = useState<"create" | "edit">("create");
  const [editingEdge, setEditingEdge] = useState<GraphEdge | null>(null);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [boundaryDialogOpen, setBoundaryDialogOpen] = useState(false);
  const [boundaryDialogMode, setBoundaryDialogMode] = useState<"create" | "edit">("create");
  const [editingBoundary, setEditingBoundary] = useState<GraphBoundary | null>(null);
  const [boundaryDraft, setBoundaryDraft] = useState<BoundaryDraft | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [drawBoundaryMode, setDrawBoundaryMode] = useState(false);
  const [drawEdgeMode, setDrawEdgeMode] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState<{ sourceNodeId: string; targetNodeId: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [settingsValidation, setSettingsValidation] = useState<SettingsValidationResult | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [applyingRunIds, setApplyingRunIds] = useState<string[]>([]);
  const [codingWorkflow, setCodingWorkflow] = useState<CodingWorkflow | null>(null);
  const [workflowModeOverrides, setWorkflowModeOverrides] = useState<Record<string, CodingAgentMode>>({});
  const [workflowPartitionConstraints, setWorkflowPartitionConstraints] = useState<CodingWorkflowPartitionConstraints>({
    keepTogetherNodeGroups: [],
    separateNodePairs: [],
    approvedIgnoredEdges: []
  });
  const [workflowExecutionPolicy, setWorkflowExecutionPolicy] = useState<CodingWorkflowExecutionPolicy>({
    maximumConcurrency: 4,
    maxEstimatedCost: null,
    currency: "USD"
  });
  const [workflowPreviewDirty, setWorkflowPreviewDirty] = useState(false);
  const [gitStatus, setGitStatus] = useState("");
  const [restoreViewport, setRestoreViewport] = useState<CanvasViewport | null | undefined>(undefined);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const undoingRef = useRef(false);
  const scanningRunStatusRef = useRef<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const scanUsesCodexProvider = useMemo(
    () =>
      Boolean(
        settings?.agents.some((agent) => agent.agentKind === "scanning" && agent.provider === "codex") ||
          settings?.scanningAgents?.some((agent) => agent.provider === "codex")
      ),
    [settings]
  );
  const selectedEdge = useMemo(() => canvas?.edges.find((edge) => edge.id === selectedEdgeId) ?? null, [canvas?.edges, selectedEdgeId]);
  const selectedBoundary = useMemo(
    () => canvas?.boundaries.find((boundary) => boundary.id === selectedBoundaryId) ?? null,
    [canvas?.boundaries, selectedBoundaryId]
  );
  const pushUndo = useCallback((entry: UndoEntry) => {
    if (undoingRef.current) {
      return;
    }
    const nextStack = [...undoStackRef.current.slice(-49), entry];
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);
  }, []);

  const loadProject = useCallback(async (projectId: string, rootNodeId?: string | null, selectedNodeOverride?: string | null): Promise<CanvasGraph | null> => {
    setLoading(true);
    setError(null);
    setRestoreViewport(undefined);
    try {
      const [nextHierarchy, nextCanvas, nextIndexState] = await Promise.all([
        getHierarchy(projectId),
        getCanvasGraph(projectId, {
          rootNodeId,
          includeAttachments: true
        }),
        getIndexState(projectId)
      ]);
      setHierarchy(nextHierarchy);
      setCanvas(nextCanvas);
      setIndexState(nextIndexState);
      rememberCanvasScope(projectId, nextCanvas.scopeNodeId);
      setRestoreViewport(getStoredCanvasViewport(projectId, nextCanvas.scopeNodeId));
      const fallbackSelected = selectedNodeOverride !== undefined ? selectedNodeOverride : nextCanvas.scopeNodeId ?? nextCanvas.nodes[0]?.id ?? null;
      setSelectedNodeId(fallbackSelected);
      if (fallbackSelected) {
        setSelectedEdgeId(null);
        setSelectedBoundaryId(null);
      }
      if (fallbackSelected) {
        setSelectedDetail(await getNodeDetail(fallbackSelected));
      } else {
        setSelectedDetail(null);
      }
      const [nextSettings, nextRuns, nextGitStatus] = await Promise.all([
        getWorkspaceSettings(projectId),
        listAgentRuns(projectId),
        getGitStatus(projectId).catch(() => ({ status: "" }))
      ]);
      setSettings(nextSettings);
      setAgentRuns(nextRuns);
      setGitStatus(nextGitStatus.status);
      return nextCanvas;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load project.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLoadedProject = useCallback(() => {
    setSelectedProjectId(null);
    setHierarchy([]);
    setCanvas(null);
    setIndexState(null);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedBoundaryId(null);
    setSelectedDetail(null);
    setSettings(null);
    setAgentRuns([]);
    setGitStatus("");
    setRestoreViewport(null);
    undoStackRef.current = [];
    setUndoStack([]);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let nextProjects = await listProjects();
      setProjects(nextProjects);
      const storedProjectId = getStoredCanvasProjectId();
      const firstProject = storedProjectId ? nextProjects.find((project) => project.id === storedProjectId) ?? null : null;
      undoStackRef.current = [];
      setUndoStack([]);
      if (firstProject) {
        setSelectedProjectId(firstProject.id);
        const storedScopeNodeId = getStoredCanvasScope(firstProject.id);
        const loaded = await loadProject(firstProject.id, storedScopeNodeId ?? undefined);
        if (!loaded && storedScopeNodeId) {
          await loadProject(firstProject.id);
        }
      } else {
        clearLoadedProject();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to connect to the local server.");
    } finally {
      setLoading(false);
    }
  }, [clearLoadedProject, loadProject]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleInspectNode = useCallback(async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedBoundaryId(null);
    setLoading(true);
    setError(null);
    try {
      setSelectedDetail(await getNodeDetail(nodeId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load node.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpenNode = useCallback(
    async (nodeId: string) => {
      if (!selectedProjectId) {
        return;
      }
      await loadProject(selectedProjectId, nodeId, nodeId);
    },
    [loadProject, selectedProjectId]
  );

  const handleCanvasNodeSelect = useCallback(async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedBoundaryId(null);
    try {
      setSelectedDetail(await getNodeDetail(nodeId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load node.");
    }
  }, []);

  const handleCanvasEdgeSelect = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedBoundaryId(null);
    setSelectedNodeId(null);
    setSelectedDetail(null);
  }, []);

  const handleCanvasBoundarySelect = useCallback((boundaryId: string) => {
    setSelectedBoundaryId(boundaryId);
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
    setSelectedDetail(null);
  }, []);

  const handleHierarchyBoundarySelect = useCallback(
    async (scopeNodeId: string, boundaryId: string) => {
      if (!selectedProjectId) {
        return;
      }
      await loadProject(selectedProjectId, scopeNodeId, null);
      setSelectedBoundaryId(boundaryId);
      setSelectedEdgeId(null);
      setSelectedNodeId(null);
      setSelectedDetail(null);
    },
    [loadProject, selectedProjectId]
  );

  const handleShowFullGraph = useCallback(async () => {
    if (selectedProjectId) {
      await loadProject(selectedProjectId, null);
    }
  }, [loadProject, selectedProjectId]);

  const handleOpenWorkspaceRequest = useCallback(
    async (
      rootPath: string,
      createIfMissing = false,
      initialization?: WorkspaceInitialization | BlankWorkspaceInitialization,
      creationMode?: WorkspaceCreationMode
    ) => {
      setLoading(true);
      setWorkspaceError(null);
      setError(null);
      try {
        const result = await openWorkspace(rootPath, createIfMissing, initialization, creationMode);
        if (!("project" in result)) {
          setWorkspaceMissingPath(result.rootPath);
          setWorkspaceInitializationStatus(result.status);
          setWorkspaceError(null);
          setWorkspaceDialogOpen(true);
          return;
        }
        setWorkspaceMissingPath(null);
        setWorkspaceInitializationStatus(null);
        setWorkspaceDialogOpen(false);
        setProjects([result.project]);
        setSelectedProjectId(result.project.id);
        const storedScopeNodeId = getStoredCanvasScope(result.project.id);
        rememberCanvasScope(result.project.id, storedScopeNodeId ?? null);
        undoStackRef.current = [];
        setUndoStack([]);
        const loaded = await loadProject(result.project.id, storedScopeNodeId ?? undefined);
        if (!loaded && storedScopeNodeId) {
          await loadProject(result.project.id);
        }
      } catch (loadError) {
        setWorkspaceError(loadError instanceof Error ? loadError.message : "Failed to open workspace.");
      } finally {
        setLoading(false);
      }
    },
    [loadProject]
  );

  const handlePickWorkspaceFolder = useCallback(async (): Promise<string | null> => {
    setWorkspacePicking(true);
    setWorkspaceError(null);
    try {
      const result = await pickWorkspaceFolder();
      if (result.selected && result.path) {
        return result.path;
      }
      if (!result.supported && result.message) {
        setWorkspaceError(result.message);
      }
      return null;
    } catch (pickError) {
      setWorkspaceError(pickError instanceof Error ? pickError.message : "Failed to open the folder picker.");
      return null;
    } finally {
      setWorkspacePicking(false);
    }
  }, []);

  const handleOpenWorkspacePicker = useCallback(async () => {
    setWorkspaceDialogOpen(true);
    setWorkspaceMissingPath(null);
    setWorkspaceInitializationStatus(null);
    setWorkspaceError(null);
    const rootPath = await handlePickWorkspaceFolder();
    if (rootPath) {
      await handleOpenWorkspaceRequest(rootPath, false);
    }
  }, [handleOpenWorkspaceRequest, handlePickWorkspaceFolder]);

  const handleAddNode = useCallback(() => {
    setBlockDialogMode("create");
    setEditingDetail(null);
    setBlockError(null);
    setBlockDialogOpen(true);
  }, []);

  const handleAddEdge = useCallback(() => {
    if (!canvas?.scopeNodeId) {
      setError("Open a canvas scope before drawing an edge.");
      return;
    }
    setSelectedNodeId(null);
    setSelectedDetail(null);
    setSelectedEdgeId(null);
    setSelectedBoundaryId(null);
    setDrawBoundaryMode(false);
    setDrawEdgeMode(true);
  }, [canvas?.scopeNodeId]);

  const handleEdgeDraft = useCallback((draft: { sourceNodeId: string; targetNodeId: string }) => {
    setDrawEdgeMode(false);
    setEdgeDraft(draft);
    setEdgeDialogMode("create");
    setEditingEdge(null);
    setEdgeError(null);
    setEdgeDialogOpen(true);
  }, []);

  const handleEditEdge = useCallback(
    (edgeId: string) => {
      const edge = canvas?.edges.find((item) => item.id === edgeId) ?? null;
      if (!edge) {
        setError("Failed to load edge for editing.");
        return;
      }
      setEdgeDialogMode("edit");
      setEditingEdge(edge);
      setEdgeError(null);
      setEdgeDialogOpen(true);
    },
    [canvas?.edges]
  );

  const handleDrawBoundary = useCallback(() => {
    if (!canvas?.scopeNodeId) {
      setError("Open a canvas scope before drawing a boundary.");
      return;
    }
    setSelectedNodeId(null);
    setSelectedDetail(null);
    setSelectedEdgeId(null);
    setSelectedBoundaryId(null);
    setDrawEdgeMode(false);
    setDrawBoundaryMode(true);
  }, [canvas?.scopeNodeId]);

  const handleBoundaryDraft = useCallback(
    (draft: { position: { x: number; y: number }; size: { width: number; height: number } }) => {
      if (!canvas?.scopeNodeId) {
        return;
      }
      setDrawBoundaryMode(false);
      setDrawEdgeMode(false);
      setBoundaryDraft({ scopeNodeId: canvas.scopeNodeId, ...draft });
      setBoundaryDialogMode("create");
      setEditingBoundary(null);
      setBoundaryError(null);
      setBoundaryDialogOpen(true);
    },
    [canvas?.scopeNodeId]
  );

  const handleCancelDraw = useCallback(() => {
    setDrawBoundaryMode(false);
    setDrawEdgeMode(false);
  }, []);

  const handleEditBoundary = useCallback(
    (boundaryId: string) => {
      const boundary = canvas?.boundaries.find((item) => item.id === boundaryId) ?? null;
      if (!boundary) {
        setError("Failed to load boundary for editing.");
        return;
      }
      setBoundaryDialogMode("edit");
      setEditingBoundary(boundary);
      setBoundaryDraft(null);
      setBoundaryError(null);
      setBoundaryDialogOpen(true);
    },
    [canvas?.boundaries]
  );

  const handleEditNode = useCallback(
    async (nodeId: string) => {
      setBlockDialogMode("edit");
      setBlockError(null);
      try {
        const detail = selectedDetail?.node.id === nodeId ? selectedDetail : await getNodeDetail(nodeId);
        setEditingDetail(detail);
        setBlockDialogOpen(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load node for editing.");
      }
    },
    [selectedDetail]
  );

  const handleSaveBlock = useCallback(
    async (payload: NodeMutation | NodeUpdate, options?: { createCustomType?: CreateCustomBlockType }) => {
      if (!selectedProjectId) {
        return;
      }
      setLoading(true);
      setBlockError(null);
      try {
        let nextPayload: NodeMutation | NodeUpdate = payload;
        if (payload.kind === "custom" && options?.createCustomType) {
          const customType = await createCustomBlockType(selectedProjectId, options.createCustomType);
          nextPayload = { ...payload, customTypeId: customType.id };
        }

        const savedNode =
          blockDialogMode === "edit" && editingDetail
            ? await updateNode(editingDetail.node.id, nextPayload)
            : await createNode(selectedProjectId, {
                ...(nextPayload as NodeMutation),
                position: nextPayload.position ?? nextBlockPosition(canvas)
              });

        setBlockDialogOpen(false);
        setEditingDetail(null);
        setSelectedEdgeId(null);
        setSelectedBoundaryId(null);
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, savedNode.id);
      } catch (saveError) {
        setBlockError(saveError instanceof Error ? saveError.message : "Failed to save block.");
      } finally {
        setLoading(false);
      }
    },
    [blockDialogMode, canvas, editingDetail, loadProject, selectedProjectId]
  );

  const handleSaveEdge = useCallback(
    async (payload: EdgeMutation | EdgeUpdate) => {
      if (!selectedProjectId) {
        return;
      }
      setLoading(true);
      setEdgeError(null);
      try {
        const savedEdge =
          edgeDialogMode === "edit" && editingEdge
            ? await updateEdge(editingEdge.id, payload)
            : await createEdge(selectedProjectId, payload as EdgeMutation);
        if (edgeDialogMode === "edit" && editingEdge) {
          pushUndo({ type: "edge-update", before: editingEdge });
        } else {
          pushUndo({ type: "edge-create", edgeId: savedEdge.id });
        }
        setEdgeDialogOpen(false);
        setEditingEdge(null);
        setEdgeDraft(null);
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, null);
        setSelectedEdgeId(savedEdge.id);
        setSelectedBoundaryId(null);
        setSelectedNodeId(null);
        setSelectedDetail(null);
      } catch (saveError) {
        setEdgeError(saveError instanceof Error ? saveError.message : "Failed to save edge.");
      } finally {
        setLoading(false);
      }
    },
    [canvas?.scopeNodeId, edgeDialogMode, editingEdge, loadProject, pushUndo, selectedProjectId]
  );

  const handleSaveBoundary = useCallback(
    async (payload: BoundaryMutation | BoundaryUpdate) => {
      if (!selectedProjectId) {
        return;
      }
      setLoading(true);
      setBoundaryError(null);
      try {
        const savedBoundary =
          boundaryDialogMode === "edit" && editingBoundary
            ? await updateBoundary(editingBoundary.id, payload)
            : await createBoundary(selectedProjectId, payload as BoundaryMutation);
        if (boundaryDialogMode === "edit" && editingBoundary) {
          pushUndo({ type: "boundary-update", before: editingBoundary });
        } else {
          pushUndo({ type: "boundary-create", boundaryId: savedBoundary.id });
        }
        setBoundaryDialogOpen(false);
        setEditingBoundary(null);
        setBoundaryDraft(null);
        await loadProject(selectedProjectId, savedBoundary.scopeNodeId, null);
        setSelectedBoundaryId(savedBoundary.id);
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
        setSelectedDetail(null);
      } catch (saveError) {
        setBoundaryError(saveError instanceof Error ? saveError.message : "Failed to save boundary.");
      } finally {
        setLoading(false);
      }
    },
    [boundaryDialogMode, editingBoundary, loadProject, pushUndo, selectedProjectId]
  );

  const handleAutoLayout = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    // When canvas scope is missing (e.g. background scan has not finished),
    // try reloading the project first so fresh scan data is available.
    if (!canvas?.scopeNodeId) {
      setLoading(true);
      setError(null);
      try {
        const refreshed = await loadProject(selectedProjectId);
        if (!refreshed?.scopeNodeId) {
          setError("Nothing to auto-layout yet. Run a Scan first to populate the graph, or create nodes manually with the Add button.");
          return;
        }
        const laidOut = await autoLayoutCanvas(selectedProjectId, {
          scopeNodeId: refreshed.scopeNodeId,
          includeAttachments: true
        });
        setCanvas(laidOut);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to auto-layout canvas.");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setCanvas(
        await autoLayoutCanvas(selectedProjectId, {
          scopeNodeId: canvas.scopeNodeId,
          includeAttachments: true
        })
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to auto-layout canvas.");
    } finally {
      setLoading(false);
    }
  }, [canvas?.scopeNodeId, selectedProjectId, loadProject]);

  const handlePersistLayout = useCallback(
    (nodeId: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
      if (!canvas?.scopeNodeId) {
        return;
      }

      const scopeNodeId = canvas.scopeNodeId;
      const existingNode = canvas.nodes.find((node) => node.id === nodeId);
      if (existingNode && !sameLayout(existingNode, { position, size })) {
        pushUndo({
          type: "node-layout",
          scopeNodeId,
          nodeId,
          before: {
            position: existingNode.position,
            size: existingNode.size
          }
        });
      }
      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              nodes: currentCanvas.nodes.map((node) => (node.id === nodeId ? { ...node, position, size } : node))
            }
          : currentCanvas
      );

      void updateNodeLayout(nodeId, {
        scopeNodeId,
        position,
        size
      }).catch((layoutError) => {
        setError(layoutError instanceof Error ? layoutError.message : "Failed to persist layout.");
      });
    },
    [canvas, pushUndo]
  );

  const handlePersistBoundaryLayout = useCallback(
    (boundaryId: string, position: { x: number; y: number }, size: { width: number; height: number }, memberLayouts: MemberLayout[] = []) => {
      const existingBoundary = canvas?.boundaries.find((boundary) => boundary.id === boundaryId) ?? null;
      const scopeNodeId = existingBoundary?.scopeNodeId ?? canvas?.scopeNodeId ?? null;
      const beforeMembers = memberLayouts
        .map((layout) => canvas?.nodes.find((node) => node.id === layout.nodeId) ?? null)
        .filter(Boolean)
        .map((node) => ({
          nodeId: node!.id,
          position: node!.position,
          size: node!.size
        }));

      if (existingBoundary && (!sameLayout(existingBoundary, { position, size }) || memberLayouts.length > 0)) {
        pushUndo({
          type: "boundary-layout",
          scopeNodeId: existingBoundary.scopeNodeId,
          boundaryId,
          beforeBoundary: {
            position: existingBoundary.position,
            size: existingBoundary.size
          },
          beforeMembers
        });
      }

      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              nodes: currentCanvas.nodes.map((node) => {
                const memberLayout = memberLayouts.find((layout) => layout.nodeId === node.id);
                return memberLayout ? { ...node, position: memberLayout.position, size: memberLayout.size } : node;
              }),
              boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === boundaryId ? { ...boundary, position, size } : boundary))
            }
          : currentCanvas
      );

      void (async () => {
        if (scopeNodeId) {
          await Promise.all(
            memberLayouts.map((layout) =>
              updateNodeLayout(layout.nodeId, {
                scopeNodeId,
                position: layout.position,
                size: layout.size
              })
            )
          );
        }
        const savedBoundary = await updateBoundary(boundaryId, {
          position,
          size
        });
        setCanvas((currentCanvas) =>
          currentCanvas
            ? {
                ...currentCanvas,
                boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === savedBoundary.id ? savedBoundary : boundary))
              }
            : currentCanvas
        );
      })().catch((layoutError) => {
        setError(layoutError instanceof Error ? layoutError.message : "Failed to persist boundary layout.");
      });
    },
    [canvas, pushUndo]
  );

  const handleUpdateNodeTypeStyle = useCallback(
    (nodeKind: GraphNodeKind, color: string) => {
      if (!selectedProjectId) {
        return;
      }
      const beforeColor = canvas?.nodeTypeStyles.find((style) => style.nodeKind === nodeKind)?.color ?? nodePalette[nodeKind].accent;
      pushUndo({ type: "node-type-style", projectId: selectedProjectId, nodeKind, beforeColor });
      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              nodeTypeStyles: upsertNodeTypeStyle(currentCanvas.nodeTypeStyles, {
                projectId: selectedProjectId,
                nodeKind,
                color,
                createdAt: "",
                updatedAt: ""
              })
            }
          : currentCanvas
      );
      void updateNodeTypeStyle(selectedProjectId, nodeKind, { color })
        .then((savedStyle) => {
          setCanvas((currentCanvas) =>
            currentCanvas ? { ...currentCanvas, nodeTypeStyles: upsertNodeTypeStyle(currentCanvas.nodeTypeStyles, savedStyle) } : currentCanvas
          );
        })
        .catch((styleError) => {
          setError(styleError instanceof Error ? styleError.message : "Failed to update block type color.");
        });
    },
    [canvas?.nodeTypeStyles, pushUndo, selectedProjectId]
  );

  const handleUpdateCustomTypeStyle = useCallback(
    (customTypeId: string, color: string) => {
      const before = canvas?.customTypes.find((customType) => customType.id === customTypeId);
      if (!before) {
        return;
      }
      pushUndo({ type: "custom-type-update", before });
      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              customTypes: currentCanvas.customTypes.map((customType) => (customType.id === customTypeId ? { ...customType, color } : customType))
            }
          : currentCanvas
      );
      void updateCustomBlockType(customTypeId, { color })
        .then((savedType) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  customTypes: currentCanvas.customTypes.map((customType) => (customType.id === savedType.id ? savedType : customType))
                }
              : currentCanvas
          );
        })
        .catch((styleError) => {
          setError(styleError instanceof Error ? styleError.message : "Failed to update custom type color.");
        });
    },
    [canvas?.customTypes, pushUndo]
  );

  const handleUpdateBoundaryStyle = useCallback(
    (boundaryId: string, color: string) => {
      const before = canvas?.boundaries.find((boundary) => boundary.id === boundaryId);
      if (!before) {
        return;
      }
      pushUndo({ type: "boundary-update", before });
      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === boundaryId ? { ...boundary, color } : boundary))
            }
          : currentCanvas
      );
      setHierarchy((currentHierarchy) => updateHierarchyBoundaryColor(currentHierarchy, boundaryId, color));
      void updateBoundary(boundaryId, { color })
        .then((savedBoundary) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === savedBoundary.id ? savedBoundary : boundary))
                }
              : currentCanvas
          );
          setHierarchy((currentHierarchy) => updateHierarchyBoundaryColor(currentHierarchy, savedBoundary.id, savedBoundary.color));
        })
        .catch((styleError) => {
          setError(styleError instanceof Error ? styleError.message : "Failed to update boundary color.");
        });
    },
    [canvas?.boundaries, pushUndo]
  );

  const handleUpdateEdgeStyle = useCallback(
    (edgeId: string, patch: { color?: string; animated?: boolean; pointingEnabled?: boolean; pointingDirection?: EdgePointingDirection }) => {
      const before = canvas?.edges.find((edge) => edge.id === edgeId);
      if (!before) {
        return;
      }
      pushUndo({ type: "edge-update", before });
      setCanvas((currentCanvas) =>
        currentCanvas
          ? {
              ...currentCanvas,
              edges: currentCanvas.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge))
            }
          : currentCanvas
      );
      void updateEdge(edgeId, patch)
        .then((savedEdge) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  edges: currentCanvas.edges.map((edge) => (edge.id === savedEdge.id ? savedEdge : edge))
                }
              : currentCanvas
          );
        })
        .catch((styleError) => {
          setError(styleError instanceof Error ? styleError.message : "Failed to update edge style.");
        });
    },
    [canvas?.edges, pushUndo]
  );

  const handleUpdateNodeTags = useCallback(
    (nodeId: string, input: TagAssignment) => {
      const before = selectedDetail?.node.id === nodeId ? selectedDetail.node : (canvas?.nodes.find((node) => node.id === nodeId) ?? null);
      if (before) {
        pushUndo({ type: "node-tags", nodeId, beforeTags: before.tags });
      }
      void updateNodeTags(nodeId, input)
        .then((savedNode) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  nodes: currentCanvas.nodes.map((node) => (node.id === savedNode.id ? savedNode : node))
                }
              : currentCanvas
          );
          setSelectedDetail((currentDetail) => (currentDetail?.node.id === savedNode.id ? { ...currentDetail, node: savedNode } : currentDetail));
        })
        .catch((tagError) => {
          setError(tagError instanceof Error ? tagError.message : "Failed to update block tags.");
        });
    },
    [canvas?.nodes, pushUndo, selectedDetail]
  );

  const handleUpdateEdgeTags = useCallback(
    (edgeId: string, input: TagAssignment) => {
      const before = canvas?.edges.find((edge) => edge.id === edgeId);
      if (before) {
        pushUndo({ type: "edge-tags", edgeId, beforeTags: before.tags });
      }
      void updateEdgeTags(edgeId, input)
        .then((savedEdge) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  edges: currentCanvas.edges.map((edge) => (edge.id === savedEdge.id ? savedEdge : edge))
                }
              : currentCanvas
          );
        })
        .catch((tagError) => {
          setError(tagError instanceof Error ? tagError.message : "Failed to update edge tags.");
        });
    },
    [canvas?.edges, pushUndo]
  );

  const handleUpdateBoundaryTags = useCallback(
    (boundaryId: string, input: TagAssignment) => {
      const before = canvas?.boundaries.find((boundary) => boundary.id === boundaryId);
      if (before) {
        pushUndo({ type: "boundary-tags", boundaryId, beforeTags: before.tags });
      }
      void updateBoundaryTags(boundaryId, input)
        .then((savedBoundary) => {
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === savedBoundary.id ? savedBoundary : boundary))
                }
              : currentCanvas
          );
        })
        .catch((tagError) => {
          setError(tagError instanceof Error ? tagError.message : "Failed to update boundary tags.");
        });
    },
    [canvas?.boundaries, pushUndo]
  );

  const handleUndo = useCallback(async () => {
    const entry = undoStackRef.current.at(-1);
    if (!entry) {
      return;
    }
    const nextStack = undoStackRef.current.slice(0, -1);
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);

    undoingRef.current = true;
    setError(null);
    try {
      switch (entry.type) {
        case "node-layout": {
          const undo = entry;
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  nodes: currentCanvas.nodes.map((node) =>
                    node.id === undo.nodeId ? { ...node, position: undo.before.position, size: undo.before.size } : node
                  )
                }
              : currentCanvas
          );
          await updateNodeLayout(undo.nodeId, {
            scopeNodeId: undo.scopeNodeId,
            position: undo.before.position,
            size: undo.before.size
          });
          break;
        }
        case "boundary-layout": {
          const undo = entry;
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  nodes: currentCanvas.nodes.map((node) => {
                    const member = undo.beforeMembers.find((layout) => layout.nodeId === node.id);
                    return member ? { ...node, position: member.position, size: member.size } : node;
                  }),
                  boundaries: currentCanvas.boundaries.map((boundary) =>
                    boundary.id === undo.boundaryId ? { ...boundary, position: undo.beforeBoundary.position, size: undo.beforeBoundary.size } : boundary
                  )
                }
              : currentCanvas
          );
          await Promise.all(
            undo.beforeMembers.map((layout) =>
              updateNodeLayout(layout.nodeId, {
                scopeNodeId: undo.scopeNodeId,
                position: layout.position,
                size: layout.size
              })
            )
          );
          const restoredBoundary = await updateBoundary(undo.boundaryId, {
            position: undo.beforeBoundary.position,
            size: undo.beforeBoundary.size
          });
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === restoredBoundary.id ? restoredBoundary : boundary))
                }
              : currentCanvas
          );
          break;
        }
        case "edge-create": {
          const undo = entry;
          await deleteEdge(undo.edgeId);
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  edges: currentCanvas.edges.filter((edge) => edge.id !== undo.edgeId)
                }
              : currentCanvas
          );
          if (selectedEdgeId === undo.edgeId) {
            setSelectedEdgeId(null);
          }
          break;
        }
        case "edge-update": {
          const restoredEdge = await updateEdge(entry.before.id, {
            kind: entry.before.kind,
            sourceNodeId: entry.before.sourceNodeId,
            targetNodeId: entry.before.targetNodeId,
            label: entry.before.label,
            codeContext: entry.before.codeContext,
            color: entry.before.color,
            animated: entry.before.animated,
            pointingEnabled: entry.before.pointingEnabled,
            pointingDirection: entry.before.pointingDirection
          });
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  edges: currentCanvas.edges.map((edge) => (edge.id === restoredEdge.id ? restoredEdge : edge))
                }
              : currentCanvas
          );
          setSelectedEdgeId(restoredEdge.id);
          setSelectedNodeId(null);
          setSelectedBoundaryId(null);
          setSelectedDetail(null);
          break;
        }
        case "boundary-create": {
          const undo = entry;
          await deleteBoundary(undo.boundaryId);
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.filter((boundary) => boundary.id !== undo.boundaryId)
                }
              : currentCanvas
          );
          if (selectedBoundaryId === undo.boundaryId) {
            setSelectedBoundaryId(null);
          }
          break;
        }
        case "boundary-update": {
          const restoredBoundary = await updateBoundary(entry.before.id, {
            scopeNodeId: entry.before.scopeNodeId,
            name: entry.before.name,
            summary: entry.before.summary,
            codeContext: entry.before.codeContext,
            color: entry.before.color,
            position: entry.before.position,
            size: entry.before.size
          });
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === restoredBoundary.id ? restoredBoundary : boundary))
                }
              : currentCanvas
          );
          setSelectedBoundaryId(restoredBoundary.id);
          setSelectedEdgeId(null);
          setSelectedNodeId(null);
          setSelectedDetail(null);
          break;
        }
        case "node-tags": {
          const restoredNode = await updateNodeTags(entry.nodeId, tagAssignmentFromTags(entry.beforeTags));
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  nodes: currentCanvas.nodes.map((node) => (node.id === restoredNode.id ? restoredNode : node))
                }
              : currentCanvas
          );
          setSelectedDetail((currentDetail) => (currentDetail?.node.id === restoredNode.id ? { ...currentDetail, node: restoredNode } : currentDetail));
          break;
        }
        case "edge-tags": {
          const restoredEdge = await updateEdgeTags(entry.edgeId, tagAssignmentFromTags(entry.beforeTags));
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  edges: currentCanvas.edges.map((edge) => (edge.id === restoredEdge.id ? restoredEdge : edge))
                }
              : currentCanvas
          );
          setSelectedEdgeId(restoredEdge.id);
          setSelectedNodeId(null);
          setSelectedBoundaryId(null);
          setSelectedDetail(null);
          break;
        }
        case "boundary-tags": {
          const restoredBoundary = await updateBoundaryTags(entry.boundaryId, tagAssignmentFromTags(entry.beforeTags));
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  boundaries: currentCanvas.boundaries.map((boundary) => (boundary.id === restoredBoundary.id ? restoredBoundary : boundary))
                }
              : currentCanvas
          );
          setSelectedBoundaryId(restoredBoundary.id);
          setSelectedEdgeId(null);
          setSelectedNodeId(null);
          setSelectedDetail(null);
          break;
        }
        case "node-type-style": {
          const restoredStyle = await updateNodeTypeStyle(entry.projectId, entry.nodeKind, { color: entry.beforeColor });
          setCanvas((currentCanvas) =>
            currentCanvas ? { ...currentCanvas, nodeTypeStyles: upsertNodeTypeStyle(currentCanvas.nodeTypeStyles, restoredStyle) } : currentCanvas
          );
          break;
        }
        case "custom-type-update": {
          const restoredType = await updateCustomBlockType(entry.before.id, {
            name: entry.before.name,
            description: entry.before.description,
            color: entry.before.color,
            icon: entry.before.icon
          });
          setCanvas((currentCanvas) =>
            currentCanvas
              ? {
                  ...currentCanvas,
                  customTypes: currentCanvas.customTypes.map((customType) => (customType.id === restoredType.id ? restoredType : customType))
                }
              : currentCanvas
          );
          break;
        }
      }
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "Failed to undo last operation.");
    } finally {
      undoingRef.current = false;
    }
  }, [selectedBoundaryId, selectedEdgeId]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z" || isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void handleUndo();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleUndo]);

  const handleResetSelfWorkspace = useCallback(async () => {
    const confirmed = window.confirm(
      "Reset the self workspace? This rebuilds .graphcode/graphcode.sqlite and erases local graph edits, saved placements, agent runs, and settings."
    );
    if (!confirmed) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const project = await seedSelfWorkspace();
      setProjects([project]);
      setSelectedProjectId(project.id);
      rememberCanvasScope(project.id, null);
      setSelectedEdgeId(null);
      setSelectedBoundaryId(null);
      setDrawBoundaryMode(false);
      setDrawEdgeMode(false);
      undoStackRef.current = [];
      setUndoStack([]);
      await loadProject(project.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to reset self workspace.");
    } finally {
      setLoading(false);
    }
  }, [loadProject]);

  const handleRefresh = useCallback(async () => {
    if (selectedProjectId) {
      await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
    } else {
      await bootstrap();
    }
  }, [bootstrap, canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]);

  const handleCanvasViewportChange = useCallback(
    (viewport: CanvasViewport) => {
      if (!selectedProjectId) {
        return;
      }
      rememberCanvasViewport(selectedProjectId, canvas?.scopeNodeId ?? null, viewport);
    },
    [canvas?.scopeNodeId, selectedProjectId]
  );

  const refreshAgentState = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    const [nextRuns, nextGitStatus, nextIndexState] = await Promise.all([
      listAgentRuns(selectedProjectId),
      getGitStatus(selectedProjectId).catch(() => ({ status: "" })),
      getIndexState(selectedProjectId)
    ]);
    setAgentRuns(nextRuns);
    setGitStatus(nextGitStatus.status);
    setIndexState(nextIndexState);

    // Auto-refresh canvas when a background scanning agent completes,
    // so newly scanned nodes appear without a manual refresh.
    const scanningRun = nextRuns.find((run) => run.agentKind === "scanning");
    const previousStatus = scanningRunStatusRef.current;
    scanningRunStatusRef.current = scanningRun?.status ?? null;
    if (
      previousStatus === "running" &&
      scanningRun?.status === "succeeded" &&
      selectedProjectId
    ) {
      try {
        const nextCanvas = await getCanvasGraph(selectedProjectId, {
          includeAttachments: true
        });
        setCanvas(nextCanvas);
      } catch {
        // Silently skip — the user can still manually refresh.
      }
    }
  }, [selectedProjectId]);

  const handleSaveSettings = useCallback(
    async (input: WorkspaceSettingsMutation) => {
      if (!selectedProjectId) {
        return;
      }
      setAgentBusy(true);
      try {
        const result = await saveWorkspaceSettings(selectedProjectId, input);
        setSettings(result.settings);
        setSettingsValidation(result.validation);
      } catch (settingsError) {
        setError(settingsError instanceof Error ? settingsError.message : "Failed to save settings.");
      } finally {
        setAgentBusy(false);
      }
    },
    [selectedProjectId]
  );

  const handleStartGithubDeviceFlow = useCallback(
    async (input: { clientId?: string; repository?: string }) => {
      if (!selectedProjectId) {
        throw new Error("No project selected.");
      }
      return startGithubDeviceFlow(selectedProjectId, input);
    },
    [selectedProjectId]
  );

  const handlePollGithubDeviceFlow = useCallback(
    async (input: { deviceCode: string; clientId?: string; repository?: string }) => {
      if (!selectedProjectId) {
        throw new Error("No project selected.");
      }
      const result = await pollGithubDeviceFlow(selectedProjectId, input);
      if (result.settings) {
        setSettings(result.settings);
      }
      return result;
    },
    [selectedProjectId]
  );

  const handleDisconnectGithub = useCallback(async () => {
    if (!selectedProjectId) {
      throw new Error("No project selected.");
    }
    const nextSettings = await disconnectGithub(selectedProjectId);
    setSettings(nextSettings);
    await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
    return nextSettings;
  }, [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]);

  const handleRunPlanning = useCallback(
    async (prompt: string) => {
      if (!selectedProjectId) {
        return;
      }
      setError(null);
      try {
        const run = await runPlanningAgent({
          projectId: selectedProjectId,
          prompt,
          scopeNodeId: selectedDetail?.node.id ?? canvas?.scopeNodeId ?? null,
          background: true
        });
        setAgentRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
        void refreshAgentState();
      } catch (agentError) {
        setError(agentError instanceof Error ? agentError.message : "Planning agent failed.");
      }
    },
    [canvas?.scopeNodeId, refreshAgentState, selectedDetail?.node.id, selectedProjectId]
  );

  const handleApplyPlanningPatch = useCallback(
    async (runId: string) => {
      if (!selectedProjectId) {
        return;
      }
      setApplyingRunIds((current) => [...current, runId]);
      setError(null);
      try {
        const run = await applyAgentGraphPatch(selectedProjectId, runId);
        setAgentRuns((current) => current.map((item) => (item.id === run.id ? run : item)));
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
      } catch (agentError) {
        setError(agentError instanceof Error ? agentError.message : "Failed to apply planning patch.");
      } finally {
        setApplyingRunIds((current) => current.filter((id) => id !== runId));
      }
    },
    [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]
  );

  const handleImplementCodeProposal = useCallback(
    async (runId: string) => {
      if (!selectedProjectId) return;
      setApplyingRunIds((current) => [...current, runId]);
      setError(null);
      try {
        const run = await applyCodeProposal({ projectId: selectedProjectId, runId });
        setAgentRuns((current) => current.map((item) => (item.id === run.id ? run : item)));
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
      } catch (agentError) {
        setError(agentError instanceof Error ? agentError.message : "Failed to implement coding proposal.");
      } finally {
        setApplyingRunIds((current) => current.filter((id) => id !== runId));
      }
    },
    [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]
  );

  const handleStartCode = useCallback(
    async (nodeId: string, mode: CodingAgentMode = "medium", prompt?: string) => {
      if (!selectedProjectId) {
        return;
      }
      setAgentBusy(true);
      setError(null);
      try {
        const detail = selectedDetail?.node.id === nodeId ? selectedDetail : await getNodeDetail(nodeId);
        if (isUpperCodingScope(detail)) {
          const workflow = await previewCodingWorkflow({
            projectId: selectedProjectId,
            scopeNodeId: nodeId
          });
          setCodingWorkflow(workflow);
          setWorkflowModeOverrides(Object.fromEntries(workflow.items.map((item) => [item.nodeId, item.selectedMode])));
          setWorkflowPartitionConstraints(workflow.orchestration?.partitionConstraints ?? {
            keepTogetherNodeGroups: [],
            separateNodePairs: [],
            approvedIgnoredEdges: []
          });
          setWorkflowExecutionPolicy(workflow.orchestration?.executionPolicy ?? {
            maximumConcurrency: 4,
            maxEstimatedCost: null,
            currency: "USD"
          });
          setWorkflowPreviewDirty(false);
          return;
        }
        await runCodingAgent({
          projectId: selectedProjectId,
          nodeId,
          mode,
          prompt: prompt?.trim() || detail.node.code.context
        });
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, nodeId);
      } catch (agentError) {
        setError(agentError instanceof Error ? agentError.message : "Coding agent failed.");
      } finally {
        setAgentBusy(false);
      }
    },
    [canvas?.scopeNodeId, loadProject, selectedDetail, selectedProjectId]
  );

  const handleWorkflowModeChange = useCallback((nodeId: string, mode: CodingAgentMode) => {
    setWorkflowModeOverrides((current) => ({ ...current, [nodeId]: mode }));
    setCodingWorkflow((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.nodeId === nodeId ? { ...item, selectedMode: mode } : item))
          }
        : current
    );
    setWorkflowPreviewDirty(true);
  }, []);

  const revalidateCodingWorkflow = useCallback(
    async (
      partitionConstraints = workflowPartitionConstraints,
      executionPolicy = workflowExecutionPolicy
    ) => {
      if (!selectedProjectId || !codingWorkflow) return;
      setAgentBusy(true);
      setError(null);
      try {
        const workflow = await previewCodingWorkflow({
          projectId: selectedProjectId,
          scopeNodeId: codingWorkflow.scopeNodeId,
          modeOverrides: Object.entries(workflowModeOverrides).map(([nodeId, mode]) => ({ nodeId, mode })),
          partitionConstraints,
          executionPolicy
        });
        setCodingWorkflow(workflow);
        setWorkflowModeOverrides(Object.fromEntries(workflow.items.map((item) => [item.nodeId, item.selectedMode])));
        setWorkflowPartitionConstraints(workflow.orchestration?.partitionConstraints ?? partitionConstraints);
        setWorkflowExecutionPolicy(workflow.orchestration?.executionPolicy ?? executionPolicy);
        setWorkflowPreviewDirty(false);
      } catch (workflowError) {
        setError(workflowError instanceof Error ? workflowError.message : "Workflow preview validation failed.");
      } finally {
        setAgentBusy(false);
      }
    }, [codingWorkflow, selectedProjectId, workflowExecutionPolicy, workflowModeOverrides, workflowPartitionConstraints]
  );

  const handleMergeWorkflowUnits = useCallback(
    (workUnitIds: string[]) => {
      if (!codingWorkflow?.orchestration || workUnitIds.length < 2) return;
      const selected = codingWorkflow.orchestration.workUnits.filter((unit) => workUnitIds.includes(unit.id));
      const nodeGroup = [...new Set(selected.flatMap((unit) => unit.ownedNodeIds))];
      if (nodeGroup.length < 2) return;
      const next = {
        ...workflowPartitionConstraints,
        keepTogetherNodeGroups: [...workflowPartitionConstraints.keepTogetherNodeGroups, nodeGroup]
      };
      setWorkflowPartitionConstraints(next);
      void revalidateCodingWorkflow(next, workflowExecutionPolicy);
    }, [codingWorkflow, revalidateCodingWorkflow, workflowExecutionPolicy, workflowPartitionConstraints]
  );

  const handleSplitWorkflowUnit = useCallback(
    (workUnitId: string) => {
      const unit = codingWorkflow?.orchestration?.workUnits.find((candidate) => candidate.id === workUnitId);
      if (!unit || unit.ownedNodeIds.length < 2) return;
      const next = {
        ...workflowPartitionConstraints,
        separateNodePairs: [...workflowPartitionConstraints.separateNodePairs, [unit.ownedNodeIds[0], unit.ownedNodeIds[1]] as [string, string]]
      };
      setWorkflowPartitionConstraints(next);
      void revalidateCodingWorkflow(next, workflowExecutionPolicy);
    }, [codingWorkflow, revalidateCodingWorkflow, workflowExecutionPolicy, workflowPartitionConstraints]
  );

  const handleApproveIgnoredWorkflowEdge = useCallback(
    (edgeId: string) => {
      const next = {
        ...workflowPartitionConstraints,
        approvedIgnoredEdges: [
          ...workflowPartitionConstraints.approvedIgnoredEdges.filter((edge) => edge.edgeId !== edgeId),
          { edgeId, reason: "User approved this informational boundary omission in the workflow preview.", approvedBy: "user" as const, approvalReference: `ui:${Date.now()}` }
        ]
      };
      setWorkflowPartitionConstraints(next);
      void revalidateCodingWorkflow(next, workflowExecutionPolicy);
    }, [revalidateCodingWorkflow, workflowExecutionPolicy, workflowPartitionConstraints]
  );

  const handleWorkflowExecutionPolicyChange = useCallback((policy: CodingWorkflowExecutionPolicy) => {
    setWorkflowExecutionPolicy(policy);
    setWorkflowPreviewDirty(true);
  }, []);

  const handleStartCodingWorkflow = useCallback(async () => {
    if (!selectedProjectId || !codingWorkflow) {
      return;
    }
    setAgentBusy(true);
    setError(null);
    try {
      const workflow = await startCodingWorkflow({
        projectId: selectedProjectId,
        scopeNodeId: codingWorkflow.scopeNodeId,
        modeOverrides: Object.entries(workflowModeOverrides).map(([nodeId, mode]) => ({ nodeId, mode })),
        partitionConstraints: workflowPartitionConstraints,
        executionPolicy: workflowExecutionPolicy,
        background: true
      });
      setCodingWorkflow(workflow);
      setWorkflowPreviewDirty(false);
      const [nextRuns, nextGitStatus] = await Promise.all([listAgentRuns(selectedProjectId), getGitStatus(selectedProjectId).catch(() => ({ status: "" }))]);
      setAgentRuns(nextRuns);
      setGitStatus(nextGitStatus.status);
      await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId ?? undefined);
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : "Coding workflow failed.");
    } finally {
      setAgentBusy(false);
    }
  }, [canvas?.scopeNodeId, codingWorkflow, loadProject, selectedNodeId, selectedProjectId, workflowExecutionPolicy, workflowModeOverrides, workflowPartitionConstraints]);

  const handleCodingWorkflowControl = useCallback(
    async (action: "pause" | "resume" | "cancel" | "retry" | "escalate" | "skip" | "integrate", itemId?: string) => {
      if (!selectedProjectId || !codingWorkflow) return;
      setAgentBusy(true);
      setError(null);
      try {
        const workflow = await controlCodingWorkflow({ projectId: selectedProjectId, workflowId: codingWorkflow.id, action, itemId });
        setCodingWorkflow(workflow);
      } catch (workflowError) {
        setError(workflowError instanceof Error ? workflowError.message : `Workflow ${action} failed.`);
      } finally {
        setAgentBusy(false);
      }
    }, [codingWorkflow, selectedProjectId]
  );

  const handleApplyCodingWorkflowLayer = useCallback(
    async (workflowId: string, layerIndex: number) => {
      if (!selectedProjectId) {
        return;
      }
      setAgentBusy(true);
      setError(null);
      try {
        const workflow = await applyCodingWorkflowLayer({ projectId: selectedProjectId, workflowId, layerIndex });
        setCodingWorkflow(workflow);
        const [nextRuns, nextGitStatus] = await Promise.all([listAgentRuns(selectedProjectId), getGitStatus(selectedProjectId).catch(() => ({ status: "" }))]);
        setAgentRuns(nextRuns);
        setGitStatus(nextGitStatus.status);
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId ?? undefined);
      } catch (workflowError) {
        setError(workflowError instanceof Error ? workflowError.message : "Applying coding workflow layer failed.");
        try {
          setCodingWorkflow(await getCodingWorkflow(selectedProjectId, workflowId));
        } catch {
          // Keep the existing workflow preview when refreshed integration evidence is unavailable.
        }
      } finally {
        setAgentBusy(false);
      }
    },
    [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]
  );

  const handleRunReview = useCallback(
    async (runId: string) => {
      if (!selectedProjectId) {
        return;
      }
      setAgentBusy(true);
      try {
        await runReviewAgent({ projectId: selectedProjectId, runId });
        await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
      } catch (agentError) {
        setError(agentError instanceof Error ? agentError.message : "Review agent failed.");
      } finally {
        setAgentBusy(false);
      }
    },
    [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProjectId]
  );

  const handleRunScanning = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    setAgentBusy(true);
    try {
      await runScanningAgent({
        projectId: selectedProjectId,
        projectDescription: selectedProject?.description,
        scanningInstructions: selectedProject?.scanningInstructions
      });
      await loadProject(selectedProjectId, canvas?.scopeNodeId ?? null, selectedNodeId);
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "Scanning agent failed.");
    } finally {
      setAgentBusy(false);
    }
  }, [canvas?.scopeNodeId, loadProject, selectedNodeId, selectedProject?.description, selectedProject?.scanningInstructions, selectedProjectId]);

  const handleCancelIndex = useCallback(async () => {
    if (!selectedProjectId) {
      return;
    }
    try {
      setIndexState(await cancelCurrentIndexRun(selectedProjectId));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel indexing.");
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshAgentState();
  }, [refreshAgentState]);

  useEffect(() => {
    if (!agentRuns.some((run) => run.status === "queued" || run.status === "running")) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshAgentState();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [agentRuns, refreshAgentState]);

  useEffect(() => {
    if (!selectedProjectId || !codingWorkflow || codingWorkflow.status !== "running") {
      return;
    }
    let active = true;
    const refreshWorkflow = async () => {
      try {
        const workflow = await getCodingWorkflow(selectedProjectId, codingWorkflow.id);
        if (active) setCodingWorkflow(workflow);
      } catch (workflowError) {
        if (active) setError(workflowError instanceof Error ? workflowError.message : "Failed to refresh coding workflow progress.");
      }
    };
    const timer = window.setInterval(() => void refreshWorkflow(), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [codingWorkflow?.id, codingWorkflow?.status, selectedProjectId]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings?.general.theme ?? "system";
  }, [settings?.general.theme]);

  return (
    <>
      <AppShell
        selectedProject={selectedProject}
        indexState={indexState}
        hierarchy={hierarchy}
        canvas={canvas}
        theme={settings?.general.theme ?? "system"}
        selectedDetail={selectedDetail}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        selectedBoundaryId={selectedBoundaryId}
        selectedEdge={selectedEdge}
        selectedBoundary={selectedBoundary}
        restoreViewport={restoreViewport}
        drawBoundaryMode={drawBoundaryMode}
        drawEdgeMode={drawEdgeMode}
        canUndo={undoStack.length > 0}
        loading={loading}
        error={error}
        agentRuns={agentRuns}
        agentBusy={agentBusy}
        applyingRunIds={applyingRunIds}
        codingWorkflow={codingWorkflow}
        workflowModeOverrides={workflowModeOverrides}
        workflowExecutionPolicy={workflowExecutionPolicy}
        workflowPreviewDirty={workflowPreviewDirty}
        gitStatus={gitStatus}
        onSelectNode={handleInspectNode}
        onOpenNode={handleOpenNode}
        onHierarchyBoundarySelect={handleHierarchyBoundarySelect}
        onCanvasNodeSelect={handleCanvasNodeSelect}
        onCanvasEdgeSelect={handleCanvasEdgeSelect}
        onCanvasBoundarySelect={handleCanvasBoundarySelect}
        onCanvasNodeOpen={handleOpenNode}
        onPersistLayout={handlePersistLayout}
        onPersistBoundaryLayout={handlePersistBoundaryLayout}
        onCanvasViewportChange={handleCanvasViewportChange}
        onBoundaryDraft={handleBoundaryDraft}
        onEdgeDraft={handleEdgeDraft}
        onCancelDraw={handleCancelDraw}
        onOpenWorkspace={() => void handleOpenWorkspacePicker()}
        onAddBlock={handleAddNode}
        onDrawEdge={handleAddEdge}
        onDrawBoundary={handleDrawBoundary}
        onEditNode={handleEditNode}
        onEditEdge={handleEditEdge}
        onEditBoundary={handleEditBoundary}
        onUpdateNodeTypeStyle={handleUpdateNodeTypeStyle}
        onUpdateCustomTypeStyle={handleUpdateCustomTypeStyle}
        onUpdateBoundaryStyle={handleUpdateBoundaryStyle}
        onUpdateEdgeStyle={handleUpdateEdgeStyle}
        onUpdateNodeTags={handleUpdateNodeTags}
        onUpdateEdgeTags={handleUpdateEdgeTags}
        onUpdateBoundaryTags={handleUpdateBoundaryTags}
        onShowFullGraph={handleShowFullGraph}
        onAutoLayout={handleAutoLayout}
        onResetSelfWorkspace={handleResetSelfWorkspace}
        onRefresh={handleRefresh}
        onUndo={() => void handleUndo()}
        onOpenSettings={() => setSettingsOpen(true)}
        onRunPlanning={handleRunPlanning}
        onApplyPlanningPatch={handleApplyPlanningPatch}
        onImplementCodeProposal={handleImplementCodeProposal}
        onStartCode={handleStartCode}
        onWorkflowModeChange={handleWorkflowModeChange}
        onWorkflowExecutionPolicyChange={handleWorkflowExecutionPolicyChange}
        onRevalidateCodingWorkflow={() => void revalidateCodingWorkflow()}
        onMergeWorkflowUnits={handleMergeWorkflowUnits}
        onSplitWorkflowUnit={handleSplitWorkflowUnit}
        onApproveIgnoredWorkflowEdge={handleApproveIgnoredWorkflowEdge}
        onCodingWorkflowControl={(action, itemId) => void handleCodingWorkflowControl(action, itemId)}
        onStartCodingWorkflow={() => void handleStartCodingWorkflow()}
        onApplyCodingWorkflowLayer={(workflowId, layerIndex) => void handleApplyCodingWorkflowLayer(workflowId, layerIndex)}
        onCloseCodingWorkflow={() => setCodingWorkflow(null)}
        onRunReview={handleRunReview}
        onRunScanning={handleRunScanning}
        onCancelIndex={() => void handleCancelIndex()}
      />
      {settingsOpen && selectedProject && settings ? (
        <SettingsPage
          project={selectedProject}
          settings={settings}
          validation={settingsValidation}
          saving={agentBusy}
          onClose={() => setSettingsOpen(false)}
          onSave={(input) => void handleSaveSettings(input)}
          onStartGithubDeviceFlow={handleStartGithubDeviceFlow}
          onPollGithubDeviceFlow={handlePollGithubDeviceFlow}
          onDisconnectGithub={handleDisconnectGithub}
        />
      ) : null}
      <WorkspaceDialog
        open={workspaceDialogOpen}
        loading={loading}
        picking={workspacePicking}
        missingPath={workspaceMissingPath}
        error={workspaceError}
        onClose={() => {
          setWorkspaceDialogOpen(false);
          setWorkspaceMissingPath(null);
          setWorkspaceInitializationStatus(null);
          setWorkspaceError(null);
        }}
        onPickFolder={handlePickWorkspaceFolder}
        onOpen={(rootPath) => void handleOpenWorkspaceRequest(rootPath, false)}
        initializationStatus={workspaceInitializationStatus}
        onCreateBlank={(rootPath, initialization) => void handleOpenWorkspaceRequest(rootPath, true, initialization, "blank")}
        onCreateAndScan={(rootPath, initialization) => void handleOpenWorkspaceRequest(rootPath, true, initialization, "scan")}
        showCodexScanPromptOption={scanUsesCodexProvider}
      />
      <BlockEditorDialog
        open={blockDialogOpen}
        mode={blockDialogMode}
        node={editingDetail?.node ?? null}
        detail={editingDetail}
        hierarchy={hierarchy}
        canvas={canvas}
        settings={settings}
        selectedNodeId={selectedNodeId}
        loading={loading}
        error={blockError}
        onClose={() => setBlockDialogOpen(false)}
        onSave={(payload, options) => void handleSaveBlock(payload, options)}
      />
      <EdgeEditorDialog
        open={edgeDialogOpen}
        mode={edgeDialogMode}
        edge={editingEdge}
        draft={edgeDraft}
        canvas={canvas}
        loading={loading}
        error={edgeError}
        onClose={() => {
          setEdgeDialogOpen(false);
          setEdgeDraft(null);
          setDrawEdgeMode(false);
        }}
        onSave={(payload) => void handleSaveEdge(payload)}
      />
      <BoundaryEditorDialog
        open={boundaryDialogOpen}
        mode={boundaryDialogMode}
        boundary={editingBoundary}
        draft={boundaryDraft}
        loading={loading}
        error={boundaryError}
        onClose={() => {
          setBoundaryDialogOpen(false);
          setBoundaryDraft(null);
          setDrawBoundaryMode(false);
        }}
        onSave={(payload) => void handleSaveBoundary(payload)}
      />
    </>
  );
}

function nextBlockPosition(canvas: CanvasGraph | null): { x: number; y: number } {
  const count = canvas?.nodes.length ?? 0;
  return {
    x: 80 + (count % 4) * 72,
    y: 80 + Math.floor(count / 4) * 72
  };
}

type LayoutValue = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type UndoEntry =
  | {
      type: "node-layout";
      scopeNodeId: string;
      nodeId: string;
      before: LayoutValue;
    }
  | {
      type: "boundary-layout";
      scopeNodeId: string;
      boundaryId: string;
      beforeBoundary: LayoutValue;
      beforeMembers: MemberLayout[];
    }
  | {
      type: "edge-create";
      edgeId: string;
    }
  | {
      type: "edge-update";
      before: GraphEdge;
    }
  | {
      type: "boundary-create";
      boundaryId: string;
    }
  | {
      type: "boundary-update";
      before: GraphBoundary;
    }
  | {
      type: "node-tags";
      nodeId: string;
      beforeTags: GraphTag[];
    }
  | {
      type: "edge-tags";
      edgeId: string;
      beforeTags: GraphTag[];
    }
  | {
      type: "boundary-tags";
      boundaryId: string;
      beforeTags: GraphTag[];
    }
  | {
      type: "node-type-style";
      projectId: string;
      nodeKind: GraphNodeKind;
      beforeColor: string;
    }
  | {
      type: "custom-type-update";
      before: CustomBlockType;
    };

function upsertNodeTypeStyle(styles: NodeTypeStyle[], style: NodeTypeStyle): NodeTypeStyle[] {
  return styles.some((item) => item.nodeKind === style.nodeKind)
    ? styles.map((item) => (item.nodeKind === style.nodeKind ? style : item))
    : [...styles, style];
}

function updateHierarchyBoundaryColor(nodes: HierarchyNode[], boundaryId: string, color: string): HierarchyNode[] {
  return nodes.map((node) => ({
    ...node,
    boundaryLabels: node.boundaryLabels.map((label) => (label.id === boundaryId ? { ...label, color } : label)),
    boundaryGroups: node.boundaryGroups.map((group) => (group.id === boundaryId ? { ...group, color } : group)),
    children: updateHierarchyBoundaryColor(node.children, boundaryId, color)
  }));
}

function tagAssignmentFromTags(tags: GraphTag[]): TagAssignment {
  return {
    tags: tags.map((tag) => ({
      name: tag.name,
      color: tag.color
    }))
  };
}

function sameLayout(current: LayoutValue, next: LayoutValue): boolean {
  return (
    current.position.x === next.position.x &&
    current.position.y === next.position.y &&
    current.size.width === next.size.width &&
    current.size.height === next.size.height
  );
}

function isUpperCodingScope(detail: NodeDetail): boolean {
  const node = detail.node;
  if (node.kind === "function" || node.kind === "object") {
    return detail.childCount > 0;
  }
  return node.kind === "framework" || node.kind === "module" || node.kind === "website" || node.kind === "ui_component";
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
}
