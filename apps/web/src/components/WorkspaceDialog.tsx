import { Button } from "@heroui/react";
import { FolderOpen, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type WorkspaceDialogProps = {
  open: boolean;
  loading: boolean;
  missingPath: string | null;
  error: string | null;
  onClose: () => void;
  onOpen: (rootPath: string) => void;
  onCreateBlank: (rootPath: string) => void;
};

export function WorkspaceDialog({ open, loading, missingPath, error, onClose, onOpen, onCreateBlank }: WorkspaceDialogProps) {
  const [rootPath, setRootPath] = useState("");

  useEffect(() => {
    if (missingPath) {
      setRootPath(missingPath);
    }
  }, [missingPath]);

  if (!open) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rootPath.trim()) {
      onOpen(rootPath.trim());
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog workspace-dialog" onSubmit={submit}>
        <div className="dialog-title">
          <div>
            <h2>Open Workspace</h2>
            <p>Choose a repository directory that contains a .graphcode workspace.</p>
          </div>
          <Button isIconOnly size="sm" variant="ghost" aria-label="Close workspace dialog" onPress={onClose}>
            <X size={16} />
          </Button>
        </div>

        <label className="form-field">
          <span>Directory</span>
          <input autoFocus value={rootPath} placeholder="/path/to/repo" onChange={(event) => setRootPath(event.target.value)} />
        </label>

        {missingPath ? (
          <div className="dialog-warning">
            <strong>No .graphcode folder found.</strong>
            <span>Create a blank GraphCode workspace in this directory?</span>
          </div>
        ) : null}
        {error ? <div className="error-strip">{error}</div> : null}

        <div className="dialog-actions">
          {missingPath ? (
            <Button type="button" variant="primary" isDisabled={loading} onPress={() => onCreateBlank(rootPath.trim())}>
              <Plus size={16} />
              Create blank
            </Button>
          ) : null}
          <Button type="submit" variant="primary" isDisabled={loading}>
            <FolderOpen size={16} />
            Open
          </Button>
        </div>
      </form>
    </div>
  );
}
