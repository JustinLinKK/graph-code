import { AVAILABLE_EXTENSION_PACKAGES, type AgentRun, type CanvasGraph, type GraphBoundary, type GraphEdge, type GraphNode, type HierarchyNode, type NodeDetail, type Project } from "@graphcode/graph-model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const reactFlowMock = vi.hoisted(() => ({
  fitView: vi.fn(),
  setCenter: vi.fn(),
  setViewport: vi.fn()
}));

vi.mock("@xyflow/react", async () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  Background: ({ color, gap, size }: { color?: string; gap?: number; size?: number }) => <div data-testid="background" data-color={color} data-gap={gap} data-size={size} />,
  BaseEdge: () => null,
  Controls: () => <div data-testid="controls" />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  getSmoothStepPath: () => ["M 0 0", 0, 0, 0, 0],
  Handle: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  MiniMap: () => <div data-testid="minimap" />,
  NodeResizer: () => null,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Position: { Left: "left", Right: "right" },
  ReactFlow: ({
    nodes,
    edges,
    onNodeClick,
    onNodeDoubleClick,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onEdgeClick,
    onConnect,
    onPaneClick,
    onMouseMove,
      onMoveEnd,
      className,
      colorMode,
      nodesDraggable,
    nodesConnectable,
    elementsSelectable,
    panOnDrag,
    connectOnClick,
    connectionRadius,
    children
  }: {
    nodes: Array<{
      id: string;
      position: { x: number; y: number };
      style?: { width?: number; height?: number };
      data: {
        node?: GraphNode;
        boundary?: GraphBoundary;
        onResizeEnd?: (nodeId: string, size: { width: number; height: number }) => void;
      };
    }>;
    edges: GraphEdge[];
    onNodeClick?: (event: unknown, node: { id: string; data: { node?: GraphNode; boundary?: GraphBoundary } }) => void;
    onNodeDoubleClick?: (event: unknown, node: { id: string; data: { node?: GraphNode; boundary?: GraphBoundary } }) => void;
    onNodeDragStart?: (
      event: unknown,
      node: { id: string; position: { x: number; y: number }; style?: { width?: number; height?: number }; data: { node?: GraphNode; boundary?: GraphBoundary } }
    ) => void;
    onNodeDrag?: (
      event: unknown,
      node: { id: string; position: { x: number; y: number }; style?: { width?: number; height?: number }; data: { node?: GraphNode; boundary?: GraphBoundary } }
    ) => void;
    onNodeDragStop?: (
      event: unknown,
      node: { id: string; position: { x: number; y: number }; style?: { width?: number; height?: number }; data: { node?: GraphNode; boundary?: GraphBoundary } }
    ) => void;
    onEdgeClick?: (event: unknown, edge: GraphEdge) => void;
      onConnect?: (connection: { source: string; target: string }) => void;
    onPaneClick?: (event: { button: number; clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) => void;
    onMouseMove?: (event: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) => void;
      onMoveEnd?: (event: null, viewport: { x: number; y: number; zoom: number }) => void;
      className?: string;
    colorMode?: string;
    nodesDraggable?: boolean;
    nodesConnectable?: boolean;
    elementsSelectable?: boolean;
    panOnDrag?: boolean | number[];
    connectOnClick?: boolean;
    connectionRadius?: number;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="react-flow"
      className={className}
      data-color-mode={colorMode}
      data-nodes-draggable={String(nodesDraggable)}
      data-nodes-connectable={String(nodesConnectable)}
      data-elements-selectable={String(elementsSelectable)}
      data-pan-on-drag={String(panOnDrag)}
      data-connect-on-click={String(connectOnClick)}
      data-connection-radius={connectionRadius}
    >
      {nodes.map((node) => (
        <div key={node.id}>
          {node.data.node ? (
            <>
              <button type="button" onClick={() => onNodeClick?.({}, node)} onDoubleClick={() => onNodeDoubleClick?.({}, node)}>
                {node.data.node.name}
              </button>
              <button
                type="button"
                aria-label={`Drag ${node.data.node.name}`}
                onClick={() =>
                  onNodeDragStop?.({}, {
                    ...node,
                    position: { x: 333, y: 222 },
                    style: { width: node.data.node?.size.width, height: node.data.node?.size.height }
                  })
                }
              />
              <button type="button" aria-label={`Resize ${node.data.node.name}`} onClick={() => node.data.onResizeEnd?.(node.id, { width: 320, height: 180 })} />
            </>
          ) : null}
          {node.data.boundary ? (
            <div data-testid={`boundary-${node.id}`} data-width={node.style?.width} data-height={node.style?.height}>
              <button type="button" onClick={() => onNodeClick?.({}, node)}>
                {node.data.boundary.name}
              </button>
              <button
                type="button"
                aria-label={`Drag ${node.data.boundary.name}`}
                onClick={() => {
                  const draggedNode = {
                    ...node,
                    position: { x: 555, y: 444 },
                    style: { width: node.data.boundary?.size.width, height: node.data.boundary?.size.height }
                  };
                  onNodeDragStart?.({}, node);
                  onNodeDrag?.({}, draggedNode);
                  onNodeDragStop?.({}, draggedNode);
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
      {edges.map((edge) => (
        <button key={edge.id} type="button" aria-label={`Select edge ${edge.label ?? edge.kind}`} onClick={() => onEdgeClick?.({}, edge)}>
          {edge.label ?? edge.kind}
        </button>
      ))}
      <button
        type="button"
        aria-label="Draw boundary gesture"
        onClick={() => {
          const preventDefault = vi.fn();
          const stopPropagation = vi.fn();
          onPaneClick?.({ button: 0, clientX: 10, clientY: 20, preventDefault, stopPropagation });
          onMouseMove?.({ clientX: 210, clientY: 160, preventDefault, stopPropagation });
          onPaneClick?.({ button: 0, clientX: 210, clientY: 160, preventDefault, stopPropagation });
        }}
      />
      <button
        type="button"
        aria-label="Start boundary"
        onClick={() => {
          const preventDefault = vi.fn();
          const stopPropagation = vi.fn();
          onPaneClick?.({ button: 0, clientX: 10, clientY: 20, preventDefault, stopPropagation });
        }}
      />
      <button
        type="button"
        aria-label="Preview boundary"
        onClick={() => {
          const preventDefault = vi.fn();
          const stopPropagation = vi.fn();
          onMouseMove?.({ clientX: 210, clientY: 160, preventDefault, stopPropagation });
        }}
      />
      <button
        type="button"
        aria-label="Finish boundary"
        onClick={() => {
          const preventDefault = vi.fn();
          const stopPropagation = vi.fn();
          onPaneClick?.({ button: 0, clientX: 210, clientY: 160, preventDefault, stopPropagation });
        }}
      />
      <button
        type="button"
        aria-label="Draw edge gesture"
        onClick={() => onConnect?.({ source: "input-user-select", target: "process-web" })}
      />
      <button type="button" aria-label="Move viewport" onClick={() => onMoveEnd?.(null, { x: 12, y: 34, zoom: 0.8 })} />
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({
    fitView: reactFlowMock.fitView,
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    setCenter: reactFlowMock.setCenter,
    setViewport: reactFlowMock.setViewport
  })
}));

const project: Project = {
  id: "graphcode-self",
  name: "graph-code",
  rootPath: "/home/justin/graph-code",
  description: "GraphCode self workspace.",
  scanningInstructions: "Group by package and runtime boundary.",
  createdAt: "now",
  updatedAt: "now"
};

function rememberExplicitProjectSession(scopeNodeId: string | null = null, viewports: Record<string, { x: number; y: number; zoom: number }> = {}): void {
  window.localStorage.setItem(
    "graphcode.canvasSession.v1",
    JSON.stringify({
      lastProjectId: project.id,
      lastOpenedProjectId: project.id,
      projects: {
        [project.id]: {
          lastScopeNodeId: scopeNodeId,
          viewports
        }
      }
    })
  );
}

const framework = node({ id: "framework", kind: "framework", name: "GraphCode Workspace", childCount: 1 });
const moduleWeb = node({
  id: "module-web",
  kind: "module",
  name: "Web Workspace",
  summary: "Client app.",
  parentId: "framework",
  sourcePath: "apps/web",
  position: { x: 100, y: 100 },
  childCount: 1
});
const moduleCanvas = node({
  id: "module-canvas",
  kind: "module",
  name: "Canvas Layer",
  parentId: "module-web",
  position: { x: 420, y: 160 }
});
const functionRenderWidget = node({
  id: "function-render-widget",
  kind: "function",
  name: "renderWidget",
  parentId: "module-web",
  position: { x: 420, y: 330 },
  childCount: 0,
  hasChildren: false
});
const processWeb = node({
  id: "process-web",
  kind: "process",
  name: "Render Workspace Scope",
  attachedToId: "module-web",
  position: { x: 220, y: 160 },
  size: { width: 210, height: 96 }
});
const inputSelection = node({
  id: "input-user-select",
  kind: "input",
  name: "Hierarchy Selection",
  attachedToId: "module-web",
  position: { x: 20, y: 160 },
  size: { width: 190, height: 90 }
});
const outputWorkspace = node({
  id: "output-workspace",
  kind: "output",
  name: "Workspace State",
  attachedToId: "module-web",
  position: { x: 660, y: 160 },
  size: { width: 190, height: 90 }
});
const formatSelection = node({
  id: "format-selection",
  kind: "format",
  name: "node id",
  attachedToId: "input-user-select",
  position: { x: 20, y: 270 },
  size: { width: 132, height: 68 }
});
const functionInput = node({
  id: "function-render-widget-input",
  kind: "input",
  name: "props",
  attachedToId: "function-render-widget",
  position: { x: 20, y: 160 },
  size: { width: 190, height: 90 }
});
const functionProcess = node({
  id: "function-render-widget-process",
  kind: "process",
  name: "Process renderWidget",
  attachedToId: "function-render-widget",
  position: { x: 260, y: 160 },
  size: { width: 220, height: 100 }
});
const functionOutput = node({
  id: "function-render-widget-output",
  kind: "output",
  name: "Rendered JSX",
  attachedToId: "function-render-widget",
  position: { x: 540, y: 160 },
  size: { width: 190, height: 90 }
});
const functionFormat = node({
  id: "function-render-widget-output-format",
  kind: "format",
  name: "JSX.Element",
  attachedToId: "function-render-widget-output",
  position: { x: 560, y: 280 },
  size: { width: 150, height: 68 }
});
const frontendBoundary: GraphBoundary = boundary({
  id: "boundary-frontend",
  scopeNodeId: "framework",
  name: "Frontend",
  summary: "React modules",
  memberNodeIds: ["module-web"],
  position: { x: 80, y: 80 },
  size: { width: 320, height: 180 }
});
const moduleBoundary: GraphBoundary = boundary({
  id: "boundary-web-flow",
  scopeNodeId: "module-web",
  name: "Web Flow",
  summary: "Selection flow",
  memberNodeIds: ["input-user-select", "process-web"],
  position: { x: 10, y: 120 },
  size: { width: 460, height: 170 }
});

const hierarchy: HierarchyNode[] = [
  {
    ...framework,
    boundaryLabels: [],
    boundaryGroups: [
      {
        id: frontendBoundary.id,
        scopeNodeId: frontendBoundary.scopeNodeId,
        name: frontendBoundary.name,
        summary: frontendBoundary.summary,
        color: frontendBoundary.color,
        memberNodeIds: frontendBoundary.memberNodeIds,
        memberNames: ["Web Workspace"]
      }
    ],
    children: [
      {
        ...moduleWeb,
        boundaryLabels: [{ id: frontendBoundary.id, name: frontendBoundary.name, color: frontendBoundary.color }],
        boundaryGroups: [
          {
            id: moduleBoundary.id,
            scopeNodeId: moduleBoundary.scopeNodeId,
            name: moduleBoundary.name,
            summary: moduleBoundary.summary,
            color: moduleBoundary.color,
            memberNodeIds: moduleBoundary.memberNodeIds,
            memberNames: ["Hierarchy Selection", "Render Workspace Scope"]
          }
        ],
        children: [
          { ...moduleCanvas, children: [], boundaryLabels: [], boundaryGroups: [] },
          { ...functionRenderWidget, children: [], boundaryLabels: [], boundaryGroups: [] }
        ]
      }
    ]
  }
];

const frameworkCanvas: CanvasGraph = {
  project,
  rootNodeId: "framework",
  scopeNodeId: "framework",
  scopeLabel: "GraphCode Workspace",
  nodes: [moduleWeb],
  edges: [],
  boundaries: [frontendBoundary],
  dependencies: [],
  io: [],
  processes: [],
    formats: [],
    basicDetails: [],
    extensionDetails: [],
    customTypes: [],
    nodeTypeStyles: [],
    reuses: []
};

const moduleCanvasGraph: CanvasGraph = {
  project,
  rootNodeId: "module-web",
  scopeNodeId: "module-web",
  scopeLabel: "Web Workspace",
  nodes: [inputSelection, processWeb, moduleCanvas, functionRenderWidget, outputWorkspace, formatSelection],
  edges: [
    {
      id: "flow-input-process",
      projectId: project.id,
      kind: "flows",
      sourceNodeId: "input-user-select",
      targetNodeId: "process-web",
      label: "selection",
      codeContext: "Selection flows from the hierarchy tree into the render process.",
      color: "#059669",
      animated: true,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      source: { path: null, startLine: null, endLine: null },
      createdAt: "now"
    },
    {
      id: "format-selection-edge",
      projectId: project.id,
      kind: "describes_format",
      sourceNodeId: "input-user-select",
      targetNodeId: "format-selection",
      label: "format",
      codeContext: "The input node describes the selection id format.",
      color: "#ca8a04",
      animated: false,
      pointingEnabled: false,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      source: { path: null, startLine: null, endLine: null },
      createdAt: "now"
    }
  ],
  boundaries: [moduleBoundary],
  dependencies: [],
  io: [
    {
      nodeId: "input-user-select",
      ioKind: "user",
      channel: "left hierarchy tree",
      schemaHint: "node id",
      notes: ""
    },
    {
      nodeId: "output-workspace",
      ioKind: "artifact",
      channel: "React state",
      schemaHint: "selected detail",
      notes: ""
    }
  ],
  processes: [
    {
      nodeId: "process-web",
      processKind: "render",
      trigger: "selected scope changes",
      notes: ""
    }
  ],
  formats: [
    {
      nodeId: "format-selection",
      formatKind: "type",
      spec: "string node id",
      example: "module-web",
      notes: ""
    }
    ],
    basicDetails: [],
    extensionDetails: [],
    customTypes: [],
    nodeTypeStyles: [],
    reuses: []
};

const functionCanvasGraph: CanvasGraph = {
  project,
  rootNodeId: "function-render-widget",
  scopeNodeId: "function-render-widget",
  scopeLabel: "renderWidget",
  nodes: [functionRenderWidget, functionInput, functionProcess, functionOutput, functionFormat],
  edges: [
    {
      id: "function-flow-input-process",
      projectId: project.id,
      kind: "flows",
      sourceNodeId: functionInput.id,
      targetNodeId: functionProcess.id,
      label: "parameter",
      codeContext: "props flows into renderWidget.",
      color: "#059669",
      animated: true,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      source: { path: null, startLine: null, endLine: null },
      createdAt: "now"
    },
    {
      id: "function-flow-process-output",
      projectId: project.id,
      kind: "flows",
      sourceNodeId: functionProcess.id,
      targetNodeId: functionOutput.id,
      label: "return",
      codeContext: "renderWidget returns JSX.",
      color: "#059669",
      animated: true,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      source: { path: null, startLine: null, endLine: null },
      createdAt: "now"
    },
    {
      id: "function-format-output",
      projectId: project.id,
      kind: "describes_format",
      sourceNodeId: functionOutput.id,
      targetNodeId: functionFormat.id,
      label: "format",
      codeContext: "The function output is JSX.",
      color: "#ca8a04",
      animated: false,
      pointingEnabled: true,
      pointingDirection: "source_to_target",
      agentStatus: "none",
      gitStatus: null,
      tags: [],
      source: { path: null, startLine: null, endLine: null },
      createdAt: "now"
    }
  ],
  boundaries: [],
  dependencies: [],
  io: [
    {
      nodeId: functionInput.id,
      ioKind: "user",
      channel: "function parameter",
      schemaHint: "WidgetProps",
      notes: ""
    },
    {
      nodeId: functionOutput.id,
      ioKind: "artifact",
      channel: "return value",
      schemaHint: "JSX.Element",
      notes: ""
    }
  ],
  processes: [
    {
      nodeId: functionProcess.id,
      processKind: "render",
      trigger: "function call",
      notes: ""
    }
  ],
  formats: [
    {
      nodeId: functionFormat.id,
      formatKind: "type",
      spec: "JSX.Element",
      example: null,
      notes: ""
    }
    ],
    basicDetails: [],
    extensionDetails: [],
    customTypes: [],
    nodeTypeStyles: [],
    reuses: []
};

const frameworkDetail = detail(framework);
const moduleDetail = detail(moduleWeb, {
  processes: [{ node: processWeb, details: moduleCanvasGraph.processes[0] }],
  inputs: [{ node: inputSelection, details: moduleCanvasGraph.io[0] }],
  outputs: [{ node: outputWorkspace, details: moduleCanvasGraph.io[1] }]
});
const functionDetail = detail(functionRenderWidget, {
  processes: [{ node: functionProcess, details: functionCanvasGraph.processes[0] }],
  inputs: [{ node: functionInput, details: functionCanvasGraph.io[0] }],
  outputs: [{ node: functionOutput, details: functionCanvasGraph.io[1] }],
  formats: [{ node: functionFormat, details: functionCanvasGraph.formats[0] }]
});

const defaultSettings = {
  general: { theme: "system" },
  github: {
    enabled: false,
    repository: "",
    clientId: "",
    auth: {
      connected: false,
      username: null,
      tokenConfigured: false,
      scopes: [],
      connectedAt: null,
      lastValidatedAt: null
    }
  },
  automation: { autoReviewAfterCoding: true },
  extensions: {
    availablePackages: AVAILABLE_EXTENSION_PACKAGES,
    enabledPackageIds: [],
    configs: {}
  },
  agents: ["planning", "review", "scanning"].map((agentKind) => ({
    agentKind,
    provider: "fake",
    model: "fake",
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: agentKind === "scanning" ? 8 : 4,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `${agentKind} prompt` },
    apiKeyConfigured: false,
    systemPromptConfigured: true
  })),
    codingAgents: ["small", "medium", "large"].map((mode) => ({
      mode,
    provider: "fake",
    model: `fake-${mode}`,
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: mode === "large" ? 8 : mode === "medium" ? 4 : 2,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `${mode} coding prompt` },
      apiKeyConfigured: false,
      systemPromptConfigured: true
    })),
    reviewAgents: ["small", "medium", "large"].map((mode) => ({
      mode,
      provider: "fake",
      model: `fake-review-${mode}`,
      cliCommand: "",
      reasoningEffort: "medium",
      speedTier: "standard",
      permissionMode: "ask_for_permission",
      codexSystemPromptMode: "custom",
      claudeSystemPromptMode: "custom",
      parallelLimit: mode === "large" ? 4 : mode === "medium" ? 2 : 1,
      apiKeySource: { type: "env", value: "" },
      systemPromptSource: { type: "manual", value: `${mode} review prompt` },
      apiKeyConfigured: false,
      systemPromptConfigured: true
    })),
    scanningAgents: ["local", "medium", "global"].map((mode) => ({
    mode,
    provider: "fake",
    model: `fake-${mode}`,
    cliCommand: "",
    reasoningEffort: "medium",
    speedTier: "standard",
    permissionMode: "ask_for_permission",
    codexSystemPromptMode: "custom",
    claudeSystemPromptMode: "custom",
    parallelLimit: mode === "local" ? 8 : 1,
    apiKeySource: { type: "env", value: "" },
    systemPromptSource: { type: "manual", value: `${mode} scanning prompt` },
    apiKeyConfigured: false,
    systemPromptConfigured: true
  }))
};

function settingsViewFromMutation(input: any) {
  return {
    ...defaultSettings,
    general: input.general ?? defaultSettings.general,
    github: {
      ...defaultSettings.github,
      ...(input.github ?? {}),
      auth: defaultSettings.github.auth
    },
    automation: input.automation ?? defaultSettings.automation,
    extensions: input.extensions ?? defaultSettings.extensions,
    agents: defaultSettings.agents.map((agent) => {
      const next = input.agents?.find((item: { agentKind: string }) => item.agentKind === agent.agentKind);
      return {
        ...agent,
        ...(next ?? {}),
        apiKeyConfigured: Boolean(next?.apiKeySource?.value) || agent.apiKeyConfigured,
        systemPromptConfigured: Boolean(next?.systemPromptSource?.value) || agent.systemPromptConfigured
      };
    }),
      codingAgents: defaultSettings.codingAgents.map((agent) => {
        const next = input.codingAgents?.find((item: { mode: string }) => item.mode === agent.mode);
      return {
        ...agent,
        ...(next ?? {}),
        apiKeyConfigured: Boolean(next?.apiKeySource?.value) || agent.apiKeyConfigured,
          systemPromptConfigured: Boolean(next?.systemPromptSource?.value) || agent.systemPromptConfigured
        };
      }),
      reviewAgents: defaultSettings.reviewAgents.map((agent) => {
        const next = input.reviewAgents?.find((item: { mode: string }) => item.mode === agent.mode);
        return {
          ...agent,
          ...(next ?? {}),
          apiKeyConfigured: Boolean(next?.apiKeySource?.value) || agent.apiKeyConfigured,
          systemPromptConfigured: Boolean(next?.systemPromptSource?.value) || agent.systemPromptConfigured
        };
      }),
      scanningAgents: defaultSettings.scanningAgents.map((agent) => {
      const next = input.scanningAgents?.find((item: { mode: string }) => item.mode === agent.mode);
      return {
        ...agent,
        ...(next ?? {}),
        apiKeyConfigured: Boolean(next?.apiKeySource?.value) || agent.apiKeyConfigured,
        systemPromptConfigured: Boolean(next?.systemPromptSource?.value) || agent.systemPromptConfigured
      };
    })
  };
}

describe("GraphCode app shell", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        reactFlowMock.fitView.mockClear();
        reactFlowMock.setCenter.mockClear();
        reactFlowMock.setViewport.mockClear();
        window.localStorage.clear();
        rememberExplicitProjectSession();
        document.documentElement.dataset.theme = "system";
      const agentRuns: AgentRun[] = [];
      let planningRunCount = 0;
      const workflowResponse = {
        id: "workflow-1",
        projectId: project.id,
        scopeNodeId: "module-web",
        scopeName: "Web Workspace",
        status: "preview",
        currentLayer: 0,
        summary: "1 coding item planned under Web Workspace.",
        createdAt: "now",
        updatedAt: "now",
        items: [
          {
            id: "workflow-item-1",
            workflowId: "workflow-1",
            projectId: project.id,
            nodeId: "function-render-widget",
            nodeName: "renderWidget",
            nodeKind: "function",
            layerIndex: 0,
            recommendedMode: "small",
            selectedMode: "small",
            modeReason: "Leaf-local block.",
            status: "pending",
            conflictGroup: "apps/web/src/App.tsx:function-render-widget",
            agentRunId: null,
            proposalId: null,
            appliedAt: null,
            createdAt: "now",
            updatedAt: "now"
          }
        ]
      };
      vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/projects") {
          return json([project]);
        }
        if (url === "/api/system/pick-folder") {
          return json({
            supported: false,
            selected: false,
            path: null,
            message: "Native folder picker is unavailable in this test."
          });
        }
        if (url === "/api/projects/graphcode-self/hierarchy") {
          return json(hierarchy);
        }
        if (url === "/api/v2/projects/graphcode-self/index-state") {
          return json({
            projectId: "graphcode-self",
            providerId: "current-parser",
            indexRevision: "revision-1",
            workspaceRevision: "revision-1",
            generatedAt: new Date().toISOString(),
            completeness: { status: "complete" },
            counts: { discovered: 12, supported: 10, indexed: 10, unsupported: 2, excluded: 0, failed: 0 },
            progress: { phase: "complete", completed: 10, total: 10, message: "Complete", updatedAt: new Date().toISOString() },
            telemetry: { discoveryMs: 1, parseMs: 2, linkMs: 1, persistMs: 1, peakRssBytes: 1024 }
          });
        }
        if (url.startsWith("/api/projects/graphcode-self/canvas")) {
          if (url.includes("rootNodeId=function-render-widget")) {
            return json(functionCanvasGraph);
          }
          return json(url.includes("rootNodeId=module-web") ? moduleCanvasGraph : frameworkCanvas);
        }
        if (url === "/api/projects/graphcode-self/settings") {
          if (init?.method === "PUT") {
            const payload = JSON.parse(String(init.body ?? "{}"));
            return json({
              settings: settingsViewFromMutation(payload),
              validation: { ok: true, testedAt: "now", fieldErrors: {} }
            });
          }
          return json(defaultSettings);
        }
        if (url === "/api/codex/status") {
          return json({
            installed: true,
            command: "codex",
            resolvedPath: "/usr/local/bin/codex",
            version: "codex-test",
            authenticated: true,
            authStatus: "Authenticated",
            modelsAvailable: true,
            error: null,
            checkedAt: "now"
          });
        }
        if (url === "/api/codex/models") {
          return json([
            {
              slug: "gpt-test",
              displayName: "GPT Test",
              description: "Test Codex model",
              defaultReasoningLevel: "medium",
              supportedReasoningLevels: [{ effort: "medium", description: "Balanced" }],
              speedTiers: ["standard", "fast"]
            }
          ]);
        }
        if (url === "/api/claude/status") {
          return json({
            installed: true,
            command: "claude",
            resolvedPath: "/usr/local/bin/claude",
            version: "claude-test",
            authenticated: true,
            authStatus: "Authenticated",
            modelsAvailable: true,
            error: null,
            checkedAt: "now"
          });
        }
        if (url === "/api/claude/models") {
          return json([
            {
              slug: "sonnet",
              displayName: "Sonnet",
              description: "Claude Sonnet alias",
              defaultReasoningLevel: "medium",
              supportedReasoningLevels: [{ effort: "medium", description: "Balanced" }],
              speedTiers: ["standard"]
            },
            {
              slug: "opus",
              displayName: "Opus",
              description: "Claude Opus alias",
              defaultReasoningLevel: "high",
              supportedReasoningLevels: [{ effort: "high", description: "Deep" }],
              speedTiers: ["standard", "fast"]
            }
          ]);
        }
        if (url === "/api/projects/graphcode-self/agent-runs") {
          return json(agentRuns);
        }
        if (url.startsWith("/api/projects/graphcode-self/agent-runs/") && url.endsWith("/apply-graph-patch")) {
          const runId = url.split("/").at(-2);
          const index = agentRuns.findIndex((run) => run.id === runId);
          if (index === -1) {
            return new Response("not found", { status: 404 });
          }
          const existing = agentRuns[index];
          const updated =
            existing.id === "run-plan-2"
              ? {
                  ...existing,
                  status: "conflicted" as const,
                  conflictReason: "node module-web changed after this ticket started."
                }
              : {
                  ...existing,
                  appliedGraphRevision: 9
                };
          agentRuns[index] = updated;
          return json(updated);
        }
        if (url === "/api/projects/graphcode-self/git-status") {
          return json({ status: "" });
        }
        if (url === "/api/workspaces/open") {
          const payload = JSON.parse(String(init?.body ?? "{}"));
          if (!payload.createIfMissing) {
            return json(
              {
                status: payload.rootPath.includes("empty-graphcode") ? "empty_graphcode" : "missing_graphcode",
                rootPath: payload.rootPath,
                graphcodePath: `${payload.rootPath}/.graphcode`,
                message: payload.rootPath.includes("empty-graphcode") ? "This .graphcode workspace is empty." : "This directory does not contain a .graphcode workspace."
              },
              409
            );
          }
          return json({
            status: "created",
            graphcodePath: `${payload.rootPath}/.graphcode`,
            project: {
              ...project,
              name: payload.initialization?.projectName ?? "Created Workspace",
              rootPath: payload.rootPath,
              description: payload.initialization?.projectDescription ?? "",
              scanningInstructions: payload.initialization?.scanningInstructions ?? ""
            }
          });
        }
        if (url === "/api/projects/graphcode-self/github/device/start") {
          return json({
            deviceCode: "device-code",
            userCode: "ABCD-EFGH",
            verificationUri: "https://github.com/login/device",
            expiresIn: 900,
            interval: 5,
            message: "Enter code"
          });
        }
        if (url === "/api/projects/graphcode-self/github/device/poll") {
          return json({
            status: "connected",
            message: "GitHub connected.",
            settings: {
              ...defaultSettings,
              github: {
                ...defaultSettings.github,
                enabled: true,
                repository: "owner/repo",
                clientId: "client-id",
                auth: {
                  connected: true,
                  username: "octocat",
                  tokenConfigured: true,
                  scopes: ["repo", "read:user"],
                  connectedAt: "now",
                  lastValidatedAt: "now"
                }
              }
            }
          });
        }
          if (url === "/api/projects/graphcode-self/github/disconnect") {
            return json(defaultSettings);
          }
          if (url === "/api/coding-workflows/preview") {
            return json(workflowResponse);
          }
          if (url === "/api/coding-workflows/start") {
            const payload = JSON.parse(String(init?.body ?? "{}"));
            const overrides = new Map((payload.modeOverrides ?? []).map((item: { nodeId: string; mode: string }) => [item.nodeId, item.mode]));
            return json({
              ...workflowResponse,
              status: "blocked",
              items: workflowResponse.items.map((item) => ({
                ...item,
                selectedMode: overrides.get(item.nodeId) ?? item.selectedMode,
                status: "proposed",
                agentRunId: "run-coding-workflow",
                proposalId: "proposal-coding-workflow"
              }))
            });
          }
          if (url === "/api/coding-workflows/apply-layer") {
            return json({
              ...workflowResponse,
              status: "succeeded",
              items: workflowResponse.items.map((item) => ({ ...item, status: "applied", appliedAt: "now" }))
            });
          }
          if (url === "/api/projects/graphcode-self/coding-workflows/workflow-1") {
            return json(workflowResponse);
          }
          if (url === "/api/agents/planning" || url === "/api/agents/coding" || url === "/api/agents/review" || url === "/api/agents/scanning") {
          const payload = JSON.parse(String(init?.body ?? "{}"));
          const agentKind = url.split("/").at(-1)?.replace("review", "review") ?? "planning";
          const id = url === "/api/agents/planning" ? `run-plan-${++planningRunCount}` : `run-${agentKind}`;
          const run: AgentRun = {
            id,
            projectId: payload.projectId ?? project.id,
              agentKind: agentKind as AgentRun["agentKind"],
              codingMode: url === "/api/agents/coding" ? payload.mode ?? "medium" : null,
              reviewMode: url === "/api/agents/review" ? payload.mode ?? "medium" : null,
              status: "succeeded",
            baseGraphRevision: 7,
            appliedGraphRevision: null,
            conflictReason: null,
            targetNodeId: payload.nodeId ?? payload.scopeNodeId ?? null,
            prompt: payload.prompt ?? "",
            response: "Agent completed",
            diff: "diff --git",
            graphPatch:
              url === "/api/agents/planning"
                ? {
                    summary: "Plan graph patch",
                    operations: [{ entityType: "node", entityId: "module-web", action: "update", fields: { summary: payload.prompt ?? "" } }]
                  }
                : null,
            error: null,
            createdAt: "now",
            updatedAt: "now"
          };
          agentRuns.unshift(run);
          return json(run);
        }
        if (url === "/api/projects/graphcode-self/layout/auto") {
          return json({ ...moduleCanvasGraph, nodes: moduleCanvasGraph.nodes.map((item) => ({ ...item, position: { x: item.position.x + 10, y: item.position.y + 10 } })) });
        }
        if (url === "/api/projects/graphcode-self/custom-node-types" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            id: "custom-type-created",
            projectId: project.id,
            name: payload.name,
            description: payload.description ?? "",
            color: payload.color ?? "#475569",
            icon: payload.icon ?? "square",
            createdAt: "now",
            updatedAt: "now"
          });
        }
        if (url === "/api/projects/graphcode-self/nodes" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json(node({ id: "created-block", kind: payload.kind ?? "framework", name: payload.name ?? "Created Block", customTypeId: payload.customTypeId ?? null }));
        }
        if (url === "/api/projects/graphcode-self/edges" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            id: "created-edge",
            projectId: project.id,
            color: payload.color ?? "#059669",
            animated: payload.animated ?? false,
            pointingEnabled: payload.pointingEnabled ?? true,
            pointingDirection: payload.pointingDirection ?? "source_to_target",
            agentStatus: "none",
            gitStatus: null,
            tags: [],
            createdAt: "now",
            ...payload
          });
        }
        if (url.startsWith("/api/nodes/") && url.endsWith("/tags") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            ...moduleWeb,
            tags: payload.tags.map((tag: { name: string; color?: string }, index: number) => ({
              id: `tag-node-${index}`,
              projectId: project.id,
              name: tag.name,
              color: tag.color ?? "#64748b",
              createdAt: "now",
              updatedAt: "now"
            }))
          });
        }
        if (url.startsWith("/api/edges/") && url.endsWith("/tags") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            ...moduleCanvasGraph.edges[0],
            tags: payload.tags.map((tag: { name: string; color?: string }, index: number) => ({
              id: `tag-edge-${index}`,
              projectId: project.id,
              name: tag.name,
              color: tag.color ?? "#64748b",
              createdAt: "now",
              updatedAt: "now"
            }))
          });
        }
        if (url.startsWith("/api/boundaries/") && url.endsWith("/tags") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            ...moduleBoundary,
            tags: payload.tags.map((tag: { name: string; color?: string }, index: number) => ({
              id: `tag-boundary-${index}`,
              projectId: project.id,
              name: tag.name,
              color: tag.color ?? "#64748b",
              createdAt: "now",
              updatedAt: "now"
            }))
          });
        }
        if (url.startsWith("/api/edges/") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            ...moduleCanvasGraph.edges[0],
            ...payload
          });
        }
        if (url.startsWith("/api/edges/") && init?.method === "DELETE") {
          return json({ ok: true });
        }
        if (url === "/api/projects/graphcode-self/boundaries" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json(
            boundary({
              id: "created-boundary",
              scopeNodeId: payload.scopeNodeId,
              name: payload.name,
              summary: payload.summary,
              codeContext: payload.codeContext,
              position: payload.position,
              size: payload.size,
              memberNodeIds: ["input-user-select", "process-web"]
            })
          );
        }
        if (url.startsWith("/api/boundaries/") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            ...moduleBoundary,
            ...payload
          });
        }
        if (url.startsWith("/api/boundaries/") && init?.method === "DELETE") {
          return json({ ok: true });
        }
        if (url.startsWith("/api/projects/graphcode-self/node-type-styles/") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            projectId: project.id,
            nodeKind: url.split("/").at(-1),
            color: payload.color,
            createdAt: "now",
            updatedAt: "now"
          });
        }
        if (url.startsWith("/api/custom-node-types/") && init?.method === "PATCH") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            id: url.split("/").at(-1),
            projectId: project.id,
            name: "Custom",
            description: "",
            color: payload.color,
            icon: "square",
            createdAt: "now",
            updatedAt: "now"
          });
        }
        if (url === "/api/nodes/framework") {
          return json(frameworkDetail);
        }
        if (url === "/api/nodes/module-web") {
          return json(moduleDetail);
        }
        if (url === "/api/nodes/function-render-widget") {
          return json(functionDetail);
        }
        if (url.endsWith("/layout") && init?.method === "PATCH") {
          return json(moduleWeb);
        }
        if (url === "/api/dev/seed-self") {
          return json(project);
        }
        return new Response("not found", { status: 404 });
      })
    );
  });

  it("renders only the next layer for the framework canvas", async () => {
    render(<App />);

    const canvas = within(await screen.findByTestId("react-flow"));
    expect(await canvas.findByText("Web Workspace")).toBeInTheDocument();
    expect(canvas.queryByText("GraphCode Workspace")).not.toBeInTheDocument();
    expect(screen.getByText("Index complete · 10/12")).toBeInTheDocument();
  });

  it("shows boundary groups and member labels in the hierarchy", async () => {
    render(<App />);

    const hierarchyPanel = within(screen.getByLabelText("Project hierarchy"));
    expect((await hierarchyPanel.findAllByText("Frontend")).length).toBeGreaterThanOrEqual(1);
    expect(hierarchyPanel.getByText("Web Flow")).toBeInTheDocument();
    expect(hierarchyPanel.getByText("1 blocks")).toBeInTheDocument();
  });

  it("adjusts the structure panel width from the splitter", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    const splitter = screen.getByRole("separator", { name: "Resize structure panel" });
    expect(splitter).toHaveAttribute("aria-valuenow", "318");

    fireEvent.keyDown(splitter, { key: "ArrowRight" });

    expect(splitter).toHaveAttribute("aria-valuenow", "334");
  });

  it("single-clicking a block inspects it without opening its subgraph", async () => {
    render(<App />);

    fireEvent.click(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));

    await waitFor(() => expect(screen.getAllByText("Client app.").length).toBeGreaterThan(0));
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("rootNodeId=module-web"), expect.any(Object));
  });

  it("saves block label tags from the inspector", async () => {
    render(<App />);

    fireEvent.click(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    const inspector = within(screen.getByLabelText("Node inspector"));
    await inspector.findByRole("heading", { name: "Web Workspace" });
    const tagInput = await inspector.findByLabelText("Tags label tags");
    fireEvent.input(tagInput, { target: { value: "frontend, ui" } });
    await waitFor(() => expect(tagInput).toHaveValue("frontend, ui"));
    fireEvent.click(screen.getByText("Save tags"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/nodes/module-web/tags",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            tags: [
              { name: "frontend" },
              { name: "ui" }
            ]
          })
        })
      );
    });
  });

  it("double-clicking a block with children opens its subgraph", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));

    expect(await within(screen.getByTestId("react-flow")).findByText("Render Workspace Scope")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("rootNodeId=module-web"), expect.any(Object));
  });

  it("double-clicking a leaf function opens its workflow canvas", async () => {
    render(<App />);

    const canvas = within(await screen.findByTestId("react-flow"));
    fireEvent.doubleClick(await canvas.findByText("Web Workspace"));
    fireEvent.doubleClick(await within(screen.getByTestId("react-flow")).findByText("renderWidget"));

    const functionCanvas = within(await screen.findByTestId("react-flow"));
    expect(await functionCanvas.findByText("props")).toBeInTheDocument();
    expect(await functionCanvas.findByText("Process renderWidget")).toBeInTheDocument();
    expect(await functionCanvas.findByText("Rendered JSX")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("rootNodeId=function-render-widget"), expect.any(Object));
  });

  it("persists drag and resize layout edits", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(await screen.findByLabelText("Drag Web Workspace"));
    fireEvent.click(await screen.findByLabelText("Resize Web Workspace"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/nodes/module-web/layout",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            scopeNodeId: "framework",
            position: { x: 333, y: 222 },
            size: { width: 320, height: 180 }
          })
        })
      );
    });
  });

  it("reopens the last saved canvas scope during bootstrap", async () => {
    window.localStorage.setItem(
      "graphcode.canvasSession.v1",
      JSON.stringify({
        lastProjectId: project.id,
        lastOpenedProjectId: project.id,
        projects: {
          [project.id]: {
            lastScopeNodeId: "module-web",
            viewports: {}
          }
        }
      })
    );

    render(<App />);

    expect(await within(await screen.findByTestId("react-flow")).findByText("Render Workspace Scope")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("rootNodeId=module-web"), expect.any(Object));
  });

  it("restores and saves the per-scope canvas viewport", async () => {
    window.localStorage.setItem(
      "graphcode.canvasSession.v1",
      JSON.stringify({
        lastProjectId: project.id,
        lastOpenedProjectId: project.id,
        projects: {
          [project.id]: {
            lastScopeNodeId: "framework",
            viewports: {
              framework: { x: 5, y: 6, zoom: 0.7 }
            }
          }
        }
      })
    );

    render(<App />);

    await screen.findByTestId("react-flow");
    await waitFor(() => expect(reactFlowMock.setViewport).toHaveBeenCalledWith({ x: 5, y: 6, zoom: 0.7 }, { duration: 0 }));
    expect(reactFlowMock.fitView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Move viewport"));
    const session = JSON.parse(window.localStorage.getItem("graphcode.canvasSession.v1") ?? "{}");

    expect(session.projects[project.id].viewports.framework).toEqual({ x: 12, y: 34, zoom: 0.8 });
  });

  it("expands rendered boundary boxes around labels and member blocks", async () => {
    render(<App />);

    const boundaryBox = await screen.findByTestId("boundary-boundary-frontend");

    expect(Number(boundaryBox.dataset.height)).toBeGreaterThan(frontendBoundary.size.height);
  });

  it("runs explicit auto-layout for the active scope", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(await screen.findByText("Auto layout"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/layout/auto",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });

  it("requires confirmation before resetting the self workspace from the toolbar", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByLabelText("Reset self workspace"));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("erases local graph edits"));
    expect(fetch).not.toHaveBeenCalledWith("/api/dev/seed-self", expect.anything());
  });

  it("resets the self workspace from the toolbar after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByLabelText("Reset self workspace"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/dev/seed-self",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });

  it("starts with a blank workspace prompt when no project is loaded", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/projects") {
        return json([]);
      }
      return new Response("not found", { status: 404 });
    });

    render(<App />);

    expect(await screen.findByText("Open a workspace to begin")).toBeInTheDocument();
  });

  it("does not auto-open a persisted self project without an explicit browser open marker", async () => {
    window.localStorage.clear();

    render(<App />);

    expect(await screen.findByText("Open a workspace to begin")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/projects", expect.any(Object));
    expect(fetch).not.toHaveBeenCalledWith("/api/projects/graphcode-self/hierarchy", expect.any(Object));
  });

  it("collects first-run scanning context before creating a missing workspace", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByText("Open workspace"));
    fireEvent.change(screen.getByLabelText("Directory"), { target: { value: "/tmp/new-graphcode-project" } });
    fireEvent.click(screen.getByText("Open"));

    expect(await screen.findByText("Initialize Workspace")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Project name")).toHaveValue("new-graphcode-project"));

    fireEvent.click(screen.getByText("Create and scan"));
    expect(await screen.findByText("Project name, description, and scanning instructions are required to scan.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Project description"), {
      target: { value: "A local project with a CLI, API server, and web UI." }
    });
    fireEvent.change(screen.getByLabelText("Scanning instructions"), {
      target: { value: "Group by runtime boundary and emphasize request/data flow." }
    });
    fireEvent.click(screen.getByText("Create and scan"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/workspaces/open",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            rootPath: "/tmp/new-graphcode-project",
            createIfMissing: true,
            initialization: {
              projectName: "new-graphcode-project",
              projectDescription: "A local project with a CLI, API server, and web UI.",
              scanningInstructions: "Group by runtime boundary and emphasize request/data flow.",
              skipCodexDefaultSystemPrompt: false
            },
            creationMode: "scan"
          })
        })
      );
    });
    expect(await screen.findByText("new-graphcode-project")).toBeInTheDocument();
  });

  it("can create a blank workspace when .graphcode is empty", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByText("Open workspace"));
    fireEvent.change(screen.getByLabelText("Directory"), { target: { value: "/tmp/empty-graphcode-project" } });
    fireEvent.click(screen.getByText("Open"));

    expect(await screen.findByText("Initialize Workspace")).toBeInTheDocument();
    expect(await screen.findByText(".graphcode is empty.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Project name")).toHaveValue("empty-graphcode-project"));

    fireEvent.click(screen.getByText("Create blank"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/workspaces/open",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            rootPath: "/tmp/empty-graphcode-project",
            createIfMissing: true,
            initialization: {
              projectName: "empty-graphcode-project",
              projectDescription: ""
            },
            creationMode: "blank"
          })
        })
      );
    });
  });

  it("posts a new block from the add block dialog", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Block"));
    expect(screen.getByRole("option", { name: "Website" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "UI Component" })).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Created Block" } });
    fireEvent.click(screen.getByText("Add block"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/nodes",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });

  it("posts the selected custom icon when creating a custom block type", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Block"));
    fireEvent.change(await screen.findByLabelText("Type"), { target: { value: "custom" } });
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Custom Runtime" } });
    fireEvent.change(await screen.findByLabelText("New Type Name"), { target: { value: "Experiment Type" } });
    fireEvent.click(screen.getByRole("button", { name: "Use Experiment icon" }));
    fireEvent.click(screen.getByText("Add block"));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const customTypeCall = calls.find(([url]) => url === "/api/projects/graphcode-self/custom-node-types");
      expect(customTypeCall).toBeTruthy();
      expect(JSON.parse(String(customTypeCall?.[1]?.body))).toMatchObject({
        name: "Experiment Type",
        icon: "flask-conical"
      });

      const nodeCall = calls.find(([url]) => url === "/api/projects/graphcode-self/nodes");
      expect(nodeCall).toBeTruthy();
      expect(JSON.parse(String(nodeCall?.[1]?.body))).toMatchObject({
        kind: "custom",
        name: "Custom Runtime",
        customTypeId: "custom-type-created"
      });
    });
  });

  it("opens add submenu entries for blocks, edges, and boundaries", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByText("Add"));

    expect(screen.getByText("Block")).toBeInTheDocument();
    expect(screen.getByText("Edge")).toBeInTheDocument();
    expect(screen.getByText("Boundary")).toBeInTheDocument();
  });

  it("draws an edge on the canvas before opening the edge editor", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Edge"));
    await screen.findByText("Select source block");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-pan-on-drag", "false");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-nodes-draggable", "false");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-nodes-connectable", "false");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-connect-on-click", "false");
    expect(screen.getByTestId("react-flow").className).toContain("workspace-flow-draw-edge");
    fireEvent.click(within(screen.getByTestId("react-flow")).getByText("Hierarchy Selection"));
    await screen.findByText("Select target block");
    fireEvent.click(within(screen.getByTestId("react-flow")).getByText("Render Workspace Scope"));
    fireEvent.change(await screen.findByLabelText("Short Description"), { target: { value: "render input" } });
    fireEvent.change(screen.getByLabelText("Code Context"), { target: { value: "Canvas-drawn edge context." } });
    fireEvent.click(screen.getByText("Add edge"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/edges",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });

  it("moves boundary member blocks with the boundary", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(await screen.findByLabelText("Drag Web Flow"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/nodes/input-user-select/layout",
        expect.objectContaining({
          method: "PATCH"
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/nodes/process-web/layout",
        expect.objectContaining({
          method: "PATCH"
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/boundaries/boundary-web-flow",
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });
  });

  it("selects and edits an edge with description and code context", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(await screen.findByLabelText("Select edge selection"));

    expect(await screen.findByText("Selection flows from the hierarchy tree into the render process.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(await screen.findByLabelText("Short Description"), { target: { value: "render input" } });
    fireEvent.change(screen.getByLabelText("Code Context"), { target: { value: "Updated edge context from the UI." } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/flow-input-process",
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });
  });

  it("updates edge style from the details panel", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(await screen.findByLabelText("Select edge selection"));
    fireEvent.change(await screen.findByLabelText("Color"), { target: { value: "#111827" } });
    fireEvent.click(screen.getByLabelText("Animated"));
    fireEvent.change(screen.getByLabelText("Pointing Direction"), { target: { value: "target_to_source" } });
    fireEvent.click(screen.getByLabelText("Pointing"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/flow-input-process",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ color: "#111827" })
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/flow-input-process",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ animated: false })
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/flow-input-process",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ pointingDirection: "target_to_source" })
        })
      );
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/flow-input-process",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ pointingEnabled: false })
        })
      );
    });
  });

  it("updates block type color from the details panel", async () => {
    render(<App />);

    fireEvent.click(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.change(await screen.findByLabelText("Block Type Color"), { target: { value: "#047857" } });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/node-type-styles/module",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ color: "#047857" })
        })
      );
    });
  });

  it("draws and saves a boundary with description and code context", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Boundary"));
    await screen.findByText("Click to start boundary");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-pan-on-drag", "false");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-nodes-draggable", "false");
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-elements-selectable", "false");
    expect(screen.getByTestId("react-flow").className).toContain("workspace-flow-draw-boundary");
    fireEvent.click(screen.getByLabelText("Start boundary"));
    await screen.findByText("Click to finish boundary");
    fireEvent.click(screen.getByLabelText("Preview boundary"));
    const draftBoundary = await screen.findByTestId("boundary-boundary-draft");
    expect(draftBoundary).toHaveAttribute("data-width", "200");
    expect(draftBoundary).toHaveAttribute("data-height", "140");
    fireEvent.click(screen.getByLabelText("Finish boundary"));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Frontend Flow" } });
    fireEvent.change(screen.getByLabelText("Short Description"), { target: { value: "Selection modules" } });
    fireEvent.change(screen.getByLabelText("Code Context"), { target: { value: "Boundary context for frontend flow modules." } });
    fireEvent.click(screen.getByText("Add boundary"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/boundaries",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });

  it("cancels boundary and edge draw modes from the canvas hint", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Edge"));
    await screen.findByText("Select source block");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Select source block")).not.toBeInTheDocument());
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-pan-on-drag", "true");
    expect(screen.getByTestId("react-flow").className).not.toContain("workspace-flow-draw-edge");

    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Boundary"));
    await screen.findByText("Click to start boundary");
    fireEvent.click(screen.getByLabelText("Start boundary"));
    fireEvent.click(screen.getByLabelText("Preview boundary"));
    await screen.findByTestId("boundary-boundary-draft");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByTestId("boundary-boundary-draft")).not.toBeInTheDocument());
    expect(screen.queryByText("Click to finish boundary")).not.toBeInTheDocument();
    expect(screen.getByTestId("react-flow")).toHaveAttribute("data-pan-on-drag", "true");
    expect(screen.getByTestId("react-flow").className).not.toContain("workspace-flow-draw-boundary");
  });

  it("submits parallel planning tickets and shows apply and conflict states", async () => {
    render(<App />);

    const tablist = await screen.findByRole("tablist", { name: /Details panel mode/i });
    fireEvent.click(within(tablist).getByRole("button", { name: /Planning/i }));
    fireEvent.change(await screen.findByPlaceholderText("Plan graph changes"), {
      target: { value: "Add cache node" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));
    fireEvent.change(screen.getByPlaceholderText("Plan graph changes"), {
      target: { value: "Add queue node" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => {
      const planningCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/agents/planning");
      expect(planningCalls).toHaveLength(2);
      expect(planningCalls.every(([, init]) => JSON.parse(String(init?.body ?? "{}")).background === true)).toBe(true);
    });

    expect(await screen.findByText("Add cache node")).toBeInTheDocument();
    expect(await screen.findByText("Add queue node")).toBeInTheDocument();

    const applyButtons = await screen.findAllByRole("button", { name: /Apply/i });
    fireEvent.click(applyButtons[1]);
    expect(await screen.findByText("Applied")).toBeInTheDocument();

    fireEvent.click((await screen.findAllByRole("button", { name: /Apply/i }))[0]);
    expect(await screen.findByText("node module-web changed after this ticket started.")).toBeInTheDocument();
    expect(await screen.findByText("Conflicted")).toBeInTheDocument();
  });

  it("previews a layered coding workflow for upper-scope code actions", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("Web Workspace"));
    expect((await screen.findAllByText("Client app.")).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole("button", { name: /Start code/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/coding-workflows/preview",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"scopeNodeId":"module-web"')
        })
      );
    });
    expect(await screen.findByText("Layered coding")).toBeInTheDocument();
    expect((await screen.findAllByText("renderWidget")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByDisplayValue("Small"), { target: { value: "large" } });
    fireEvent.click(screen.getByRole("button", { name: /Start workflow/i }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/coding-workflows/start",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"mode":"large"')
        })
      );
    });
    fireEvent.click(await screen.findByRole("button", { name: /Apply layer/i }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/coding-workflows/apply-layer",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"workflowId":"workflow-1"')
        })
      );
    });
  });

  it("starts a small direct coding run for leaf function actions", async () => {
    render(<App />);

    fireEvent.click(await screen.findByText("renderWidget"));
    fireEvent.click(await screen.findByRole("button", { name: /Start code/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/agents/coding",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"mode":"small"')
        })
      );
    });
  });

  it("opens settings and saves validated agent settings", async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText("Settings"));
      expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Agents/i }));
      expect(screen.getByRole("heading", { name: "Planning" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Review Small" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Review Medium" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Review Large" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Scanning Local" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scanning Medium" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Scanning Global" })).toBeInTheDocument();
    expect(screen.getAllByText("Environment Variable Name")[0]).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText("API Key Source")[0], { target: { value: "file" } });
    const keyFile = new File(["OPENAI_API_KEY=abc123"], "key.env", { type: "text/plain" });
    fireEvent.change(screen.getAllByLabelText("Select Key File")[0], { target: { files: [keyFile] } });
    expect(await screen.findByText("API key read successfully")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Extensions/i }));
    expect(screen.getByRole("heading", { name: "ML Pipeline" })).toBeInTheDocument();
    const mlPipelineEnabled = within(screen.getByRole("heading", { name: "ML Pipeline" }).closest(".agent-settings-card") as HTMLElement).getByLabelText("Enabled");
    fireEvent.click(mlPipelineEnabled);
    expect(mlPipelineEnabled).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /GitHub/i }));
    expect(screen.getByText("Not Connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/i }));
    expect(await screen.findByText("ABCD-EFGH")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /I Authorized/i }));
    expect(await screen.findByText(/GitHub connected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/settings",
        expect.objectContaining({
          method: "PUT"
        })
      );
    });
      const settingsCall = vi
        .mocked(fetch)
        .mock.calls.find(([url, init]) => url === "/api/projects/graphcode-self/settings" && init?.method === "PUT");
      expect(JSON.parse(String(settingsCall?.[1]?.body)).reviewAgents.map((agent: { mode: string }) => agent.mode).sort()).toEqual(["large", "medium", "small"]);
      expect(JSON.parse(String(settingsCall?.[1]?.body)).scanningAgents.map((agent: { mode: string }) => agent.mode).sort()).toEqual(["global", "local", "medium"]);
      expect(JSON.parse(String(settingsCall?.[1]?.body)).extensions.enabledPackageIds).toEqual(["@graphcode/extension-ml-pipeline"]);
    });

  it("shows account-based CLI providers without API key entry", async () => {
    render(<App />);

    fireEvent.click(await screen.findByLabelText("Settings"));
    fireEvent.click(await screen.findByRole("button", { name: /Agents/i }));
    const planningCard = screen.getByRole("heading", { name: "Planning" }).closest(".agent-settings-card") as HTMLElement;
    const providerSelect = within(planningCard).getByLabelText("Provider");

    fireEvent.change(providerSelect, { target: { value: "codex" } });

    await waitFor(() => expect(within(planningCard).getByText("Codex Model")).toBeInTheDocument());
    const codexModelSelect = within(within(planningCard).getByText("Codex Model").closest("label") as HTMLElement).getByRole("combobox");
    expect(codexModelSelect).toHaveValue("gpt-test");
    expect(within(planningCard).getByLabelText("Reasoning Effort")).toBeInTheDocument();
    expect(within(planningCard).getByLabelText("Speed")).toBeInTheDocument();
    expect(within(planningCard).getByLabelText("Permission Mode")).toHaveValue("ask_for_permission");
    expect(within(planningCard).getByLabelText("System Prompt")).toHaveValue("default");
    expect(within(planningCard).queryByLabelText("API Key Source")).not.toBeInTheDocument();

    fireEvent.change(providerSelect, { target: { value: "claudecode" } });

    await waitFor(() => expect(within(planningCard).getByText("Claude Model")).toBeInTheDocument());
    const claudeModelSelect = within(within(planningCard).getByText("Claude Model").closest("label") as HTMLElement).getByRole("combobox");
    expect(claudeModelSelect).toHaveValue("sonnet");
    expect(within(within(planningCard).getByText("CLI Command").closest("label") as HTMLElement).getByRole("textbox")).toHaveValue("claude");
    expect(within(planningCard).getByLabelText("Reasoning Effort")).toHaveValue("medium");
    expect(within(planningCard).getByLabelText("Speed")).toHaveValue("standard");
    expect(within(planningCard).getByLabelText("Permission Mode")).toHaveValue("ask_for_permission");
    expect(within(planningCard).getByLabelText("System Prompt")).toHaveValue("default");
    expect(within(planningCard).queryByLabelText("API Key Source")).not.toBeInTheDocument();
  });

  it("shows scanning runs in the activity feed", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(screen.getByRole("button", { name: /^Scan$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/agents/scanning",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
    const tablist = await screen.findByRole("tablist", { name: /Details panel mode/i });
    fireEvent.click(within(tablist).getByRole("button", { name: /Planning/i }));
    expect(await screen.findByText("Scanning")).toBeInTheDocument();
    expect(screen.getByText("Agent completed")).toBeInTheDocument();
  });

  it("updates the canvas background when Night theme is saved", async () => {
    render(<App />);

    expect(await screen.findByTestId("background")).toHaveAttribute("data-color", "#d4d7dd");

    fireEvent.click(await screen.findByLabelText("Settings"));
    fireEvent.change(await screen.findByLabelText("Display Theme"), { target: { value: "dark" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(screen.getByTestId("background")).toHaveAttribute("data-color", "#334155");
      expect(screen.getByTestId("react-flow")).toHaveAttribute("data-color-mode", "dark");
    });
  });

  it("uses ctrl+z to undo the last created edge", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Edge"));
    await screen.findByText("Select source block");
    fireEvent.click(within(screen.getByTestId("react-flow")).getByText("Hierarchy Selection"));
    await screen.findByText("Select target block");
    fireEvent.click(within(screen.getByTestId("react-flow")).getByText("Render Workspace Scope"));
    fireEvent.change(await screen.findByLabelText("Short Description"), { target: { value: "render input" } });
    fireEvent.click(screen.getByText("Add edge"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/graphcode-self/edges",
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    await waitFor(() => expect(screen.getByLabelText("Undo")).toBeEnabled());
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/edges/created-edge",
        expect.objectContaining({
          method: "DELETE"
        })
      );
    });
  });
});

