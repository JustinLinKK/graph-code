import type { CanvasGraph, GraphBoundary, GraphEdge, GraphNodeKind, HierarchyNode, NodeDetail, Project, TagAssignment } from "@graphcode/graph-model";
import { Button, Spinner } from "@heroui/react";
import { Boxes, ChevronDown, FolderOpen, FolderTree, GitBranch, Maximize2, Plus, RefreshCw, RotateCcw, Search, Sparkles, Square, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { HierarchyTree } from "./HierarchyTree";
import { Inspector } from "./Inspector";
import { WorkspaceCanvas, type MemberLayout } from "./WorkspaceCanvas";

type AppShellProps = {
  projects: Project[];
  selectedProject: Project | null;
  hierarchy: HierarchyNode[];
  canvas: CanvasGraph | null;
  selectedDetail: NodeDetail | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedBoundaryId: string | null;
  selectedEdge: GraphEdge | null;
  selectedBoundary: GraphBoundary | null;
  drawBoundaryMode: boolean;
  drawEdgeMode: boolean;
  canUndo: boolean;
  loading: boolean;
  error: string | null;
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
  onBoundaryDraft: (draft: { position: { x: number; y: number }; size: { width: number; height: number } }) => void;
  onEdgeDraft: (draft: { sourceNodeId: string; targetNodeId: string }) => void;
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
  onUpdateEdgeStyle: (edgeId: string, patch: { color?: string; animated?: boolean }) => void;
  onUpdateNodeTags: (nodeId: string, input: TagAssignment) => void;
  onUpdateEdgeTags: (edgeId: string, input: TagAssignment) => void;
  onUpdateBoundaryTags: (boundaryId: string, input: TagAssignment) => void;
  onShowFullGraph: () => void;
  onAutoLayout: () => void;
  onResetSelfWorkspace: () => void;
  onRefresh: () => void;
  onUndo: () => void;
};

export function AppShell({
  projects,
  selectedProject,
  hierarchy,
  canvas,
  selectedDetail,
  selectedNodeId,
  selectedEdgeId,
  selectedBoundaryId,
  selectedEdge,
  selectedBoundary,
  drawBoundaryMode,
  drawEdgeMode,
  canUndo,
  loading,
  error,
  onSelectNode,
  onOpenNode,
  onHierarchyBoundarySelect,
  onCanvasNodeSelect,
  onCanvasEdgeSelect,
  onCanvasBoundarySelect,
  onCanvasNodeOpen,
  onPersistLayout,
  onPersistBoundaryLayout,
  onBoundaryDraft,
  onEdgeDraft,
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
  onUndo
}: AppShellProps) {
  const [query, setQuery] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(DEFAULT_LEFT_PANEL_WIDTH);
  const [resizingLeftPanel, setResizingLeftPanel] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: DEFAULT_LEFT_PANEL_WIDTH });
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

  return (
    <div className={`app-shell ${resizingLeftPanel ? "resizing-left-panel" : ""}`} style={{ "--left-panel-width": `${leftPanelWidth}px` } as CSSProperties}>
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
            onBoundaryDraft={onBoundaryDraft}
            onEdgeDraft={onEdgeDraft}
          />
        )}
      </main>

      <aside className="right-panel" aria-label="Node inspector">
        <Inspector
          detail={selectedDetail}
          selectedEdge={selectedEdge}
          selectedBoundary={selectedBoundary}
          canvasNodes={canvas?.nodes ?? []}
          customTypes={canvas?.customTypes ?? []}
          nodeTypeStyles={canvas?.nodeTypeStyles ?? []}
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
      </aside>
    </div>
  );
}

const DEFAULT_LEFT_PANEL_WIDTH = 318;
const MIN_LEFT_PANEL_WIDTH = 248;
const MAX_LEFT_PANEL_WIDTH = 560;

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
