import { CODING_AGENT_MODES, type AgentRun, type CanvasGraph, type CodingAgentMode, type CodingWorkflow, type EdgePointingDirection, type GraphBoundary, type GraphEdge, type GraphNodeKind, type HierarchyNode, type NodeDetail, type Project, type TagAssignment, type WorkspaceSettings } from "@graphcode/graph-model";
import { Button, Spinner } from "@heroui/react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Code2,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitPullRequest,
  Maximize2,
  MessageSquare,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Square,
  Undo2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { CanvasViewport } from "../canvasSession";
import { agentKindLabel, codingAgentModeLabel } from "../displayLabels";
import { HierarchyTree } from "./HierarchyTree";
import { Inspector } from "./Inspector";
import { WorkspaceCanvas, type MemberLayout } from "./WorkspaceCanvas";

type AppShellProps = {
  projects: Project[];
  selectedProject: Project | null;
  hierarchy: HierarchyNode[];
  canvas: CanvasGraph | null;
  theme: WorkspaceSettings["general"]["theme"];
  selectedDetail: NodeDetail | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedBoundaryId: string | null;
  selectedEdge: GraphEdge | null;
  selectedBoundary: GraphBoundary | null;
  restoreViewport: CanvasViewport | null | undefined;
  drawBoundaryMode: boolean;
  drawEdgeMode: boolean;
  canUndo: boolean;
  loading: boolean;
  error: string | null;
  agentRuns: AgentRun[];
  agentBusy: boolean;
  applyingRunIds: string[];
  codingWorkflow: CodingWorkflow | null;
  workflowModeOverrides: Record<string, CodingAgentMode>;
  gitStatus: string;
  onSelectNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onHierarchyBoundarySelect: (scopeNodeId: string, boundaryId: string) => void;
  onCanvasNodeSelect: (nodeId: string) => void;
  onCanvasEdgeSelect: (edgeId: string) => void;
  onCanvasBoundarySelect: (boundaryId: string) => void;
  onCanvasNodeOpen: (nodeId: string) => void;
  onPersistLayout: (nodeId: string, position: { x: number; y: number }, size: { width: number; height: number }) => void;
  onPersistBoundaryLayout: (
    boundaryId: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    memberLayouts?: MemberLayout[]
  ) => void;
  onCanvasViewportChange: (viewport: CanvasViewport) => void;
  onBoundaryDraft: (draft: { position: { x: number; y: number }; size: { width: number; height: number } }) => void;
  onEdgeDraft: (draft: { sourceNodeId: string; targetNodeId: string }) => void;
  onCancelDraw: () => void;
  onOpenWorkspace: () => void;
  onAddBlock: () => void;
  onDrawEdge: () => void;
  onDrawBoundary: () => void;
  onEditNode: (nodeId: string) => void;
  onEditEdge: (edgeId: string) => void;
  onEditBoundary: (boundaryId: string) => void;
  onUpdateNodeTypeStyle: (nodeKind: GraphNodeKind, color: string) => void;
  onUpdateCustomTypeStyle: (customTypeId: string, color: string) => void;
  onUpdateBoundaryStyle: (boundaryId: string, color: string) => void;
  onUpdateEdgeStyle: (edgeId: string, patch: { color?: string; animated?: boolean; pointingEnabled?: boolean; pointingDirection?: EdgePointingDirection }) => void;
  onUpdateNodeTags: (nodeId: string, input: TagAssignment) => void;
  onUpdateEdgeTags: (edgeId: string, input: TagAssignment) => void;
  onUpdateBoundaryTags: (boundaryId: string, input: TagAssignment) => void;
  onShowFullGraph: () => void;
  onAutoLayout: () => void;
  onResetSelfWorkspace: () => void;
  onRefresh: () => void;
  onUndo: () => void;
  onOpenSettings: () => void;
  onRunPlanning: (prompt: string) => void;
  onApplyPlanningPatch: (runId: string) => void;
  onStartCode: (nodeId: string, mode: CodingAgentMode) => void;
  onWorkflowModeChange: (nodeId: string, mode: CodingAgentMode) => void;
  onStartCodingWorkflow: () => void;
  onApplyCodingWorkflowLayer: (workflowId: string, layerIndex: number) => void;
  onCloseCodingWorkflow: () => void;
  onRunReview: (runId: string) => void;
  onRunScanning: () => void;
};

