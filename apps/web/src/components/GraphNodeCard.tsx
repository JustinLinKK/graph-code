import type { CustomBlockType, GraphNode, GraphNodeReuse } from "@graphcode/graph-model";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { agentStatusLabel, gitChangeLabel, gitWorktreeLabel } from "../displayLabels";
import { iconForCustomBlockType } from "../customBlockIcons";
import { nodePalette } from "../graphStyles";
import { iconForNodeKind } from "../nodeIcons";

export type GraphNodeCardData = {
  node: GraphNode;
  accentColor: string;
  customType?: CustomBlockType | null;
  reuse?: GraphNodeReuse;
  selected: boolean;
  onResizeEnd?: (nodeId: string, size: { width: number; height: number }) => void;
};

export function GraphNodeCard({ data, selected }: NodeProps) {
  const cardData = data as unknown as GraphNodeCardData;
  const { node } = cardData;
  const isSelected = selected || cardData.selected;
  const Icon = node.kind === "custom" ? iconForCustomBlockType(cardData.customType?.icon) : iconForNodeKind(node.kind);
  const palette = nodePalette[node.kind];
  const accentColor = cardData.accentColor;
  const typeLabel = node.kind === "custom" ? cardData.customType?.name ?? palette.label : palette.label;
  const tags = node.tags ?? [];

  return (
    <div className={`graph-node-card ${palette.className} ${isSelected ? "selected" : ""}`} style={{ borderLeftColor: accentColor }}>
      <NodeResizer
        isVisible={isSelected}
        minWidth={node.kind === "format" ? 96 : 150}
        minHeight={node.kind === "format" ? 64 : 92}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
        onResizeEnd={(_, params) => cardData.onResizeEnd?.(node.id, { width: params.width, height: params.height })}
      />
      <Handle type="target" position={Position.Left} />
      <div className="node-card-topline">
        <span className="node-card-icon" style={{ color: accentColor, backgroundColor: `color-mix(in srgb, ${accentColor} 14%, white)` }}>
          <Icon size={16} />
        </span>
        <span>{typeLabel}</span>
      </div>
      <div className="node-card-name">{node.name}</div>
      <p>{node.summary}</p>
      {node.agentStatus !== "none" || node.gitStatus ? (
        <div className="node-status-row">
          {node.agentStatus !== "none" ? <span className={`status-chip ${node.agentStatus}`}>{agentStatusLabel(node.agentStatus)}</span> : null}
          {node.gitStatus ? <span className={`git-chip worktree-${node.gitStatus.worktree}`}>{gitWorktreeLabel(node.gitStatus.worktree)}</span> : null}
          {node.gitStatus?.change ? <span className={`git-chip change-${node.gitStatus.change}`}>{gitChangeLabel(node.gitStatus.change)}</span> : null}
        </div>
      ) : null}
      {cardData.reuse || tags.length > 0 ? (
        <div className="node-card-tags">
          {cardData.reuse ? <span className="reuse-chip">{cardData.reuse.label || "Reused"}</span> : null}
          {tags.slice(0, 2).map((tag) => (
            <span className="node-tag-chip" key={tag.id} style={{ color: tag.color, borderColor: tag.color }}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
