import { CODING_AGENT_MODES, type AgentRun, type CanvasGraph, type CodingAgentMode, type CodingWorkflow, type CodingWorkflowExecutionPolicy, type EdgePointingDirection, type GraphBoundary, type GraphEdge, type GraphNodeKind, type HierarchyNode, type IndexState, type NodeDetail, type Project, type TagAssignment, type WorkspaceSettings } from "@graphcode/graph-model";
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
  Undo2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { CanvasViewport } from "../canvasSession";
import { agentKindLabel, codingAgentModeLabel, reviewAgentModeLabel } from "../displayLabels";
import { HierarchyTree } from "./HierarchyTree";
import { Inspector } from "./Inspector";
import { WorkspaceCanvas, type MemberLayout } from "./WorkspaceCanvas";

type AppShellProps = {
  selectedProject: Project | null;
  indexState: IndexState | null;
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
  workflowExecutionPolicy: CodingWorkflowExecutionPolicy;
  workflowPreviewDirty: boolean;
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
  onStartCode: (nodeId: string, mode: CodingAgentMode, prompt?: string) => void;
  onWorkflowModeChange: (nodeId: string, mode: CodingAgentMode) => void;
  onWorkflowExecutionPolicyChange: (policy: CodingWorkflowExecutionPolicy) => void;
  onRevalidateCodingWorkflow: () => void;
  onMergeWorkflowUnits: (workUnitIds: string[]) => void;
  onSplitWorkflowUnit: (workUnitId: string) => void;
  onApproveIgnoredWorkflowEdge: (edgeId: string) => void;
  onCodingWorkflowControl: (action: "pause" | "resume" | "cancel" | "retry" | "escalate" | "skip" | "integrate", itemId?: string) => void;
  onStartCodingWorkflow: () => void;
  onApplyCodingWorkflowLayer: (workflowId: string, layerIndex: number) => void;
  onCloseCodingWorkflow: () => void;
  onRunReview: (runId: string) => void;
  onRunScanning: () => void;
  onCancelIndex: () => void;
};