export function AppShell({
  projects,
  selectedProject,
  hierarchy,
  canvas,
  theme,
  selectedDetail,
  selectedNodeId,
  selectedEdgeId,
  selectedBoundaryId,
  selectedEdge,
  selectedBoundary,
  restoreViewport,
  drawBoundaryMode,
  drawEdgeMode,
  canUndo,
  loading,
  error,
  agentRuns,
  agentBusy,
  applyingRunIds,
  codingWorkflow,
  workflowModeOverrides,
  gitStatus,
  onSelectNode,
  onOpenNode,
  onHierarchyBoundarySelect,
  onCanvasNodeSelect,
  onCanvasEdgeSelect,
  onCanvasBoundarySelect,
  onCanvasNodeOpen,
  onPersistLayout,
  onPersistBoundaryLayout,
  onCanvasViewportChange,
  onBoundaryDraft,
  onEdgeDraft,
  onCancelDraw,
  onOpenWorkspace,
  onAddBlock,
  onDrawEdge,
  onDrawBoundary,
  onEditNode,
  onEditEdge,
  onEditBoundary,
  onUpdateNodeTypeStyle,
  onUpdateCustomTypeStyle,
  onUpdateBoundaryStyle,
  onUpdateEdgeStyle,
  onUpdateNodeTags,
  onUpdateEdgeTags,
  onUpdateBoundaryTags,
  onShowFullGraph,
  onAutoLayout,
  onResetSelfWorkspace,
  onRefresh,
  onUndo,
  onOpenSettings,
  onRunPlanning,
  onApplyPlanningPatch,
  onStartCode,
  onWorkflowModeChange,
  onStartCodingWorkflow,
  onApplyCodingWorkflowLayer,
  onCloseCodingWorkflow,
  onRunReview,
  onRunScanning
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH);
  const [resizingLeftPanel, setResizingLeftPanel] = useState(false);
  const [resizingRightPanel, setResizingRightPanel] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<"details" | "planning">("details");
  const resizeStartRef = useRef({ x: 0, width: DEFAULT_LEFT_PANEL_WIDTH });
  const rightResizeStartRef = useRef({ x: 0, width: DEFAULT_RIGHT_PANEL_WIDTH });
  const title = selectedProject?.name ?? "GraphCode";
  const nodeCount = canvas?.nodes.length ?? 0;
  const edgeCount = canvas?.edges.length ?? 0;
  const filteredHierarchy = useMemo(() => filterHierarchy(hierarchy, query), [hierarchy, query]);
  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      resizeStartRef.current = { x: event.clientX, width: leftPanelWidth };
      setResizingLeftPanel(true);
    },
    [leftPanelWidth]
  );

  const adjustLeftPanelWidth = useCallback((delta: number) => {
    setLeftPanelWidth((width) => clamp(width + delta, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH));
  }, []);

  const handleRightResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      rightResizeStartRef.current = { x: event.clientX, width: rightPanelWidth };
      setResizingRightPanel(true);
    },
    [rightPanelWidth]
  );

  const adjustRightPanelWidth = useCallback((delta: number) => {
    setRightPanelWidth((width) => clamp(width + delta, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH));
  }, []);

  useEffect(() => {
    if (!resizingLeftPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = resizeStartRef.current.width + event.clientX - resizeStartRef.current.x;
      setLeftPanelWidth(clamp(nextWidth, MIN_LEFT_PANEL_WIDTH, MAX_LEFT_PANEL_WIDTH));
    };
    const handlePointerUp = () => setResizingLeftPanel(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingLeftPanel]);

  useEffect(() => {
    if (!resizingRightPanel) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = rightResizeStartRef.current.width + rightResizeStartRef.current.x - event.clientX;
      setRightPanelWidth(clamp(nextWidth, MIN_RIGHT_PANEL_WIDTH, MAX_RIGHT_PANEL_WIDTH));
    };
    const handlePointerUp = () => setResizingRightPanel(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizingRightPanel]);

  return (
    <div
      className={`app-shell ${resizingLeftPanel ? "resizing-left-panel" : ""} ${resizingRightPanel ? "resizing-right-panel" : ""}`}
      style={{ "--left-panel-width": `${leftPanelWidth}px`, "--right-panel-width": `${rightPanelWidth}px` } as CSSProperties}
    >
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <FolderTree size={18} />
          </div>
          <div>
            <h1>{title}</h1>
            <p>{projects.length > 0 ? `${nodeCount} blocks · ${edgeCount} links` : "No project loaded"}</p>
          </div>
        </div>

        <div className="top-actions">
          <span title="Open a repository workspace">
            <Button size="sm" variant={selectedProject ? "secondary" : "primary"} className={!selectedProject ? "open-workspace-pulse" : ""} onPress={onOpenWorkspace}>
              <FolderOpen size={16} />
              Open workspace
            </Button>
          </span>
          <div className="add-menu-wrap">
            <span title="Add a block, edge, or boundary">
              <Button size="sm" variant="secondary" isDisabled={!selectedProject} onPress={() => setAddMenuOpen((open) => !open)}>
                <Plus size={16} />
                Add
                <ChevronDown size={14} />
              </Button>
            </span>
            {addMenuOpen ? (
              <div className="add-menu">
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onAddBlock();
                  }}
                >
                  <Square size={15} />
                  Block
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onDrawEdge();
                  }}
                >
                  <GitBranch size={15} />
                  Edge
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddMenuOpen(false);
                    onDrawBoundary();
                  }}
                >
                  <Boxes size={15} />
                  Boundary
                </button>
              </div>
            ) : null}
          </div>
          <span title="Open the workspace root scope">
            <Button size="sm" variant="secondary" isDisabled={!selectedProject} onPress={onShowFullGraph}>
              <Maximize2 size={16} />
              Workspace
            </Button>
          </span>
          <span title="Auto-place this canvas scope">
            <Button size="sm" variant="secondary" isDisabled={!selectedProject} onPress={onAutoLayout}>
              <Sparkles size={16} />
              Auto layout
            </Button>
          </span>
          <span title="Scan repository into graph blocks">
            <Button size="sm" variant="secondary" isDisabled={!selectedProject || agentBusy} onPress={onRunScanning}>
              <Search size={16} />
              Scan
            </Button>
          </span>
          <span title="Fetch current hierarchy and canvas data">
            <Button isIconOnly size="sm" variant="ghost" aria-label="Refresh" onPress={onRefresh}>
              <RefreshCw size={16} />
            </Button>
          </span>
          <span title="Undo last canvas operation">
            <Button isIconOnly size="sm" variant="ghost" aria-label="Undo" isDisabled={!canUndo} onPress={onUndo}>
              <Undo2 size={16} />
            </Button>
          </span>
          <span title="Rebuild the self-repo workspace database">
            <Button isIconOnly size="sm" variant="primary" aria-label="Reset self workspace" onPress={onResetSelfWorkspace}>
              <RotateCcw size={16} />
            </Button>
          </span>
          <span title="Open settings">
            <Button isIconOnly size="sm" variant="ghost" aria-label="Settings" isDisabled={!selectedProject} onPress={onOpenSettings}>
              <Settings size={16} />
            </Button>
          </span>
        </div>
      </header>

      <aside className="left-panel" aria-label="Project hierarchy">
        <div className="panel-header">
          <span>Structure</span>
          {loading ? <Spinner size="sm" /> : null}
        </div>
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search hierarchy"
            placeholder="Search blocks and boundaries"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {error ? <div className="error-strip">{error}</div> : null}
        <HierarchyTree
          nodes={filteredHierarchy}
          selectedNodeId={selectedNodeId}
          selectedBoundaryId={selectedBoundaryId}
          nodeTypeStyles={canvas?.nodeTypeStyles ?? []}
          onSelectNode={onSelectNode}
          onOpenNode={onOpenNode}
          onSelectBoundary={onHierarchyBoundarySelect}
        />
      </aside>

      <div
        className="left-panel-resizer"
        role="separator"
        aria-label="Resize structure panel"
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT_PANEL_WIDTH}
        aria-valuemax={MAX_LEFT_PANEL_WIDTH}
        aria-valuenow={leftPanelWidth}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            adjustLeftPanelWidth(event.shiftKey ? -40 : -16);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            adjustLeftPanelWidth(event.shiftKey ? 40 : 16);
          }
          if (event.key === "Home") {
            event.preventDefault();
            setLeftPanelWidth(MIN_LEFT_PANEL_WIDTH);
          }
          if (event.key === "End") {
            event.preventDefault();
            setLeftPanelWidth(MAX_LEFT_PANEL_WIDTH);
          }
        }}
      />

      <main className="canvas-panel" aria-label="Infinite graph canvas">
        {!selectedProject && !loading ? (
          <div className="blank-workspace">
            <FolderOpen size={30} />
            <h2>Open a workspace to begin</h2>
            <p>GraphCode stores the graph in the repository's .graphcode folder.</p>
            <Button variant="primary" onPress={onOpenWorkspace}>
              <FolderOpen size={16} />
              Open workspace
            </Button>
          </div>
        ) : (
          <WorkspaceCanvas
            canvas={canvas}
            theme={theme}
            selectedNodeId={selectedNodeId}
            selectedEdgeId={selectedEdgeId}
            selectedBoundaryId={selectedBoundaryId}
            drawBoundaryMode={drawBoundaryMode}
            drawEdgeMode={drawEdgeMode}
            onSelectNode={onCanvasNodeSelect}
            onSelectEdge={onCanvasEdgeSelect}
            onSelectBoundary={onCanvasBoundarySelect}
            onOpenNode={onCanvasNodeOpen}
            onPersistLayout={onPersistLayout}
            onPersistBoundaryLayout={onPersistBoundaryLayout}
            restoreViewport={restoreViewport}
            onViewportChange={onCanvasViewportChange}
            onBoundaryDraft={onBoundaryDraft}
            onEdgeDraft={onEdgeDraft}
            onCancelDraw={onCancelDraw}
          />
        )}
      </main>

      <div
        className="right-panel-resizer"
        role="separator"
        aria-label="Resize details panel"
        aria-orientation="vertical"
        aria-valuemin={MIN_RIGHT_PANEL_WIDTH}
        aria-valuemax={MAX_RIGHT_PANEL_WIDTH}
        aria-valuenow={rightPanelWidth}
        tabIndex={0}
        onPointerDown={handleRightResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            adjustRightPanelWidth(event.shiftKey ? 40 : 16);
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            adjustRightPanelWidth(event.shiftKey ? -40 : -16);
          }
          if (event.key === "Home") {
            event.preventDefault();
            setRightPanelWidth(MIN_RIGHT_PANEL_WIDTH);
          }
          if (event.key === "End") {
            event.preventDefault();
            setRightPanelWidth(MAX_RIGHT_PANEL_WIDTH);
          }
        }}
      />

      <aside className="right-panel" aria-label="Node inspector">
        <div className="right-panel-tabs" role="tablist" aria-label="Details panel mode">
          <button type="button" className={rightPanelMode === "details" ? "active" : ""} onClick={() => setRightPanelMode("details")}>
            <Code2 size={15} />
            Details
          </button>
          <button type="button" className={rightPanelMode === "planning" ? "active" : ""} onClick={() => setRightPanelMode("planning")}>
            <MessageSquare size={15} />
            Planning
          </button>
        </div>
        {rightPanelMode === "details" ? (
          <>
            <CodingWorkflowPanel
              workflow={codingWorkflow}
              modeOverrides={workflowModeOverrides}
              agentBusy={agentBusy}
              onModeChange={onWorkflowModeChange}
              onStart={onStartCodingWorkflow}
              onApplyLayer={onApplyCodingWorkflowLayer}
              onClose={onCloseCodingWorkflow}
            />
            <Inspector
              detail={selectedDetail}
              selectedEdge={selectedEdge}
              selectedBoundary={selectedBoundary}
              canvasNodes={canvas?.nodes ?? []}
              customTypes={canvas?.customTypes ?? []}
              nodeTypeStyles={canvas?.nodeTypeStyles ?? []}
              agentBusy={agentBusy}
              onStartCode={onStartCode}
              onEditNode={onEditNode}
              onEditEdge={onEditEdge}
              onEditBoundary={onEditBoundary}
              onUpdateNodeTypeStyle={onUpdateNodeTypeStyle}
              onUpdateCustomTypeStyle={onUpdateCustomTypeStyle}
              onUpdateBoundaryStyle={onUpdateBoundaryStyle}
              onUpdateEdgeStyle={onUpdateEdgeStyle}
              onUpdateNodeTags={onUpdateNodeTags}
              onUpdateEdgeTags={onUpdateEdgeTags}
              onUpdateBoundaryTags={onUpdateBoundaryTags}
            />
          </>
        ) : (
          <PlanningPanel
            selectedNodeName={selectedDetail?.node.name ?? null}
            agentRuns={agentRuns}
            agentBusy={agentBusy}
            applyingRunIds={applyingRunIds}
            gitStatus={gitStatus}
            onRunPlanning={onRunPlanning}
            onApplyPlanningPatch={onApplyPlanningPatch}
            onRunReview={onRunReview}
          />
        )}
      </aside>
    </div>
  );
}

