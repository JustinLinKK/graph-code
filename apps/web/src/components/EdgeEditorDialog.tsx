import {
  GRAPH_EDGE_KINDS,
  type CanvasGraph,
  type EdgeMutation,
  type EdgeUpdate,
  type GraphEdge,
  type GraphEdgeKind
} from "@graphcode/graph-model";
import { Button } from "@heroui/react";
import { GitBranch, Save, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type EdgeEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  edge: GraphEdge | null;
  draft: { sourceNodeId: string; targetNodeId: string } | null;
  canvas: CanvasGraph | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (edge: EdgeMutation | EdgeUpdate) => void;
};

export function EdgeEditorDialog({ open, mode, edge, draft, canvas, loading, error, onClose, onSave }: EdgeEditorDialogProps) {
  const firstNodeId = canvas?.nodes[0]?.id ?? "";
  const secondNodeId = canvas?.nodes[1]?.id ?? firstNodeId;
  const [kind, setKind] = useState<GraphEdgeKind>(edge?.kind ?? "uses");
  const [sourceNodeId, setSourceNodeId] = useState(edge?.sourceNodeId ?? draft?.sourceNodeId ?? firstNodeId);
  const [targetNodeId, setTargetNodeId] = useState(edge?.targetNodeId ?? draft?.targetNodeId ?? secondNodeId);
  const [label, setLabel] = useState(edge?.label ?? "");
  const [codeContext, setCodeContext] = useState(edge?.codeContext ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setKind(edge?.kind ?? "uses");
    setSourceNodeId(edge?.sourceNodeId ?? draft?.sourceNodeId ?? firstNodeId);
    setTargetNodeId(edge?.targetNodeId ?? draft?.targetNodeId ?? secondNodeId);
    setLabel(edge?.label ?? "");
    setCodeContext(edge?.codeContext ?? "");
  }, [draft?.sourceNodeId, draft?.targetNodeId, edge, firstNodeId, open, secondNodeId]);

  if (!open) {
    return null;
  }

  const nodes = canvas?.nodes ?? [];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      kind,
      sourceNodeId,
      targetNodeId,
      label: label.trim() || null,
      codeContext: codeContext.trim()
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog" onSubmit={submit}>
        <div className="dialog-title">
          <div>
            <h2>{mode === "create" ? "Add Edge" : "Edit Edge"}</h2>
            <p>Use the description for the visible link label and code context for implementation detail.</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close edge editor" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Source Block</span>
            <select required value={sourceNodeId} onChange={(event) => setSourceNodeId(event.target.value)}>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Target Block</span>
            <select required value={targetNodeId} onChange={(event) => setTargetNodeId(event.target.value)}>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-field">
          <span>Edge Kind</span>
          <select value={kind} onChange={(event) => setKind(event.target.value as GraphEdgeKind)}>
            {GRAPH_EDGE_KINDS.map((edgeKind) => (
              <option key={edgeKind} value={edgeKind}>
                {edgeKind}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Short Description</span>
          <input value={label} placeholder="Visible edge label" onChange={(event) => setLabel(event.target.value)} />
        </label>

        <label className="form-field">
          <span>Code Context</span>
          <textarea
            rows={5}
            value={codeContext}
            placeholder="What this relationship means, what contract crosses it, and what an agent should preserve"
            onChange={(event) => setCodeContext(event.target.value)}
          />
        </label>

        {error ? <div className="error-strip">{error}</div> : null}

        <div className="dialog-actions">
          <Button type="submit" variant="primary" isDisabled={loading || nodes.length < 2 || sourceNodeId === targetNodeId}>
            {mode === "create" ? <GitBranch size={16} /> : <Save size={16} />}
            {mode === "create" ? "Add edge" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
