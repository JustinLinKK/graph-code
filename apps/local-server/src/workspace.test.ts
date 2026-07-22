import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFolderPickerEnvironment, WorkspaceRuntime } from "./workspace";

type SourceReader = {
  readSourceFile(projectId: string, relativePath: string): Promise<string>;
  db: { close(): void };
};

describe("WorkspaceRuntime source containment", () => {
  it("rejects sibling-prefix traversal and symlink escapes before reading source files", async () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), "graphcode-path-"));
    const rootPath = path.join(basePath, "work");
    const siblingPath = path.join(basePath, "work-secrets");
    const dbPath = path.join(basePath, "graphcode.sqlite");
    fs.mkdirSync(path.join(rootPath, "src"), { recursive: true });
    fs.mkdirSync(siblingPath, { recursive: true });
    fs.writeFileSync(path.join(rootPath, "src", "module.ts"), "export const value = 1;\n", "utf8");
    fs.writeFileSync(path.join(siblingPath, "token.txt"), "secret-token\n", "utf8");
    fs.symlinkSync(siblingPath, path.join(rootPath, "linked-secrets"), process.platform === "win32" ? "junction" : "dir");

    const runtime = new WorkspaceRuntime(dbPath, rootPath) as unknown as SourceReader;
    const project = (runtime as unknown as WorkspaceRuntime).repo().createProject({ id: "project", name: "Project", rootPath });

    await expect(runtime.readSourceFile(project.id, "src/module.ts")).resolves.toContain("export const value");
    await expect(runtime.readSourceFile(project.id, "../work-secrets/token.txt")).rejects.toThrow(/parent directory traversal/);
    await expect(runtime.readSourceFile(project.id, "linked-secrets/token.txt")).rejects.toThrow(/outside workspace/);

    runtime.db.close();
  });
});

describe("folder picker environment detection", () => {
  it("keeps WSL separate from native Windows", () => {
    expect(detectFolderPickerEnvironment("linux", { WSL_DISTRO_NAME: "Ubuntu" }, "Linux version")).toBe("wsl");
    expect(detectFolderPickerEnvironment("linux", {}, "Linux version microsoft-standard-WSL2")).toBe("wsl");
    expect(detectFolderPickerEnvironment("win32", { WSL_DISTRO_NAME: "Ubuntu" }, "")).toBe("windows");
  });

  it("uses native pickers only on supported host platforms", () => {
    expect(detectFolderPickerEnvironment("darwin", {}, "")).toBe("macos");
    expect(detectFolderPickerEnvironment("linux", {}, "Linux version 6.8.0")).toBe("unsupported");
  });
});