type TestNodeInput = Partial<GraphNode> & {
  id: string;
  kind: GraphNode["kind"];
  name: string;
  sourcePath?: string | null;
};

function node(input: TestNodeInput): GraphNode {
  return {
    id: input.id,
    projectId: input.projectId ?? project.id,
    kind: input.kind,
    name: input.name,
    summary: input.summary ?? `${input.name} summary.`,
    parentId: input.parentId ?? null,
    attachedToId: input.attachedToId ?? null,
    source: {
      path: input.source?.path ?? input.sourcePath ?? null,
      startLine: input.source?.startLine ?? null,
      endLine: input.source?.endLine ?? null
    },
      code: input.code ?? {
        context: input.summary ?? `${input.name} code context.`,
        directory: input.source?.path ?? input.sourcePath ?? null,
        startLine: input.source?.startLine ?? null,
        endLine: input.source?.endLine ?? null,
        language: "typescript"
      },
      execution: input.execution ?? {
        testScriptDirectory: null,
        virtualEnvironment: null,
        workingDirectory: null,
        setupCommand: null,
        testCommand: null
      },
      position: input.position ?? { x: 0, y: 0 },
    size: input.size ?? { width: 224, height: 120 },
    customTypeId: input.customTypeId ?? null,
    childCount: input.childCount ?? 0,
    hasChildren: input.hasChildren ?? (input.childCount ?? 0) > 0,
    agentStatus: input.agentStatus ?? "none",
    gitStatus: input.gitStatus ?? null,
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? "now",
    updatedAt: input.updatedAt ?? "now"
  };
}