export function AppShell({
  selectedProject,
  indexState,
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
  workflowExecutionPolicy,
  workflowPreviewDirty,
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
  onWorkflowExecutionPolicyChange,
  onRevalidateCodingWorkflow,
  onMergeWorkflowUnits,
  onSplitWorkflowUnit,
  onApproveIgnoredWorkflowEdge,
  onCodingWorkflowControl,
  onStartCodingWorkflow,
  onApplyCodingWorkflowLayer,
  onCloseCodingWorkflow,
  onRunReview,
  onRunScanning,
  onCancelIndex
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
  const showWorkflowError = Boolean(error && rightPanelMode === "details" && codingWorkflow);
  const indexActive = Boolean(indexState && ["discovering", "parsing", "linking", "persisting"].includes(indexState.progress.phase));
  const indexUnavailable = indexState?.completeness.status === "failed" && indexState.completeness.errorCode === "index_state_unavailable";
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
      className={`app-shell ${selectedProject ? "" : "app-shell-empty"} ${resizingLeftPanel ? "resizing-left-panel" : ""} ${resizingRightPanel ? "resizing-right-panel" : ""}`}
      style={{ "--left-panel-width": `${leftPanelWidth}px`, "--right-panel-width": `${rightPanelWidth}px` } as CSSProperties}
    >
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <FolderTree size={18} />
          </div>
          <div>
            <h1>{title}</h1>
            <p>{selectedProject ? `${countLabel(nodeCount, "block")} · ${countLabel(edgeCount, "link")}` : "No project loaded"}</p>
          </div>
        </div>

        {selectedProject && indexState ? (
          <div
            className={`index-state-badge ${indexUnavailable ? "unavailable" : indexState.completeness.status}`}
            role="status"
            title={indexStateTitle(indexState)}
          >
            {indexState.completeness.status === "complete" ? (
              <CheckCircle2 size={14} />
            ) : indexActive ? (
              <Activity size={14} />
            ) : indexUnavailable ? (
              <Clock3 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <span className="index-state-label">{indexStateLabel(indexState)}</span>
            {indexActive ? (
              <button type="button" onClick={onCancelIndex} aria-label="Cancel indexing">
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="top-actions">
          <span title="Open a repository workspace">
            <Button size="sm" variant={selectedProject ? "secondary" : "primary"} className={!selectedProject ? "open-workspace-pulse" : ""} onPress={onOpenWorkspace}>
              <FolderOpen size={16} />
              <span className="toolbar-label">Open workspace</span>
            </Button>
          </span>
          {selectedProject ? (
            <>
              <div className="add-menu-wrap">
            <span title="Add a block, edge, or boundary">
              <Button
                size="sm"
                variant="secondary"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                onPress={() => setAddMenuOpen((open) => !open)}
              >
                <Plus size={16} />
                <span className="toolbar-label">Add</span>
                <ChevronDown size={14} />
              </Button>
            </span>
            {addMenuOpen ? (
              <div className="add-menu" role="menu" aria-label="Add graph element">
                <button
                  type="button"
                  role="menuitem"
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
                  role="menuitem"
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
                  role="menuitem"
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
                <Button size="sm" variant="secondary" onPress={onShowFullGraph}>
                  <Maximize2 size={16} />
                  <span className="toolbar-label">Workspace</span>
                </Button>
              </span>
              <span title="Auto-place this canvas scope">
                <Button size="sm" variant="secondary" onPress={onAutoLayout}>
                  <Sparkles size={16} />
                  <span className="toolbar-label">Auto layout</span>
                </Button>
              </span>
              <span title="Scan repository into graph blocks">
                <Button size="sm" variant="secondary" isDisabled={agentBusy} onPress={onRunScanning}>
                  <Search size={16} />
                  <span className="toolbar-label">Scan</span>
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
              <span title="Destructive reset: rebuilds the self-repo workspace database and erases graph edits and saved placements">
                <Button isIconOnly size="sm" variant="ghost" className="reset-workspace-action" aria-label="Reset self workspace" onPress={onResetSelfWorkspace}>
                  <RotateCcw size={16} />
                </Button>
              </span>
              <span title="Open settings">
                <Button isIconOnly size="sm" variant="ghost" aria-label="Settings" onPress={onOpenSettings}>
                  <Settings size={16} />
                </Button>
              </span>
            </>
          ) : null}
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
        {error && !showWorkflowError ? <div className="error-strip" role="alert">{error}</div> : null}
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
            codingWorkflow={codingWorkflow}
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

      <aside className="right-panel" aria-label={rightPanelMode === "details" ? "Node details and coding" : "Agent planning and activity"}>
        <div className="right-panel-tabs" role="tablist" aria-label="Details panel mode">
          <button
            type="button"
            role="tab"
            id="right-panel-details-tab"
            aria-controls="right-panel-details"
            aria-selected={rightPanelMode === "details"}
            className={rightPanelMode === "details" ? "active" : ""}
            onClick={() => setRightPanelMode("details")}
          >
            <Code2 size={15} />
            Details
          </button>
          <button
            type="button"
            role="tab"
            id="right-panel-planning-tab"
            aria-controls="right-panel-planning"
            aria-selected={rightPanelMode === "planning"}
            className={rightPanelMode === "planning" ? "active" : ""}
            onClick={() => setRightPanelMode("planning")}
          >
            <MessageSquare size={15} />
            Planning
          </button>
        </div>
        {rightPanelMode === "details" ? (
          <div id="right-panel-details" role="tabpanel" aria-labelledby="right-panel-details-tab">
            <CodingWorkflowPanel
              workflow={codingWorkflow}
              error={showWorkflowError ? error : null}
              modeOverrides={workflowModeOverrides}
              executionPolicy={workflowExecutionPolicy}
              previewDirty={workflowPreviewDirty}
              agentBusy={agentBusy}
              onModeChange={onWorkflowModeChange}
              onExecutionPolicyChange={onWorkflowExecutionPolicyChange}
              onRevalidate={onRevalidateCodingWorkflow}
              onMergeUnits={onMergeWorkflowUnits}
              onSplitUnit={onSplitWorkflowUnit}
              onApproveIgnoredEdge={onApproveIgnoredWorkflowEdge}
              onControl={onCodingWorkflowControl}
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
          </div>
        ) : (
          <div id="right-panel-planning" role="tabpanel" aria-labelledby="right-panel-planning-tab">
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
          </div>
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
  error: string | null;
  modeOverrides: Record<string, CodingAgentMode>;
  executionPolicy: CodingWorkflowExecutionPolicy;
  previewDirty: boolean;
  agentBusy: boolean;
  onModeChange: (nodeId: string, mode: CodingAgentMode) => void;
  onExecutionPolicyChange: (policy: CodingWorkflowExecutionPolicy) => void;
  onRevalidate: () => void;
  onMergeUnits: (workUnitIds: string[]) => void;
  onSplitUnit: (workUnitId: string) => void;
  onApproveIgnoredEdge: (edgeId: string) => void;
  onControl: (action: "pause" | "resume" | "cancel" | "retry" | "escalate" | "skip" | "integrate", itemId?: string) => void;
  onStart: () => void;
  onApplyLayer: (workflowId: string, layerIndex: number) => void;
  onClose: () => void;
};

const WORKFLOW_PAGE_SIZE = 25;

function CodingWorkflowPanel({
  workflow,
  error,
  modeOverrides,
  executionPolicy,
  previewDirty,
  agentBusy,
  onModeChange,
  onExecutionPolicyChange,
  onRevalidate,
  onMergeUnits,
  onSplitUnit,
  onApproveIgnoredEdge,
  onControl,
  onStart,
  onApplyLayer,
  onClose
}: CodingWorkflowPanelProps) {
  const [page, setPage] = useState(0);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  useEffect(() => {
    setPage(0);
    setSelectedUnitIds([]);
  }, [workflow?.id]);
  if (!workflow) {
    return null;
  }
  const orchestration = workflow.orchestration;
  const unitById = new Map(orchestration?.workUnits.map((unit) => [unit.id, unit]) ?? []);
  const routeByUnitId = new Map(orchestration?.routingDecisions.map((decision) => [decision.workUnitId, decision]) ?? []);
  const currentLayerItems = workflow.items.filter((item) => item.layerIndex === workflow.currentLayer);
  const canApplyCurrentLayer =
    workflow.status === "blocked" &&
    currentLayerItems.length > 0 &&
    currentLayerItems.every((item) => item.status === "proposed" || item.status === "skipped" || item.status === "applied");
  const completedItems = workflow.items.filter((item) => ["proposed", "applied", "skipped", "failed", "cancelled"].includes(item.status)).length;
  const pageCount = Math.max(1, Math.ceil(workflow.items.length / WORKFLOW_PAGE_SIZE));
  const boundedPage = Math.min(page, pageCount - 1);
  const visibleItems = workflow.items.slice(boundedPage * WORKFLOW_PAGE_SIZE, (boundedPage + 1) * WORKFLOW_PAGE_SIZE);
  const failedChecks = workflow.integrationChecks?.filter((check) => check.status !== "passed") ?? [];
  const ignoredEdges = orchestration?.partitioning?.ignoredEdges ?? [];
  return (
    <section className="coding-workflow-panel" aria-label="Coding workflow preview">
      <div className="coding-workflow-header">
        <div>
          <strong>Layered coding</strong>
          <span>{workflow.scopeName} · {codingWorkflowStatusLabel(workflow.status, canApplyCurrentLayer)} · layer {workflow.currentLayer + 1}</span>
        </div>
        <Button isIconOnly size="sm" variant="ghost" aria-label="Close coding workflow" onPress={onClose}>
          <X size={14} />
        </Button>
      </div>
      {error ? <div className="coding-workflow-error" role="alert">{error}</div> : null}
      <p>{workflow.summary}</p>
      <div className="coding-workflow-progress" aria-live="polite">
        <progress max={Math.max(1, workflow.items.length)} value={completedItems} aria-label="Workflow completion" />
        <span>
          {completedItems}/{workflow.items.length} {workflow.items.length === 1 ? "unit" : "units"} · {countLabel(orchestration?.partitioning?.cutRelationshipEdges ?? 0, "cut edge")} · {countLabel(orchestration?.interfaceContracts.length ?? 0, "contract")}
        </span>
      </div>
      {orchestration ? (
        <div className="coding-workflow-policy" aria-label="Workflow execution limits">
          <label>
            <span>Concurrency</span>
            <input
              type="number"
              min={1}
              max={32}
              value={executionPolicy.maximumConcurrency}
              disabled={workflow.status !== "preview"}
              onChange={(event) => onExecutionPolicyChange({ ...executionPolicy, maximumConcurrency: Math.max(1, Math.min(32, Number(event.target.value) || 1)) })}
            />
          </label>
          <label>
            <span>Cost cap ({executionPolicy.currency})</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="No cap"
              value={executionPolicy.maxEstimatedCost ?? ""}
              disabled={workflow.status !== "preview"}
              onChange={(event) => onExecutionPolicyChange({ ...executionPolicy, maxEstimatedCost: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })}
            />
          </label>
        </div>
      ) : null}
      {previewDirty ? (
        <div className="coding-workflow-validation-warning" role="status">
          <AlertTriangle size={14} /> Preview controls changed. Revalidate before execution.
        </div>
      ) : null}
      {workflow.status === "preview" && orchestration ? (
        <div className="coding-workflow-partition-actions">
          <Button size="sm" variant="secondary" isDisabled={agentBusy || selectedUnitIds.length < 2} onPress={() => onMergeUnits(selectedUnitIds)}>
            Merge / move selected
          </Button>
          <Button size="sm" variant="secondary" isDisabled={agentBusy || selectedUnitIds.length !== 1 || (unitById.get(selectedUnitIds[0])?.ownedNodeIds.length ?? 0) < 2} onPress={() => onSplitUnit(selectedUnitIds[0])}>
            Split selected
          </Button>
        </div>
      ) : null}
      <div className="coding-workflow-items">
        {visibleItems.map((item) => {
          const unit = unitById.get(item.id);
          const route = routeByUnitId.get(item.id);
          const blockingDependencies = unit?.dependencyWorkUnitIds.filter((dependencyId) => {
            const dependency = workflow.items.find((candidate) => candidate.id === dependencyId);
            return dependency && dependency.status !== "applied" && dependency.status !== "skipped";
          }) ?? [];
          return (
          <article className={`coding-workflow-item status-${item.status}`} key={item.id}>
            {workflow.status === "preview" && orchestration ? (
              <input
                className="coding-workflow-select-unit"
                type="checkbox"
                aria-label={`Select ${unit?.title ?? item.nodeName} partition`}
                checked={selectedUnitIds.includes(item.id)}
                onChange={(event) => setSelectedUnitIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
              />
            ) : null}
            <div>
              <strong>{unit?.title ?? item.nodeName}</strong>
              <span>Wave {item.layerIndex + 1} · {item.nodeKind} · <b>{formatWorkflowStatus(item.status)}</b></span>
              <small>{unit?.objective ?? item.objective ?? item.modeReason}</small>
              {blockingDependencies.length > 0 ? <small className="workflow-blocker">Blocked by {blockingDependencies.join(", ")}</small> : null}
              <details>
                <summary>Why, scope, model, and evidence</summary>
                <dl className="coding-workflow-evidence">
                  <div><dt>Owned</dt><dd>{unit?.ownedNodeIds.join(", ") || item.nodeId}</dd></div>
                  <div><dt>Read halo</dt><dd>{unit?.readHaloNodeIds.join(", ") || "None"}</dd></div>
                  <div><dt>Writes</dt><dd>{unit?.plannedWriteScopes.map((scope) => `${scope.permission}:${scope.path}:${scope.startLine ?? "*"}-${scope.endLine ?? "*"}`).join("; ") || "Legacy scope"}</dd></div>
                  <div><dt>Dependencies</dt><dd>{unit?.dependencyWorkUnitIds.join(", ") || "None"}</dd></div>
                  <div><dt>Routing</dt><dd>{route?.reasons.join(" ") || item.modeReason}</dd></div>
                  <div><dt>Provider/model</dt><dd>{route?.assignment ? `${route.assignment.providerId}/${route.assignment.modelId}` : "Assigned at start"}</dd></div>
                  <div><dt>Estimate</dt><dd>{route ? `${route.estimatedInputTokens} in / ${route.estimatedOutputTokens} out / ${route.estimatedCost ?? "unpriced"}` : "Unavailable"}</dd></div>
                  <div><dt>Actual</dt><dd>{route?.metrics ? `${route.metrics.actualInputTokens} in / ${route.metrics.actualOutputTokens} out / ${route.metrics.latencyMs} ms / ${route.metrics.actualCost ?? "unpriced"}` : "Not run"}</dd></div>
                </dl>
              </details>
            </div>
            <select
              aria-label={`Model scale for ${unit?.title ?? item.nodeName}`}
              value={modeOverrides[item.nodeId] ?? item.selectedMode}
              disabled={workflow.status !== "preview"}
              onChange={(event) => onModeChange(item.nodeId, event.target.value as CodingAgentMode)}
            >
              {CODING_AGENT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {codingAgentModeLabel(mode)}
                </option>
              ))}
            </select>
            {workflow.status !== "preview" && ["blocked", "failed"].includes(item.status) ? (
              <div className="coding-workflow-item-actions">
                <button type="button" disabled={agentBusy} onClick={() => onControl("retry", item.id)}>Retry</button>
                <button type="button" disabled={agentBusy || item.selectedMode === "large"} onClick={() => onControl("escalate", item.id)}>Escalate</button>
                <button type="button" disabled={agentBusy} onClick={() => onControl("skip", item.id)}>Skip</button>
              </div>
            ) : null}
          </article>
          );
        })}
      </div>
      {pageCount > 1 ? (
        <div className="coding-workflow-pagination" aria-label="Workflow unit pages">
          <button type="button" disabled={boundedPage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
          <span>Page {boundedPage + 1} of {pageCount}</span>
          <button type="button" disabled={boundedPage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Next</button>
        </div>
      ) : null}
      {orchestration?.interfaceContracts.length ? (
        <details className="coding-workflow-contracts">
          <summary>Interface contracts ({orchestration.interfaceContracts.length})</summary>
          {orchestration.interfaceContracts.map((contract) => (
            <div key={contract.id} className={`workflow-contract status-${contract.status}`}>
              <strong>{formatWorkflowStatus(contract.contractKind)} · {formatWorkflowStatus(contract.status)}</strong>
              <span>{contract.producerWorkUnitId} → {contract.consumerWorkUnitId}</span>
              <small>{contract.proposed?.summary ?? contract.baseline.summary}</small>
            </div>
          ))}
        </details>
      ) : null}
      {ignoredEdges.length ? (
        <details className="coding-workflow-contracts">
          <summary>Ignored edge reasons ({ignoredEdges.length})</summary>
          {ignoredEdges.map((edge) => (
            <div key={edge.id} className="workflow-contract">
              <span>{edge.edgeId} · {edge.reason} · {edge.approvedBy}</span>
              {workflow.status === "preview" && edge.approvedBy !== "user" ? <button type="button" onClick={() => onApproveIgnoredEdge(edge.edgeId)}>Approve reason</button> : null}
            </div>
          ))}
        </details>
      ) : null}
      {workflow.integrationChecks?.length ? (
        <details className="coding-workflow-checks" open={failedChecks.length > 0}>
          <summary>Integration checks ({workflow.integrationChecks.length})</summary>
          {workflow.integrationChecks.map((check) => (
            <div key={check.id} className={`workflow-check status-${check.status}`}>
              <strong>{integrationCheckLabel(check.checkKind)}</strong>
              <span>{formatWorkflowStatus(check.status)}</span>
              {check.status !== "passed" ? <pre>{JSON.stringify(check.diagnostics, null, 2)}</pre> : null}
            </div>
          ))}
        </details>
      ) : null}
      {canApplyCurrentLayer ? (
        <p className="coding-workflow-next-step">Proposals are ready. Inspect their evidence, then integrate to validate or apply the layer to validate and write it.</p>
      ) : null}
      <div className="coding-workflow-actions">
        {workflow.status === "preview" ? (
          <>
            <Button size="sm" variant="secondary" isDisabled={agentBusy || !previewDirty} onPress={onRevalidate}>
              <RefreshCw size={14} /> Revalidate preview
            </Button>
            <Button size="sm" variant="primary" isDisabled={agentBusy || workflow.items.length === 0 || previewDirty} onPress={onStart}>
              <Play size={14} /> Start workflow
            </Button>
          </>
        ) : (
          <>
            {workflow.status === "running" ? <Button size="sm" variant="secondary" isDisabled={agentBusy} onPress={() => onControl("pause")}>Pause</Button> : null}
            {workflow.status === "blocked" && !canApplyCurrentLayer ? <Button size="sm" variant="secondary" isDisabled={agentBusy} onPress={() => onControl("resume")}>Resume</Button> : null}
            {!(["succeeded", "failed", "cancelled"] as string[]).includes(workflow.status) ? <Button size="sm" variant="secondary" isDisabled={agentBusy} onPress={() => onControl("cancel")}>Cancel</Button> : null}
            <Button size="sm" variant="secondary" isDisabled={agentBusy || !canApplyCurrentLayer} onPress={() => onControl("integrate")}>Integrate</Button>
            <Button size="sm" variant="primary" isDisabled={agentBusy || !canApplyCurrentLayer} onPress={() => onApplyLayer(workflow.id, workflow.currentLayer)}>
              <CheckCircle2 size={14} /> Apply layer
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function codingWorkflowStatusLabel(status: CodingWorkflow["status"], readyForReview: boolean): string {
  return readyForReview ? "ready for review" : formatWorkflowStatus(status);
}

function formatWorkflowStatus(status: string): string {
  const label = status.replaceAll("_", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function integrationCheckLabel(checkKind: string): string {
  const labels: Record<string, string> = {
    actual_write_set: "Actual changes",
    write_authorization: "Write authorization",
    stale_revision: "Source freshness",
    overlap_conflict: "Edit conflicts",
    interface_contract: "Interface contracts",
    combined_patch: "Combined patch",
    targeted_checks: "Targeted checks"
  };
  return labels[checkKind] ?? formatWorkflowStatus(checkKind);
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
  const reviewTargets = new Map(
    activityRuns
      .filter((run) => run.agentKind === "review")
      .map((run) => [reviewTargetRunId(run), run] as const)
      .filter((entry): entry is [string, AgentRun] => Boolean(entry[0]))
  );
  const latestCodingRun = activityRuns.find(
    (run) => run.agentKind === "coding" && run.status === "succeeded" && !reviewTargets.has(run.id)
  );
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
            <article
              className={`agent-ticket-card ${run.status} ${run.appliedGraphRevision !== null ? "applied" : ""}`}
              aria-busy={run.status === "queued" || run.status === "running"}
              aria-labelledby={`agent-run-${run.id}-title`}
              key={run.id}
            >
              <div className="agent-ticket-topline">
                <strong id={`agent-run-${run.id}-title`} title={run.prompt || "Planning ticket"}>{run.prompt || "Planning ticket"}</strong>
                <span className={`run-status-badge ${ticketStatusClass(run)}`}>
                  {ticketStatusIcon(run)}
                  {ticketStatusLabel(run)}
                </span>
              </div>
              <p>{agentRunSummary(run)}</p>
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
              {run.response || run.diff ? <AgentRunDetails run={run} /> : null}
              {canApply ? (
                <Button size="sm" variant="secondary" isDisabled={applying} onPress={() => onApplyPlanningPatch(run.id)}>
                  <GitPullRequest size={15} />
                  {applying ? "Applying graph patch" : "Apply graph patch"}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="inspector-section agent-activity-section" aria-live="polite" aria-label="Agent activity">
        <h3>
          <Activity size={15} />
          Activity
        </h3>
        {activityRuns.length === 0 ? <p className="muted">No coding, review, or scanning runs yet.</p> : null}
        {activityRuns.slice(0, 6).map((run) => {
          const matchingReview = run.agentKind === "coding" ? reviewTargets.get(run.id) : null;
          return (
          <article
            className={`agent-activity-row ${run.status}`}
            aria-busy={run.status === "queued" || run.status === "running"}
            aria-labelledby={`agent-run-${run.id}-title`}
            key={run.id}
          >
            <div>
              <strong id={`agent-run-${run.id}-title`}>{agentRunTitle(run)}</strong>
              <span className={`run-status-badge ${ticketStatusClass(run)}`}>
                {ticketStatusIcon(run)}
                {ticketStatusLabel(run)}
              </span>
            </div>
            <p>{agentRunSummary(run)}</p>
            {run.response || run.diff ? <AgentRunDetails run={run} /> : null}
            {run.agentKind === "coding" && run.status === "succeeded" && !matchingReview ? (
              <Button size="sm" variant="secondary" isDisabled={reviewRunning} onPress={() => onRunReview(run.id)}>
                <GitBranch size={15} />
                Review
              </Button>
            ) : null}
            {matchingReview ? <span className="agent-review-state"><CheckCircle2 size={14} /> Review attached</span> : null}
          </article>
          );
        })}
        {latestCodingRun ? (
          <Button variant="secondary" isDisabled={reviewRunning} onPress={() => onRunReview(latestCodingRun.id)}>
            <GitBranch size={16} />
            Review latest unreviewed proposal
          </Button>
        ) : null}
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

function indexStateLabel(state: IndexState): string {
  const counts = state.counts;
  if (["discovering", "parsing", "linking", "persisting"].includes(state.progress.phase)) {
    return `${state.progress.message} ${state.progress.completed}/${state.progress.total}`;
  }
  switch (state.completeness.status) {
    case "complete":
      return `Index complete · ${counts.indexed}/${counts.discovered}`;
    case "partial":
      return `Index partial · ${counts.indexed}/${counts.discovered}`;
    case "stale":
      return `Index stale · ${state.completeness.changedFiles.length} changed`;
    case "failed":
      return state.completeness.errorCode === "index_state_unavailable" ? "Index state unavailable" : "Index failed";
  }
}

function indexStateTitle(state: IndexState): string {
  const counts = state.counts;
  const countsText = `Discovered ${counts.discovered}; supported ${counts.supported}; indexed ${counts.indexed}; unsupported ${counts.unsupported}; excluded ${counts.excluded}; failed ${counts.failed}.`;
  if (state.completeness.status === "partial") {
    return `${countsText} ${state.completeness.reasons.join(" ")}`;
  }
  if (state.completeness.status === "stale") {
    return `${countsText} Stale since ${state.completeness.sinceRevision}.`;
  }
  if (state.completeness.status === "failed") {
    return `${countsText} ${state.completeness.errorCode}.`;
  }
  return countsText;
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
      if (run.agentKind === "planning") return "Ready to apply";
      if (run.agentKind === "coding") return "Proposal ready";
      if (run.agentKind === "review") return "Review complete";
      if (run.agentKind === "scanning") return "Scan complete";
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return run.status;
  }
}

function reviewTargetRunId(run: AgentRun): string | null {
  if (run.agentKind !== "review") return null;
  const match = run.prompt.match(/^Review\s+(run-[^\s]+)$/);
  return match?.[1] ?? null;
}

function agentRunSummary(run: AgentRun): string {
  if (run.error) return run.error;
  if (run.status === "queued" || run.status === "running") return run.status === "queued" ? "Queued." : "Running.";
  if (run.agentKind === "planning") return run.prompt ? `Plan prepared for: ${run.prompt}` : "Planning ticket prepared.";
  if (run.agentKind === "coding") return run.prompt ? `Proposal created for: ${run.prompt}` : "Coding proposal created.";
  if (run.agentKind === "review") {
    const verdict = run.response.match(/GRAPHCODE_REVIEW_VERDICT:\s*(reviewed|bugged)/i)?.[1]?.toLowerCase();
    return verdict === "bugged" ? "Review found a likely issue in the proposal." : "Review completed for the coding proposal.";
  }
  return run.response || run.prompt || "Run completed.";
}

function AgentRunDetails({ run }: { run: AgentRun }) {
  const label = run.agentKind === "coding" ? "Inspect proposal" : run.agentKind === "review" ? "Inspect review" : run.agentKind === "planning" ? "Inspect plan output" : "Inspect run output";
  return (
    <details className="agent-run-details">
      <summary>{label}</summary>
      {run.response ? (
        <div>
          <strong>Agent response</strong>
          <pre>{run.response}</pre>
        </div>
      ) : null}
      {run.diff ? (
        <div>
          <strong>Proposed diff</strong>
          <pre>{run.diff}</pre>
        </div>
      ) : null}
    </details>
  );
}

function agentRunTitle(run: AgentRun): string {
  if (run.agentKind === "coding" && run.codingMode) {
    return `${agentKindLabel(run.agentKind)} ${codingAgentModeLabel(run.codingMode)}`;
  }
  if (run.agentKind === "review" && run.reviewMode) {
    return `${agentKindLabel(run.agentKind)} ${reviewAgentModeLabel(run.reviewMode)}`;
  }
  return agentKindLabel(run.agentKind);
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
