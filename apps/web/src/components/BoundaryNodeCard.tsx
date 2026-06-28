import type { GraphBoundary } from "@graphcode/graph-model";
import { NodeResizer, type NodeProps } from "@xyflow/react";

export type BoundaryNodeCardData = {
  boundary: GraphBoundary;
  selected: boolean;
  onResizeEnd?: (boundaryId: string, size: { width: number; height: number }) => void;
};

export function BoundaryNodeCard({ data, selected }: NodeProps) {
  const cardData = data as unknown as BoundaryNodeCardData;
  const { boundary } = cardData;
  const isSelected = selected || cardData.selected;

  return (
    <div className={`boundary-node-card ${isSelected ? "selected" : ""}`} style={{ borderColor: boundary.color, color: boundary.color }}>
      <NodeResizer
        isVisible={isSelected}
        minWidth={140}
        minHeight={92}
        lineClassName="boundary-resizer-line"
        handleClassName="boundary-resizer-handle"
        onResizeEnd={(_, params) => cardData.onResizeEnd?.(boundary.id, { width: params.width, height: params.height })}
      />
      <div className="boundary-node-title">{boundary.name}</div>
      {boundary.summary ? <p>{boundary.summary}</p> : null}
      <span>{boundary.memberCount} blocks</span>
    </div>
  );
}
