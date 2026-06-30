import {
  DOMAIN_NODE_KINDS,
  GRAPH_NODE_KINDS,
  LANGUAGE_TYPES,
  extensionNodeDefinitionForKind,
  extensionPackageForNodeKind,
  isExtensionNodeKind,
  type CanvasGraph,
  type CreateCustomBlockType,
  type ExtensionFieldDefinition,
  type CustomBlockType,
  type GraphNode,
  type GraphNodeKind,
  type HierarchyNode,
  type LanguageType,
  type NodeDetail,
  type NodeMutation,
  type NodeUpdate,
  type WorkspaceSettings
} from "@graphcode/graph-model";
import { Button } from "@heroui/react";
import { Plus, Save, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { customBlockIconOptions, defaultCustomBlockIcon } from "../customBlockIcons";
import { nodePalette } from "../graphStyles";

type BlockEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  node: GraphNode | null;
  detail: NodeDetail | null;
  hierarchy: HierarchyNode[];
  canvas: CanvasGraph | null;
  settings: WorkspaceSettings | null;
  selectedNodeId: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    node: NodeMutation | NodeUpdate,
    options?: {
      createCustomType?: CreateCustomBlockType;
    }
  ) => void;
};

export function BlockEditorDialog({ open, mode, node, detail, hierarchy, canvas, settings, selectedNodeId, loading, error, onClose, onSave }: BlockEditorDialogProps) {
  const domainOptions = useMemo(() => flattenHierarchy(hierarchy), [hierarchy]);
  const ownerOptions = useMemo(() => uniqueNodes([...domainOptions, ...(canvas?.nodes ?? [])]), [canvas?.nodes, domainOptions]);
  const defaultOwner = selectedNodeId ?? canvas?.scopeNodeId ?? ownerOptions[0]?.id ?? "";
  const [kind, setKind] = useState<GraphNodeKind>(node?.kind ?? (canvas?.nodes.length ? "module" : "framework"));
  const [name, setName] = useState(node?.name ?? "");
  const [summary, setSummary] = useState(node?.summary ?? "");
  const [codeContext, setCodeContext] = useState(node?.code.context ?? "");
  const [codeDirectory, setCodeDirectory] = useState(node?.code.directory ?? "");
  const [codeStartLine, setCodeStartLine] = useState(node?.code.startLine ? String(node.code.startLine) : "");
  const [codeEndLine, setCodeEndLine] = useState(node?.code.endLine ? String(node.code.endLine) : "");
  const [language, setLanguage] = useState<LanguageType>(node?.code.language ?? "unknown");
  const [testScriptDirectory, setTestScriptDirectory] = useState(node?.execution.testScriptDirectory ?? "");
  const [virtualEnvironment, setVirtualEnvironment] = useState(node?.execution.virtualEnvironment ?? "");
  const [workingDirectory, setWorkingDirectory] = useState(node?.execution.workingDirectory ?? "");
  const [setupCommand, setSetupCommand] = useState(node?.execution.setupCommand ?? "");
  const [testCommand, setTestCommand] = useState(node?.execution.testCommand ?? "");
  const [parentId, setParentId] = useState(node?.parentId ?? canvas?.scopeNodeId ?? domainOptions[0]?.id ?? "");
  const [attachedToId, setAttachedToId] = useState(node?.attachedToId ?? defaultOwner);
  const [customTypeId, setCustomTypeId] = useState(node?.customTypeId ?? canvas?.customTypes[0]?.id ?? "");
  const [newCustomTypeName, setNewCustomTypeName] = useState("");
  const [newCustomTypeColor, setNewCustomTypeColor] = useState("#475569");
  const [newCustomTypeIcon, setNewCustomTypeIcon] = useState(defaultCustomBlockIcon);
  const [extensionPayload, setExtensionPayload] = useState<Record<string, string | number | boolean | null>>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    const nextKind = node?.kind ?? (canvas?.nodes.length ? "module" : "framework");
    setKind(nextKind);
    setName(node?.name ?? "");
    setSummary(node?.summary ?? "");
    setCodeContext(node?.code.context ?? "");
    setCodeDirectory(node?.code.directory ?? "");
    setCodeStartLine(node?.code.startLine ? String(node.code.startLine) : "");
    setCodeEndLine(node?.code.endLine ? String(node.code.endLine) : "");
    setLanguage(node?.code.language ?? "unknown");
    setTestScriptDirectory(node?.execution.testScriptDirectory ?? "");
    setVirtualEnvironment(node?.execution.virtualEnvironment ?? "");
    setWorkingDirectory(node?.execution.workingDirectory ?? "");
    setSetupCommand(node?.execution.setupCommand ?? "");
    setTestCommand(node?.execution.testCommand ?? "");
    setParentId(node?.parentId ?? canvas?.scopeNodeId ?? domainOptions[0]?.id ?? "");
    setAttachedToId(node?.attachedToId ?? defaultOwner);
    setCustomTypeId(node?.customTypeId ?? canvas?.customTypes[0]?.id ?? "");
    setNewCustomTypeName("");
    setNewCustomTypeColor("#475569");
    setNewCustomTypeIcon(defaultCustomBlockIcon);
    setExtensionPayload(detail?.extensionDetails.find((item) => item.node.id === node?.id)?.details.payload ?? {});
  }, [canvas?.customTypes, canvas?.nodes.length, canvas?.scopeNodeId, defaultOwner, detail?.extensionDetails, domainOptions, node, open]);

  if (!open) {
    return null;
  }

  const isDomain = DOMAIN_NODE_KINDS.includes(kind as (typeof DOMAIN_NODE_KINDS)[number]);
  const isFramework = kind === "framework";
  const isCustom = kind === "custom";
  const customTypes = canvas?.customTypes ?? [];
  const enabledExtensionPackageIds = new Set(settings?.extensions?.enabledPackageIds ?? []);
  const visibleNodeKinds = GRAPH_NODE_KINDS.filter((nodeKind) => {
    if (!isExtensionNodeKind(nodeKind)) {
      return true;
    }
    if (node?.kind === nodeKind) {
      return true;
    }
    const extensionPackage = extensionPackageForNodeKind(nodeKind);
    return Boolean(extensionPackage && enabledExtensionPackageIds.has(extensionPackage.id));
  });
  const extensionDefinition = extensionNodeDefinitionForKind(kind);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const payload: NodeMutation | NodeUpdate = {
      kind,
      name: name.trim(),
      summary: summary.trim(),
      codeContext: codeContext.trim(),
      codeDirectory: codeDirectory.trim() || null,
      codeStartLine: parseOptionalLine(codeStartLine),
      codeEndLine: parseOptionalLine(codeEndLine),
      language,
      parentId: isDomain && !isFramework ? parentId || null : null,
      attachedToId: isDomain ? null : attachedToId || null,
      customTypeId: isCustom ? customTypeId || null : null,
      execution: {
        testScriptDirectory: testScriptDirectory.trim() || null,
        virtualEnvironment: virtualEnvironment.trim() || null,
        workingDirectory: workingDirectory.trim() || null,
        setupCommand: setupCommand.trim() || null,
        testCommand: testCommand.trim() || null
      }
    };

    if (extensionDefinition) {
      payload.extensionDetails = {
        packageId: extensionDefinition.packageId,
        schemaId: extensionDefinition.detailSchemaId,
        payload: extensionPayload
      };
    } else if (mode === "edit" && node && isExtensionNodeKind(node.kind)) {
      payload.extensionDetails = null;
    }

    onSave(payload, {
      createCustomType:
        isCustom && !customTypeId && newCustomTypeName.trim()
          ? {
              name: newCustomTypeName.trim(),
              color: newCustomTypeColor,
              icon: newCustomTypeIcon
            }
          : undefined
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog block-dialog" onSubmit={submit}>
        <div className="dialog-title">
          <div>
            <h2>{mode === "create" ? "Add Block" : "Edit Block"}</h2>
            <p>Keep the canvas description short and put detailed coding-agent instructions in code context.</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close block editor" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Type</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as GraphNodeKind)}>
              {visibleNodeKinds.map((nodeKind) => (
                <option key={nodeKind} value={nodeKind}>
                  {nodePalette[nodeKind].label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as LanguageType)}>
              {LANGUAGE_TYPES.map((languageType) => (
                <option key={languageType} value={languageType}>
                  {languageType}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Name</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          {isDomain && !isFramework ? (
            <label className="form-field">
              <span>Parent</span>
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                {domainOptions
                  .filter((item) => isAllowedParent(kind, item.kind))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}

          {!isDomain ? (
            <label className="form-field">
              <span>Attach to</span>
              <select value={attachedToId} onChange={(event) => setAttachedToId(event.target.value)}>
                {ownerOptions
                  .filter((item) => isAllowedAttachmentOwner(kind, item.kind))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </div>

        <label className="form-field">
          <span>Short Canvas Description</span>
          <input value={summary} placeholder="Quick scan text for the block card" onChange={(event) => setSummary(event.target.value)} />
        </label>

        <label className="form-field">
          <span>Code Context</span>
          <textarea
            value={codeContext}
            rows={5}
            placeholder="Detailed prompt context for a coding agent: role, constraints, APIs, files, and tests"
            onChange={(event) => setCodeContext(event.target.value)}
          />
        </label>

        <div className="form-grid">
          <label className="form-field">
            <span>Code Directory</span>
            <input value={codeDirectory} placeholder="apps/web/src/App.tsx" onChange={(event) => setCodeDirectory(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Line Range</span>
            <div className="line-range">
              <input inputMode="numeric" value={codeStartLine} placeholder="Start" onChange={(event) => setCodeStartLine(event.target.value)} />
              <input inputMode="numeric" value={codeEndLine} placeholder="End" onChange={(event) => setCodeEndLine(event.target.value)} />
            </div>
          </label>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Test Script Directory</span>
            <input value={testScriptDirectory} placeholder="tests/generated" onChange={(event) => setTestScriptDirectory(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Virtual Environment</span>
            <input value={virtualEnvironment} placeholder=".venv or pnpm workspace" onChange={(event) => setVirtualEnvironment(event.target.value)} />
          </label>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Working Directory</span>
            <input value={workingDirectory} placeholder="." onChange={(event) => setWorkingDirectory(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Setup Command</span>
            <input value={setupCommand} placeholder="pnpm install" onChange={(event) => setSetupCommand(event.target.value)} />
          </label>
        </div>

        <label className="form-field">
          <span>Test Command</span>
          <input value={testCommand} placeholder="pnpm test --filter ..." onChange={(event) => setTestCommand(event.target.value)} />
        </label>

        {isCustom ? (
          <div className="custom-type-box">
            <label className="form-field">
              <span>Custom Type</span>
              <select value={customTypeId} onChange={(event) => setCustomTypeId(event.target.value)}>
                <option value="">Create new type</option>
                {customTypes.map((customType) => (
                  <option key={customType.id} value={customType.id}>
                    {customType.name}
                  </option>
                ))}
              </select>
            </label>
            {!customTypeId ? (
              <>
                <div className="form-grid">
                  <label className="form-field">
                    <span>New Type Name</span>
                    <input value={newCustomTypeName} onChange={(event) => setNewCustomTypeName(event.target.value)} />
                  </label>
                  <label className="form-field">
                    <span>Color</span>
                    <input type="color" value={newCustomTypeColor} onChange={(event) => setNewCustomTypeColor(event.target.value)} />
                  </label>
                </div>
                <label className="form-field">
                  <span>Icon</span>
                  <div className="icon-picker-grid" role="group" aria-label="Custom type icon">
                    {customBlockIconOptions.map((option) => {
                      const Icon = option.Icon;
                      const selected = newCustomTypeIcon === option.key;
                      return (
                        <span key={option.key} className="icon-picker-tooltip" title={option.label}>
                          <Button
                            type="button"
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            className={`icon-picker-button ${selected ? "selected" : ""}`}
                            aria-label={`Use ${option.label} icon`}
                            aria-pressed={selected}
                            onPress={() => setNewCustomTypeIcon(option.key)}
                          >
                            <Icon size={16} />
                          </Button>
                        </span>
                      );
                    })}
                  </div>
                </label>
              </>
            ) : null}
          </div>
        ) : null}

        {extensionDefinition ? (
          <ExtensionDetailFields
            fields={extensionDefinition.fields}
            payload={extensionPayload}
            onChange={(key, value) =>
              setExtensionPayload((current) => ({
                ...current,
                [key]: value
              }))
            }
          />
        ) : null}

        {error ? <div className="error-strip">{error}</div> : null}

        <div className="dialog-actions">
          <Button type="submit" variant="primary" isDisabled={loading}>
            {mode === "create" ? <Plus size={16} /> : <Save size={16} />}
            {mode === "create" ? "Add block" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function flattenHierarchy(nodes: HierarchyNode[]): GraphNode[] {
  return nodes.flatMap((node) => [node, ...flattenHierarchy(node.children)]);
}

function uniqueNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) {
      return false;
    }
    seen.add(node.id);
    return true;
  });
}

function isAllowedParent(kind: GraphNodeKind, parentKind: GraphNodeKind): boolean {
  const extensionDefinition = extensionNodeDefinitionForKind(kind);
  if (extensionDefinition?.category === "domain") {
    return extensionDefinition.parentKinds.includes(parentKind);
  }
  if (kind === "module") {
    return parentKind === "framework" || parentKind === "module";
  }
  if (kind === "website") {
    return parentKind === "framework" || parentKind === "module";
  }
  if (kind === "ui_component") {
    return parentKind === "website" || parentKind === "module" || parentKind === "ui_component";
  }
  return parentKind === "module";
}

function isAllowedAttachmentOwner(kind: GraphNodeKind, ownerKind: GraphNodeKind): boolean {
  const extensionDefinition = extensionNodeDefinitionForKind(kind);
  if (extensionDefinition?.category === "attachment") {
    return extensionDefinition.attachableToKinds.includes(ownerKind);
  }
  return ownerKind !== "format";
}

function ExtensionDetailFields({
  fields,
  payload,
  onChange
}: {
  fields: ExtensionFieldDefinition[];
  payload: Record<string, string | number | boolean | null>;
  onChange: (key: string, value: string | number | boolean | null) => void;
}) {
  if (fields.length === 0) {
    return null;
  }
  return (
    <div className="custom-type-box">
      <h3>Extension Details</h3>
      <div className="form-grid">
        {fields.map((field) => (
          <label className="form-field" key={field.key}>
            <span>{field.label}</span>
            {field.type === "enum" ? (
              <select value={String(payload[field.key] ?? "")} onChange={(event) => onChange(field.key, event.target.value || null)}>
                <option value="">Unset</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.type === "boolean" ? (
              <label className="inline-control">
                <input type="checkbox" checked={Boolean(payload[field.key])} onChange={(event) => onChange(field.key, event.target.checked)} />
                <span>{field.helpText ?? field.label}</span>
              </label>
            ) : field.type === "textarea" ? (
              <textarea rows={3} value={String(payload[field.key] ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value || null)} />
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                value={String(payload[field.key] ?? "")}
                placeholder={field.placeholder}
                onChange={(event) => onChange(field.key, field.type === "number" && event.target.value ? Number(event.target.value) : event.target.value || null)}
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

function parseOptionalLine(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
