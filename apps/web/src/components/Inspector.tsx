import {
  CODING_AGENT_MODES,
  type AgentStatus,
  type CodingAgentMode,
  type CustomBlockType,
  type EdgePointingDirection,
  type GitStatusInfo,
  type GraphBoundary,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type GraphTag,
  type NodeDetail,
  type NodeTypeStyle,
  type TagAssignment
} from "@graphcode/graph-model";
import { Button } from "@heroui/react";
import { Boxes, Code2, Database, FileInput, FileOutput, FileType, GitBranch, Link2, Package, Palette, Pencil, Play, Route, Tags, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { agentStatusLabel, codingAgentModeLabel, gitChangeLabel, gitWorktreeLabel } from "../displayLabels";
import { nodePalette } from "../graphStyles";

type InspectorProps = {
  detail: NodeDetail | null;
  selectedEdge: GraphEdge | null;
  selectedBoundary: GraphBoundary | null;
  canvasNodes: GraphNode[];
  customTypes: CustomBlockType[];
  nodeTypeStyles: NodeTypeStyle[];
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
  agentBusy: boolean;
  onStartCode: (nodeId: string, mode: CodingAgentMode) => void;
};

export function Inspector({
  detail,
  selectedEdge,
  selectedBoundary,
  canvasNodes,
  customTypes,
  nodeTypeStyles,
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
  agentBusy,
  onStartCode
}: InspectorProps) {
  const [codingMode, setCodingMode] = useState<CodingAgentMode>("medium");
  const [codingModeTouched, setCodingModeTouched] = useState(false);
  const recommendedCodingMode = useMemo(() => recommendInspectorCodingMode(detail, canvasNodes), [canvasNodes, detail]);
  const selectedCodingMode = codingModeTouched ? codingMode : recommendedCodingMode;

  useEffect(() => {
    setCodingMode(recommendedCodingMode);
    setCodingModeTouched(false);
  }, [recommendedCodingMode, detail?.node.id]);

  if (selectedEdge) {
    const source = canvasNodes.find((node) => node.id === selectedEdge.sourceNodeId);
    const target = canvasNodes.find((node) => node.id === selectedEdge.targetNodeId);
    return (
      <div className="inspector">
        <div className="inspector-title">
          <span className="inspector-kind relationship-kind">EDGE</span>
          <Button size="sm" variant="ghost" className="inspector-edit" onPress={() => onEditEdge(selectedEdge.id)}>
            <Pencil size={14} />
            Edit
          </Button>
          <h2>{selectedEdge.label || selectedEdge.kind}</h2>
          <p>{selectedEdge.label || "No short description yet."}</p>
        </div>

        <section className="inspector-section">
          <h3>
            <GitBranch size={15} />
            Relationship
          </h3>
          <div className="source-box">
            <span>{selectedEdge.kind}</span>
            <small>{source?.name ?? selectedEdge.sourceNodeId}</small>
            <small>{target?.name ?? selectedEdge.targetNodeId}</small>
          </div>
        </section>

        <StatusSection agentStatus={selectedEdge.agentStatus} gitStatus={selectedEdge.gitStatus} />

        <section className="inspector-section">
          <h3>
            <Palette size={15} />
            Style
          </h3>
          <div className="style-controls">
            <label>
              <span>Color</span>
              <input type="color" value={selectedEdge.color} onChange={(event) => onUpdateEdgeStyle(selectedEdge.id, { color: event.target.value })} />
            </label>
            <label className="inline-control">
              <input
                type="checkbox"
                checked={selectedEdge.animated}
                onChange={(event) => onUpdateEdgeStyle(selectedEdge.id, { animated: event.target.checked })}
              />
              <span>Animated</span>
            </label>
            <label className="inline-control">
              <input
                type="checkbox"
                checked={selectedEdge.pointingEnabled}
                onChange={(event) => onUpdateEdgeStyle(selectedEdge.id, { pointingEnabled: event.target.checked })}
              />
              <span>Pointing</span>
            </label>
            <label>
              <span>Pointing Direction</span>
              <select
                disabled={!selectedEdge.pointingEnabled}
                value={selectedEdge.pointingDirection}
                onChange={(event) => onUpdateEdgeStyle(selectedEdge.id, { pointingDirection: event.target.value as EdgePointingDirection })}
              >
                <option value="source_to_target">Source to Target</option>
                <option value="target_to_source">Target to Source</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </label>
          </div>
        </section>

        <TagEditor title="Tags" tags={selectedEdge.tags ?? []} onSave={(input) => onUpdateEdgeTags(selectedEdge.id, input)} />

        <section className="inspector-section">
          <h3>
            <Code2 size={15} />
            Code Context
          </h3>
          {selectedEdge.codeContext ? <p className="context-box">{selectedEdge.codeContext}</p> : <p className="muted">No edge code context yet.</p>}
        </section>
      </div>
    );
  }

  if (selectedBoundary) {
    const members = selectedBoundary.memberNodeIds.map((nodeId) => canvasNodes.find((node) => node.id === nodeId)).filter(Boolean) as GraphNode[];
    return (
      <div className="inspector">
        <div className="inspector-title">
          <span className="inspector-kind boundary-kind">BOUNDARY</span>
          <Button size="sm" variant="ghost" className="inspector-edit" onPress={() => onEditBoundary(selectedBoundary.id)}>
            <Pencil size={14} />
            Edit
          </Button>
          <h2>{selectedBoundary.name}</h2>
          <p>{selectedBoundary.summary || "No short description yet."}</p>
        </div>

        <section className="inspector-section">
          <h3>
            <Boxes size={15} />
            Membership
          </h3>
          <div className="relationship-grid">
            <div>
              <strong>{selectedBoundary.memberCount}</strong>
              <span>Blocks</span>
            </div>
            <div>
              <strong>{Math.round(selectedBoundary.size.width)}</strong>
              <span>Width</span>
            </div>
            <div>
              <strong>{Math.round(selectedBoundary.size.height)}</strong>
              <span>Height</span>
            </div>
          </div>
          {members.length > 0 ? (
            <div className="detail-list boundary-member-list">
              {members.map((node) => (
                <div className="detail-row" key={node.id}>
                  <Boxes size={15} />
                  <div>
                    <span>{node.name}</span>
                    <small>{node.kind}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No blocks currently inside this boundary.</p>
          )}
        </section>

        <section className="inspector-section">
          <h3>
            <Palette size={15} />
            Style
          </h3>
          <div className="style-controls">
            <label>
              <span>Color</span>
              <input type="color" value={selectedBoundary.color} onChange={(event) => onUpdateBoundaryStyle(selectedBoundary.id, event.target.value)} />
            </label>
          </div>
        </section>

        <TagEditor title="Tags" tags={selectedBoundary.tags ?? []} onSave={(input) => onUpdateBoundaryTags(selectedBoundary.id, input)} />

        <section className="inspector-section">
          <h3>
            <Code2 size={15} />
            Code Context
          </h3>
          {selectedBoundary.codeContext ? <p className="context-box">{selectedBoundary.codeContext}</p> : <p className="muted">No boundary code context yet.</p>}
        </section>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="inspector-empty">
        <Route size={28} />
        <h2>Select a block</h2>
        <p>The inspector shows source links, dependencies, boundary I/O, and graph relationships for the selected node.</p>
      </div>
    );
  }

  const { node } = detail;
  const palette = nodePalette[node.kind];
  const customType = node.customTypeId ? customTypes.find((item) => item.id === node.customTypeId) ?? null : null;
  const nodeColor = customType?.color ?? nodeTypeStyles.find((style) => style.nodeKind === node.kind)?.color ?? palette.accent;

  return (
    <div className="inspector">
      <div className="inspector-title">
        <span className={`inspector-kind ${palette.className}`} style={{ color: nodeColor, backgroundColor: `color-mix(in srgb, ${nodeColor} 14%, white)` }}>
          {customType?.name ?? palette.label}
        </span>
        <Button size="sm" variant="ghost" className="inspector-edit" onPress={() => onEditNode(node.id)}>
          <Pencil size={14} />
          Edit
        </Button>
        <h2>{node.name}</h2>
        <p>{node.summary}</p>
      </div>

      <section className="inspector-section">
        <h3>
          <Palette size={15} />
          Style
        </h3>
        <div className="style-controls">
          <label>
            <span>{customType ? "Custom Type Color" : "Block Type Color"}</span>
            <input
              type="color"
              value={nodeColor}
              onChange={(event) =>
                customType ? onUpdateCustomTypeStyle(customType.id, event.target.value) : onUpdateNodeTypeStyle(node.kind, event.target.value)
              }
            />
          </label>
        </div>
      </section>

      <StatusSection agentStatus={node.agentStatus} gitStatus={node.gitStatus} />

      <TagEditor title="Tags" tags={node.tags ?? []} onSave={(input) => onUpdateNodeTags(node.id, input)} />

      {detail.reusedIn.length > 0 ? (
        <section className="inspector-section">
          <h3>
            <Boxes size={15} />
            Reused In
          </h3>
          <div className="detail-list">
            {detail.reusedIn.map((reuse) => (
              <div className="detail-row" key={reuse.id}>
                <Boxes size={15} />
                <div>
                  <span>{reuse.label || reuse.scopeNodeId}</span>
                  <small>{reuse.context || reuse.scopeNodeId}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="inspector-section">
        <h3>
          <Code2 size={15} />
          Code Context
        </h3>
        {node.code.context ? <p className="context-box">{node.code.context}</p> : <p className="muted">No code context yet.</p>}
        <div className="inspector-action-row">
          <span className="mode-control-label">Model selection</span>
          <div className="mode-segmented-control" aria-label="Coding mode">
            {CODING_AGENT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={selectedCodingMode === mode ? "active" : ""}
                aria-pressed={selectedCodingMode === mode}
                onClick={() => {
                  setCodingMode(mode);
                  setCodingModeTouched(true);
                }}
              >
                {codingAgentModeLabel(mode)}
              </button>
            ))}
          </div>
          <Button size="sm" variant="primary" isDisabled={agentBusy} onPress={() => onStartCode(node.id, selectedCodingMode)}>
            <Play size={15} />
            Start code
          </Button>
        </div>
      </section>

      <section className="inspector-section">
        <h3>
          <Link2 size={15} />
          Code Location
        </h3>
        {node.code.directory || node.source.path ? (
          <div className="source-box">
            <span>{node.code.directory ?? node.source.path}</span>
            <small>Language: {node.code.language}</small>
            {node.code.startLine ? <small>Lines {node.code.startLine}-{node.code.endLine ?? node.code.startLine}</small> : null}
          </div>
        ) : (
          <p className="muted">No code directory or line range yet.</p>
        )}
      </section>

      <section className="inspector-section">
        <h3>
          <Package size={15} />
          Basic Blocks
        </h3>
        {detail.dependencies.length + detail.basicDetails.length > 0 ? (
          <div className="detail-list">
            {detail.dependencies.map(({ node: dependencyNode, details }) => (
              <div className="detail-row" key={dependencyNode.id}>
                <Database size={15} />
                <div>
                  <span>{dependencyNode.name}</span>
                  <small>
                    {details.dependencyKind} · {details.spec}
                    {details.version ? ` ${details.version}` : ""}
                  </small>
                </div>
              </div>
            ))}
            {detail.basicDetails.map(({ node: basicNode, details }) => (
              <div className="detail-row" key={basicNode.id}>
                <Database size={15} />
                <div>
                  <span>{basicNode.name}</span>
                  <small>
                    {details.basicKind} · {details.key}
                    {details.valueHint ? ` · ${details.valueHint}` : ""}
                  </small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No attached dependency or basic blocks.</p>
        )}
      </section>

      <section className="inspector-section split">
        <BoundaryList title="Inputs" icon="input" rows={detail.inputs} />
        <BoundaryList title="Outputs" icon="output" rows={detail.outputs} />
      </section>

      <section className="inspector-section split">
        <div>
          <h3>
            <Workflow size={15} />
            Processes
          </h3>
          {detail.processes.length > 0 ? (
            <div className="detail-list">
              {detail.processes.map(({ node: processNode, details }) => (
                <div className="detail-row" key={processNode.id}>
                  <Workflow size={15} />
                  <div>
                    <span>{processNode.name}</span>
                    <small>
                      {details.processKind}
                      {details.trigger ? ` · ${details.trigger}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No process metadata.</p>
          )}
        </div>
        <div>
          <h3>
            <FileType size={15} />
            Formats
          </h3>
          {detail.formats.length > 0 ? (
            <div className="detail-list">
              {detail.formats.map(({ node: formatNode, details }) => (
                <div className="detail-row" key={formatNode.id}>
                  <FileType size={15} />
                  <div>
                    <span>{formatNode.name}</span>
                    <small>
                      {details.formatKind} · {details.spec}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No format metadata.</p>
          )}
        </div>
      </section>

      <section className="inspector-section">
        <h3>
          <GitBranch size={15} />
          Relationships
        </h3>
        <div className="relationship-grid">
          <div>
            <strong>{detail.incomingEdges.length}</strong>
            <span>Incoming</span>
          </div>
          <div>
            <strong>{detail.outgoingEdges.length}</strong>
            <span>Outgoing</span>
          </div>
          <div>
            <strong>{detail.relatedNodes.length}</strong>
            <span>Related</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function recommendInspectorCodingMode(detail: NodeDetail | null, canvasNodes: GraphNode[]): CodingAgentMode {
  if (!detail) {
    return "medium";
  }
  const node = detail.node;
  if ((node.kind === "function" || node.kind === "object") && detail.childCount === 0) {
    return "small";
  }
  if (node.attachedToId && (node.kind === "input" || node.kind === "process" || node.kind === "output" || node.kind === "format")) {
    const owner = canvasNodes.find((candidate) => candidate.id === node.attachedToId);
    const ownerChildren = owner ? canvasNodes.filter((candidate) => candidate.parentId === owner.id) : [];
    if (owner && (owner.kind === "function" || owner.kind === "object") && ownerChildren.length === 0) {
      return "small";
    }
  }
  return "medium";
}

function StatusSection({ agentStatus, gitStatus }: { agentStatus: AgentStatus; gitStatus: GitStatusInfo | null }) {
  return (
    <section className="inspector-section">
      <h3>
        <GitBranch size={15} />
        Status
      </h3>
      <div className="status-detail-grid">
        <div>
          <span>GraphCode</span>
          <strong>{agentStatusLabel(agentStatus)}</strong>
        </div>
        <div>
          <span>Git Worktree</span>
          <strong>{gitStatus ? gitWorktreeLabel(gitStatus.worktree) : "Not Linked"}</strong>
        </div>
        <div>
          <span>Git Change</span>
          <strong>{gitStatus ? gitChangeLabel(gitStatus.change) : "Not Linked"}</strong>
        </div>
      </div>
    </section>
  );
}

function TagEditor({ title, tags, onSave }: { title: string; tags: GraphTag[]; onSave: (input: TagAssignment) => void }) {
  const [draft, setDraft] = useState(tags.map((tag) => tag.name).join(", "));
  const existingColorByName = useMemo(() => new Map(tags.map((tag) => [normalizeTagName(tag.name), tag.color])), [tags]);
  const parsedTags = useMemo(
    () =>
      dedupeTagNames(draft).map((name) => ({
        name,
        color: existingColorByName.get(normalizeTagName(name))
      })),
    [draft, existingColorByName]
  );

  useEffect(() => {
    setDraft(tags.map((tag) => tag.name).join(", "));
  }, [tags]);

  return (
    <section className="inspector-section">
      <h3>
        <Tags size={15} />
        {title}
      </h3>
      {tags.length > 0 ? (
        <div className="tag-chip-list">
          {tags.map((tag) => (
            <span className="tag-chip" key={tag.id} style={{ color: tag.color, borderColor: tag.color }}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">No tags yet.</p>
      )}
      <label className="tag-editor">
        <span>Label Tags</span>
        <input aria-label={`${title} label tags`} value={draft} placeholder="frontend, shared, critical" onChange={(event) => setDraft(event.target.value)} />
      </label>
      <Button size="sm" variant="secondary" onPress={() => onSave({ tags: parsedTags })}>
        Save tags
      </Button>
    </section>
  );
}

function dedupeTagNames(value: string): string[] {
  const names = new Map<string, string>();
  for (const rawPart of value.split(",")) {
    const name = rawPart.trim();
    if (name) {
      names.set(normalizeTagName(name), name);
    }
  }
  return [...names.values()];
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

function BoundaryList({
  title,
  icon,
  rows
}: {
  title: string;
  icon: "input" | "output";
  rows: NodeDetail["inputs"];
}) {
  const Icon = icon === "input" ? FileInput : FileOutput;

  return (
    <div>
      <h3>
        <Icon size={15} />
        {title}
      </h3>
      {rows.length > 0 ? (
        <div className="detail-list">
          {rows.map(({ node, details }) => (
            <div className="detail-row" key={node.id}>
              {icon === "input" ? <FileInput size={15} /> : <FileOutput size={15} />}
              <div>
                <span>{node.name}</span>
                <small>
                  {details.ioKind} · {details.channel}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">None attached.</p>
      )}
    </div>
  );
}
