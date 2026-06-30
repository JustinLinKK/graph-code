import { Button } from "@heroui/react";
import type { BlankWorkspaceInitialization, WorkspaceInitialization } from "@graphcode/graph-model";
import { FolderOpen, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type WorkspaceDialogProps = {
  open: boolean;
  loading: boolean;
  missingPath: string | null;
  initializationStatus: "missing_graphcode" | "empty_graphcode" | null;
  error: string | null;
  onClose: () => void;
  onOpen: (rootPath: string) => void;
  onCreateBlank: (rootPath: string, initialization: BlankWorkspaceInitialization) => void;
  onCreateAndScan: (rootPath: string, initialization: WorkspaceInitialization) => void;
};

export function WorkspaceDialog({ open, loading, missingPath, initializationStatus, error, onClose, onOpen, onCreateBlank, onCreateAndScan }: WorkspaceDialogProps) {
  const [rootPath, setRootPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [scanningInstructions, setScanningInstructions] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (missingPath) {
      setRootPath(missingPath);
      setProjectName(folderName(missingPath));
      setFormError(null);
    }
  }, [missingPath]);

  if (!open) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedRootPath = rootPath.trim();
    if (!trimmedRootPath) {
      return;
    }
    if (!missingPath) {
      onOpen(trimmedRootPath);
      return;
    }

    const initialization = {
      projectName: projectName.trim(),
      projectDescription: projectDescription.trim(),
      scanningInstructions: scanningInstructions.trim()
    };
    if (!initialization.projectName || !initialization.projectDescription || !initialization.scanningInstructions) {
      setFormError("Project name, description, and scanning instructions are required to scan.");
      return;
    }
    setFormError(null);
    onCreateAndScan(trimmedRootPath, initialization);
  };

  const createBlank = () => {
    const trimmedRootPath = rootPath.trim();
    const initialization = {
      projectName: projectName.trim(),
      projectDescription: projectDescription.trim()
    };
    if (!trimmedRootPath) {
      return;
    }
    if (!initialization.projectName) {
      setFormError("Project name is required to create a blank workspace.");
      return;
    }
    setFormError(null);
    onCreateBlank(trimmedRootPath, initialization);
  };

  const isInitializing = Boolean(missingPath);
  const statusCopy =
    initializationStatus === "empty_graphcode"
      ? {
          title: ".graphcode is empty.",
          detail: "Choose how to initialize this workspace."
        }
      : {
          title: "No .graphcode folder found.",
          detail: "Choose how to initialize this project."
        };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className={`dialog workspace-dialog${isInitializing ? " workspace-dialog-initialize" : ""}`} onSubmit={submit}>
        <div className="dialog-title">
          <div>
            <h2>{isInitializing ? "Initialize Workspace" : "Open Workspace"}</h2>
            <p>{isInitializing ? statusCopy.detail : "Choose a repository directory that contains a .graphcode workspace."}</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close workspace dialog" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <label className="form-field">
          <span>Directory</span>
          <input autoFocus value={rootPath} placeholder="/path/to/repo" onChange={(event) => setRootPath(event.target.value)} />
        </label>

        {isInitializing ? (
          <>
            <div className="dialog-warning">
              <strong>{statusCopy.title}</strong>
              <span>{rootPath}</span>
            </div>
            <label className="form-field">
              <span>Project name</span>
              <input value={projectName} placeholder="Project name" onChange={(event) => setProjectName(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Project description</span>
              <textarea rows={5} value={projectDescription} placeholder="Purpose, major subsystems, important boundaries." onChange={(event) => setProjectDescription(event.target.value)} />
            </label>
            <label className="form-field">
              <span>Scanning instructions</span>
              <textarea rows={7} value={scanningInstructions} placeholder="Desired graph grouping, naming, relationships, and areas to emphasize." onChange={(event) => setScanningInstructions(event.target.value)} />
            </label>
          </>
        ) : null}
        {formError ? <div className="error-strip">{formError}</div> : null}
        {error ? <div className="error-strip">{error}</div> : null}

        <div className="dialog-actions">
          {isInitializing ? (
            <>
              <Button type="button" variant="secondary" isDisabled={loading} onPress={createBlank}>
                <Plus size={16} />
                Create blank
              </Button>
              <Button type="submit" variant="primary" isDisabled={loading}>
                <Plus size={16} />
                {loading ? "Scanning..." : "Create and scan"}
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" isDisabled={loading}>
              <FolderOpen size={16} />
              Open
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function folderName(value: string): string {
  const normalized = value.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? "Untitled Workspace";
}
