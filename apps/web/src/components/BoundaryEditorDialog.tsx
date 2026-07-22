import type { BoundaryMutation, BoundaryUpdate, GraphBoundary } from "@graphcode/graph-model";
import { Button } from "@heroui/react";
import { Boxes, Save, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

export type BoundaryDraft = {
  scopeNodeId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

type BoundaryEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  boundary: GraphBoundary | null;
  draft: BoundaryDraft | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (boundary: BoundaryMutation | BoundaryUpdate) => void;
};

export function BoundaryEditorDialog({ open, mode, boundary, draft, loading, error, onClose, onSave }: BoundaryEditorDialogProps) {
  const initialPosition = boundary?.position ?? draft?.position ?? { x: 0, y: 0 };
  const initialSize = boundary?.size ?? draft?.size ?? { width: 260, height: 160 };
  const [name, setName] = useState(boundary?.name ?? "");
  const [summary, setSummary] = useState(boundary?.summary ?? "");
  const [codeContext, setCodeContext] = useState(boundary?.codeContext ?? "");
  const [x, setX] = useState(String(Math.round(initialPosition.x)));
  const [y, setY] = useState(String(Math.round(initialPosition.y)));
  const [width, setWidth] = useState(String(Math.round(initialSize.width)));
  const [height, setHeight] = useState(String(Math.round(initialSize.height)));

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextPosition = boundary?.position ?? draft?.position ?? { x: 0, y: 0 };
    const nextSize = boundary?.size ?? draft?.size ?? { width: 260, height: 160 };
    setName(boundary?.name ?? "");
    setSummary(boundary?.summary ?? "");
    setCodeContext(boundary?.codeContext ?? "");
    setX(String(Math.round(nextPosition.x)));
    setY(String(Math.round(nextPosition.y)));
    setWidth(String(Math.round(nextSize.width)));
    setHeight(String(Math.round(nextSize.height)));
  }, [boundary, draft, open]);

  if (!open) {
    return null;
  }

  const scopeNodeId = boundary?.scopeNodeId ?? draft?.scopeNodeId ?? "";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({
      scopeNodeId,
      name: name.trim(),
      summary: summary.trim(),
      codeContext: codeContext.trim(),
      position: {
        x: parseCanvasNumber(x),
        y: parseCanvasNumber(y)
      },
      size: {
        width: Math.max(24, parseCanvasNumber(width)),
        height: Math.max(24, parseCanvasNumber(height))
      }
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="boundary-editor-dialog-title" onSubmit={submit}>
        <div className="dialog-title">
          <div>
            <h2 id="boundary-editor-dialog-title">{mode === "create" ? "Add Boundary" : "Edit Boundary"}</h2>
            <p>Boundaries group visible blocks by canvas box and store description, context, and membership.</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close boundary editor" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <label className="form-field">
          <span>Name</span>
          <input required value={name} placeholder="Frontend" onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="form-field">
          <span>Short Description</span>
          <input value={summary} placeholder="Quick grouping label for the canvas" onChange={(event) => setSummary(event.target.value)} />
        </label>

        <label className="form-field">
          <span>Code Context</span>
          <textarea
            rows={5}
            value={codeContext}
            placeholder="What belongs inside this boundary and what an agent should understand before changing it"
            onChange={(event) => setCodeContext(event.target.value)}
          />
        </label>

        <div className="form-grid">
          <label className="form-field">
            <span>X</span>
            <input inputMode="numeric" value={x} onChange={(event) => setX(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Y</span>
            <input inputMode="numeric" value={y} onChange={(event) => setY(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Width</span>
            <input inputMode="numeric" value={width} onChange={(event) => setWidth(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Height</span>
            <input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} />
          </label>
        </div>

        {error ? <div className="error-strip" role="alert">{error}</div> : null}

        <div className="dialog-actions">
          <Button type="submit" variant="primary" isDisabled={loading || !scopeNodeId}>
            {mode === "create" ? <Boxes size={16} /> : <Save size={16} />}
            {mode === "create" ? "Add boundary" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function parseCanvasNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
