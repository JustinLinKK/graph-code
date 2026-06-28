import type { GraphNodeKind, HierarchyBoundaryGroup, HierarchyNode, NodeTypeStyle } from "@graphcode/graph-model";
import { Box, Boxes, Braces, ChevronDown, ChevronRight, FolderTree, Globe2, LayoutDashboard, Maximize2, PanelsTopLeft } from "lucide-react";
import { useState } from "react";
import { nodePalette } from "../graphStyles";

type HierarchyTreeProps = {
  nodes: HierarchyNode[];
  selectedNodeId: string | null;
  selectedBoundaryId: string | null;
  nodeTypeStyles: NodeTypeStyle[];
  onSelectNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onSelectBoundary: (scopeNodeId: string, boundaryId: string) => void;
};

export function HierarchyTree({ nodes, selectedNodeId, selectedBoundaryId, nodeTypeStyles, onSelectNode, onOpenNode, onSelectBoundary }: HierarchyTreeProps) {
  if (nodes.length === 0) {
    return <div className="empty-state">No matching structure</div>;
  }

  return (
    <div className="hierarchy-tree">
      {nodes.map((node) => (
        <HierarchyItem
          key={node.id}
          node={node}
          depth={0}
          selectedNodeId={selectedNodeId}
          selectedBoundaryId={selectedBoundaryId}
          nodeTypeStyles={nodeTypeStyles}
          onSelectNode={onSelectNode}
          onOpenNode={onOpenNode}
          onSelectBoundary={onSelectBoundary}
        />
      ))}
    </div>
  );
}

type HierarchyItemProps = {
  node: HierarchyNode;
  depth: number;
  selectedNodeId: string | null;
  selectedBoundaryId: string | null;
  nodeTypeStyles: NodeTypeStyle[];
  onSelectNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onSelectBoundary: (scopeNodeId: string, boundaryId: string) => void;
};

function HierarchyItem({ node, depth, selectedNodeId, selectedBoundaryId, nodeTypeStyles, onSelectNode, onOpenNode, onSelectBoundary }: HierarchyItemProps) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0 || node.boundaryGroups.length > 0;
  const canOpenScope = hasChildren || node.kind === "function" || node.kind === "object";
  const Icon = iconForKind(node.kind);
  const selected = selectedNodeId === node.id;
  const accentColor = nodeTypeStyles.find((style) => style.nodeKind === node.kind)?.color ?? nodePalette[node.kind].accent;

  return (
    <div className="tree-item">
      <div className={`tree-row ${selected ? "selected" : ""}`} style={{ paddingLeft: 10 + depth * 18 }}>
        <button
          type="button"
          className="tree-toggle"
          aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
          onClick={() => setOpen((value) => !value)}
          disabled={!hasChildren}
        >
          {hasChildren ? open ? <ChevronDown size={15} /> : <ChevronRight size={15} /> : <span />}
        </button>
        <button type="button" className="tree-label" onClick={() => onSelectNode(node.id)} onDoubleClick={() => canOpenScope && onOpenNode(node.id)}>
          <span className={`tree-icon ${nodePalette[node.kind].className}`} style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 14%, white)` }}>
            <Icon size={15} />
          </span>
          <span className="tree-text">
            <span className="tree-name-line">
              <span>{node.name}</span>
              {node.boundaryLabels.map((label) => (
                <span className="boundary-chip" style={{ borderColor: label.color, color: label.color }} key={label.id}>
                  {label.name}
                </span>
              ))}
            </span>
            <small>{nodePalette[node.kind].label}</small>
          </span>
        </button>
        {canOpenScope ? (
          <button type="button" className="tree-open" aria-label={`Open ${node.name} subgraph`} onClick={() => onOpenNode(node.id)}>
            <Maximize2 size={14} />
          </button>
        ) : null}
      </div>
      {open && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <HierarchyItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              selectedBoundaryId={selectedBoundaryId}
              nodeTypeStyles={nodeTypeStyles}
              onSelectNode={onSelectNode}
              onOpenNode={onOpenNode}
              onSelectBoundary={onSelectBoundary}
            />
          ))}
          {node.boundaryGroups.map((boundary) => (
            <BoundaryGroupRow
              key={boundary.id}
              boundary={boundary}
              depth={depth + 1}
              selected={selectedBoundaryId === boundary.id}
              onSelectBoundary={onSelectBoundary}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoundaryGroupRow({
  boundary,
  depth,
  selected,
  onSelectBoundary
}: {
  boundary: HierarchyBoundaryGroup;
  depth: number;
  selected: boolean;
  onSelectBoundary: (scopeNodeId: string, boundaryId: string) => void;
}) {
  return (
    <div className={`tree-row boundary-tree-row ${selected ? "selected" : ""}`} style={{ paddingLeft: 10 + depth * 18 }}>
      <span className="tree-toggle" />
      <button type="button" className="tree-label" onClick={() => onSelectBoundary(boundary.scopeNodeId, boundary.id)}>
        <span className="tree-icon boundary-tree-icon" style={{ color: boundary.color, backgroundColor: `color-mix(in srgb, ${boundary.color} 12%, white)` }}>
          <Boxes size={15} />
        </span>
        <span className="tree-text">
          <span>{boundary.name}</span>
          <small>{boundary.memberNodeIds.length} blocks</small>
        </span>
      </button>
    </div>
  );
}

function iconForKind(kind: GraphNodeKind) {
  switch (kind) {
    case "framework":
      return LayoutDashboard;
    case "module":
      return FolderTree;
    case "website":
      return Globe2;
    case "ui_component":
      return PanelsTopLeft;
    case "function":
      return Braces;
    case "object":
      return Box;
    default:
      return FolderTree;
  }
}