const DEFAULT_LEFT_PANEL_WIDTH = 318;
const MIN_LEFT_PANEL_WIDTH = 248;
const MAX_LEFT_PANEL_WIDTH = 560;
const DEFAULT_RIGHT_PANEL_WIDTH = 366;
const MIN_RIGHT_PANEL_WIDTH = 280;
const MAX_RIGHT_PANEL_WIDTH = 640;

type CodingWorkflowPanelProps = {
  workflow: CodingWorkflow | null;
  modeOverrides: Record<string, CodingAgentMode>;
  agentBusy: boolean;
  onModeChange: (nodeId: string, mode: CodingAgentMode) => void;
  onStart: () => void;
  onApplyLayer: (workflowId: string, layerIndex: number) => void;
  onClose: () => void;
};

function CodingWorkflowPanel({ workflow, modeOverrides, agentBusy, onModeChange, onStart, onApplyLayer, onClose }: CodingWorkflowPanelProps) {
  if (!workflow) {
    return null;
  }
  const currentLayerItems = workflow.items.filter((item) => item.layerIndex === workflow.currentLayer);
  const canApplyCurrentLayer =
    workflow.status === "blocked" &&
    currentLayerItems.length > 0 &&
    currentLayerItems.every((item) => item.status === "proposed" || item.status === "failed" || item.status === "skipped" || item.status === "applied");
  return (
    <section className="coding-workflow-panel" aria-label="Coding workflow preview">
      <div className="coding-workflow-header">
        <div>
          <strong>Layered coding</strong>
          <span>{workflow.scopeName} · {workflow.status} · layer {workflow.currentLayer + 1}</span>
        </div>
        <Button isIconOnly size="sm" variant="ghost" aria-label="Close coding workflow" onPress={onClose}>
          <Square size={14} />
        </Button>
      </div>
      <p>{workflow.summary}</p>
      <div className="coding-workflow-items">
        {workflow.items.map((item) => (
          <div className="coding-workflow-item" key={item.id}>
            <div>
              <strong>{item.nodeName}</strong>
              <span>Layer {item.layerIndex + 1} · {item.nodeKind} · {item.status}</span>
              <small>{item.modeReason}</small>
            </div>
            <select value={modeOverrides[item.nodeId] ?? item.selectedMode} disabled={workflow.status !== "preview"} onChange={(event) => onModeChange(item.nodeId, event.target.value as CodingAgentMode)}>
              {CODING_AGENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {codingAgentModeLabel(mode)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="coding-workflow-actions">
        {workflow.status === "preview" ? (
          <Button size="sm" variant="primary" isDisabled={agentBusy || workflow.items.length === 0} onPress={onStart}>
            <Play size={14} />
            Start workflow
          </Button>
        ) : (
          <Button size="sm" variant="primary" isDisabled={agentBusy || !canApplyCurrentLayer} onPress={() => onApplyLayer(workflow.id, workflow.currentLayer)}>
            <CheckCircle2 size={14} />
            Apply layer
          </Button>
        )}
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function filterHierarchy(nodes: HierarchyNode[], query: string): HierarchyNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const children = filterHierarchy(node.children, query);
      const boundaryGroups = node.boundaryGroups.filter((boundary) =>
        `${boundary.name} ${boundary.summary} ${boundary.memberNames.join(" ")}`.toLowerCase().includes(needle)
      );
      const boundaryLabelMatches = node.boundaryLabels.some((label) => label.name.toLowerCase().includes(needle));
      const matches = `${node.name} ${node.summary} ${node.kind}`.toLowerCase().includes(needle) || boundaryLabelMatches;
      return matches || children.length > 0 || boundaryGroups.length > 0
        ? {
            ...node,
            children,
            boundaryGroups: matches ? node.boundaryGroups : boundaryGroups
          }
        : null;
    })
    .filter(Boolean) as HierarchyNode[];
}

function PlanningPanel({
  selectedNodeName,
  agentRuns,
  applyingRunIds,
  gitStatus,
  onRunPlanning,
  onApplyPlanningPatch,
  onRunReview
}: {
  selectedNodeName: string | null;
  agentRuns: AgentRun[];
  agentBusy: boolean;
  applyingRunIds: string[];
  gitStatus: string;
  onRunPlanning: (prompt: string) => void;
  onApplyPlanningPatch: (runId: string) => void;
  onRunReview: (runId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const planningRuns = agentRuns.filter((run) => run.agentKind === "planning");
  const activityRuns = agentRuns.filter((run) => run.agentKind !== "planning");
  const latestCodingRun = activityRuns.find((run) => run.agentKind === "coding" && run.status === "succeeded");
  const reviewRunning = activityRuns.some((run) => run.agentKind === "review" && (run.status === "queued" || run.status === "running"));
  const canSubmit = draft.trim().length > 0;

  return (
    <div className="planning-panel">
      <div className="planning-header">
        <span>Planning Tickets</span>
        <small>{selectedNodeName ? `Scope: ${selectedNodeName}` : "Workspace scope"}</small>
      </div>

      <form
        className="planning-composer"
        onSubmit={(event) => {
          event.preventDefault();
          const prompt = draft.trim();
          if (!prompt) {
            return;
          }
          onRunPlanning(prompt);
          setDraft("");
        }}
      >
        <label className="planning-input">
          <span>Prompt</span>
          <textarea value={draft} rows={4} placeholder="Plan graph changes" onChange={(event) => setDraft(event.target.value)} />
        </label>
        <Button
          type="submit"
          variant="primary"
          isDisabled={!canSubmit}
        >
          <MessageSquare size={16} />
          Send
        </Button>
      </form>

      <div className="planning-ticket-list" aria-live="polite">
        {planningRuns.length === 0 ? <p className="muted">No planning tickets yet.</p> : null}
        {planningRuns.slice(0, 10).map((run) => {
          const operationCount = run.graphPatch?.operations.length ?? 0;
          const applying = applyingRunIds.includes(run.id);
          const canApply = run.status === "succeeded" && operationCount > 0 && run.appliedGraphRevision === null;
          return (
            <article className={`agent-ticket-card ${run.status} ${run.appliedGraphRevision !== null ? "applied" : ""}`} key={run.id}>
              <div className="agent-ticket-topline">
                <strong>{run.prompt || "Planning ticket"}</strong>
                <span className={`run-status-badge ${ticketStatusClass(run)}`}>
                  {ticketStatusIcon(run)}
                  {ticketStatusLabel(run)}
                </span>
              </div>
              <p>{run.response || run.error || "Queued."}</p>
              <div className="agent-ticket-meta">
                <span>{operationCount} patch{operationCount === 1 ? "" : "es"}</span>
                <span>base r{run.baseGraphRevision}</span>
                {run.appliedGraphRevision !== null ? <span>applied r{run.appliedGraphRevision}</span> : null}
              </div>
              {run.conflictReason ? (
                <div className="agent-ticket-conflict">
                  <AlertTriangle size={14} />
                  <span>{run.conflictReason}</span>
                </div>
              ) : null}
              {canApply ? (
                <Button size="sm" variant="secondary" isDisabled={applying} onPress={() => onApplyPlanningPatch(run.id)}>
                  <GitPullRequest size={15} />
                  {applying ? "Applying" : "Apply"}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="inspector-section agent-activity-section">
        <h3>
          <Activity size={15} />
          Activity
        </h3>
        {activityRuns.length === 0 ? <p className="muted">No coding, review, or scanning runs yet.</p> : null}
        {activityRuns.slice(0, 6).map((run) => (
          <div className={`agent-activity-row ${run.status}`} key={run.id}>
            <div>
              <strong>{run.agentKind === "coding" && run.codingMode ? `${agentKindLabel(run.agentKind)} ${codingAgentModeLabel(run.codingMode)}` : agentKindLabel(run.agentKind)}</strong>
              <span className={`run-status-badge ${ticketStatusClass(run)}`}>
                {ticketStatusIcon(run)}
                {ticketStatusLabel(run)}
              </span>
            </div>
            <p>{run.response || run.error || run.prompt || "Queued."}</p>
            {run.agentKind === "coding" && run.status === "succeeded" ? (
              <Button size="sm" variant="secondary" isDisabled={reviewRunning} onPress={() => onRunReview(run.id)}>
                <GitBranch size={15} />
                Review
              </Button>
            ) : null}
          </div>
        ))}
        <Button variant="secondary" isDisabled={reviewRunning || !latestCodingRun} onPress={() => latestCodingRun && onRunReview(latestCodingRun.id)}>
          <GitBranch size={16} />
          Review latest
        </Button>
      </section>

      <section className="inspector-section">
        <h3>
          <GitBranch size={15} />
          Git
        </h3>
        {gitStatus ? <pre className="git-status-box">{gitStatus}</pre> : <p className="muted">No pending Git changes detected.</p>}
      </section>
    </div>
  );
}

function ticketStatusLabel(run: AgentRun): string {
  if (run.status === "conflicted" || run.conflictReason) {
    return "Conflicted";
  }
  if (run.appliedGraphRevision !== null) {
    return "Applied";
  }
  switch (run.status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "succeeded":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return run.status;
  }
}

function ticketStatusClass(run: AgentRun): string {
  if (run.status === "conflicted" || run.conflictReason) {
    return "conflicted";
  }
  if (run.appliedGraphRevision !== null) {
    return "applied";
  }
  return run.status;
}

function ticketStatusIcon(run: AgentRun) {
  if (run.status === "conflicted" || run.conflictReason || run.status === "failed") {
    return <AlertTriangle size={12} />;
  }
  if (run.appliedGraphRevision !== null || run.status === "succeeded") {
    return <CheckCircle2 size={12} />;
  }
  return <Clock3 size={12} />;
}
