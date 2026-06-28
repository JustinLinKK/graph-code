import type { CanvasGraph, GraphBoundary, GraphEdge, GraphNode, HierarchyNode, NodeDetail, Project } from "@graphcode/graph-model";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@xyflow/react", async () => ({
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
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
    onMouseDown,
    onMouseMove,
    onMouseUp,
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
    onMouseDown?: (event: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onMouseMove?: (event: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    onMouseUp?: (event: { clientX: number; clientY: number; preventDefault: () => void }) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="react-flow">
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
            <>
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
            </>
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
          onMouseDown?.({ clientX: 10, clientY: 20, preventDefault });
          onMouseMove?.({ clientX: 210, clientY: 160, preventDefault });
          onMouseUp?.({ clientX: 210, clientY: 160, preventDefault });
        }}
      />
      <button
        type="button"
        aria-label="Draw edge gesture"
        onClick={() => onConnect?.({ source: "input-user-select", target: "process-web" })}
      />
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({
    fitView: vi.fn(),
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    setCenter: vi.fn()
  })
}));

const project: Project = {
  id: "graphcode-self",
  name: "graph-code",
  rootPath: "/home/justin/graph-code",
  createdAt: "now",
  updatedAt: "now"
};

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
        children: [{ ...moduleCanvas, children: [], boundaryLabels: [], boundaryGroups: [] }]
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
  customTypes: [],
  nodeTypeStyles: [],
  reuses: []
};

const moduleCanvasGraph: CanvasGraph = {
  project,
  rootNodeId: "module-web",
  scopeNodeId: "module-web",
  scopeLabel: "Web Workspace",
  nodes: [inputSelection, processWeb, moduleCanvas, outputWorkspace, formatSelection],
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
      tags: [],
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
      tags: [],
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

describe("GraphCode app shell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/projects") {
          return json([project]);
        }
        if (url === "/api/projects/graphcode-self/hierarchy") {
          return json(hierarchy);
        }
        if (url.startsWith("/api/projects/graphcode-self/canvas")) {
          return json(url.includes("rootNodeId=module-web") ? moduleCanvasGraph : frameworkCanvas);
        }
        if (url === "/api/projects/graphcode-self/layout/auto") {
          return json({ ...moduleCanvasGraph, nodes: moduleCanvasGraph.nodes.map((item) => ({ ...item, position: { x: item.position.x + 10, y: item.position.y + 10 } })) });
        }
        if (url === "/api/projects/graphcode-self/nodes" && init?.method === "POST") {
          return json(node({ id: "created-block", kind: "framework", name: "Created Block" }));
        }
        if (url === "/api/projects/graphcode-self/edges" && init?.method === "POST") {
          const payload = JSON.parse(String(init.body ?? "{}"));
          return json({
            id: "created-edge",
            projectId: project.id,
            color: payload.color ?? "#059669",
            animated: payload.animated ?? false,
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

  it("persists drag and resize layout edits", async () => {
    render(<App />);

    await screen.findByTestId("react-flow");
    fireEvent.click(await screen.findByLabelText("Drag Web Workspace"));
    fireEvent.click(await screen.findByLabelText("Resize Web Workspace"));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/nodes/module-web/layout",
        expect.objectContaining({
          method: "PATCH"
        })
      );
    });
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

  it("resets the self workspace from the toolbar", async () => {
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
    await screen.findByText("Draw edge");
    fireEvent.click(screen.getByLabelText("Draw edge gesture"));
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
    await screen.findByText("Draw boundary");
    fireEvent.click(screen.getByLabelText("Draw boundary gesture"));
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

  it("uses ctrl+z to undo the last created edge", async () => {
    render(<App />);

    fireEvent.doubleClick(await within(await screen.findByTestId("react-flow")).findByText("Web Workspace"));
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(await screen.findByText("Edge"));
    await screen.findByText("Draw edge");
    fireEvent.click(screen.getByLabelText("Draw edge gesture"));
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
    position: input.position ?? { x: 0, y: 0 },
    size: input.size ?? { width: 224, height: 120 },
    customTypeId: input.customTypeId ?? null,
    childCount: input.childCount ?? 0,
    hasChildren: input.hasChildren ?? (input.childCount ?? 0) > 0,
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