function detail(baseNode: GraphNode, overrides: Partial<NodeDetail> = {}): NodeDetail {
  return {
    node: baseNode,
    childCount: baseNode.childCount,
    hasChildren: baseNode.hasChildren,
    dependencies: [],
    inputs: [],
    outputs: [],
    processes: [],
      formats: [],
      basicDetails: [],
      extensionDetails: [],
      incomingEdges: [],
    outgoingEdges: [],
    relatedNodes: [],
    reusedIn: [],
    ...overrides
  };
}

function boundary(input: Partial<GraphBoundary> & { id: string; scopeNodeId: string; name: string }): GraphBoundary {
  const memberNodeIds = input.memberNodeIds ?? [];
  return {
    id: input.id,
    projectId: input.projectId ?? project.id,
    scopeNodeId: input.scopeNodeId,
    name: input.name,
    summary: input.summary ?? `${input.name} summary.`,
    codeContext: input.codeContext ?? `${input.name} code context.`,
    color: input.color ?? "#2563eb",
    position: input.position ?? { x: 0, y: 0 },
    size: input.size ?? { width: 260, height: 160 },
    memberNodeIds,
    memberCount: input.memberCount ?? memberNodeIds.length,
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? "now",
    updatedAt: input.updatedAt ?? "now"
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
