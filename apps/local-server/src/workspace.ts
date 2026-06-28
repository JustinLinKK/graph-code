import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { OpenWorkspaceResult, Project } from "@graphcode/graph-model";
import { openDatabase, type GraphDatabase } from "./db/connection";
import { GraphRepository, validationError } from "./db/repository";
import { migrate } from "./db/schema";

export class WorkspaceRuntime {
  private db: GraphDatabase;
  private repository: GraphRepository;

  constructor(private readonly fallbackDbPath: string, private readonly selfRootPath: string) {
    this.db = openDatabase(fallbackDbPath);
    migrate(this.db);
    this.repository = new GraphRepository(this.db);
  }

  repo(): GraphRepository {
    return this.repository;
  }

  seedSelfGraph(): Project {
    return this.repository.seedSelfGraph(this.selfRootPath);
  }

  openWorkspace(input: { rootPath: string; createIfMissing?: boolean }): OpenWorkspaceResult {
    const rootPath = path.resolve(input.rootPath);
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
      throw validationError(`Workspace directory does not exist: ${rootPath}`);
    }

    const graphcodePath = path.join(rootPath, ".graphcode");
    if (!fs.existsSync(graphcodePath)) {
      if (!input.createIfMissing) {
        return {
          status: "missing_graphcode",
          rootPath,
          graphcodePath,
          message: "This directory does not contain a .graphcode workspace."
        };
      }
      fs.mkdirSync(graphcodePath, { recursive: true });
    }

    this.switchDatabase(path.join(graphcodePath, "graphcode.sqlite"));
    const existingProject = this.repository.listProjects()[0] ?? null;
    const project =
      existingProject ??
      this.repository.createProject({
        id: workspaceProjectId(rootPath),
        name: path.basename(rootPath) || "Untitled Workspace",
        rootPath
      });

    fs.writeFileSync(
      path.join(graphcodePath, "workspace.json"),
      JSON.stringify(
        {
          projectId: project.id,
          rootPath,
          graphcodePath,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );

    return {
      status: existingProject ? "opened" : "created",
      project,
      graphcodePath
    };
  }

  close(): void {
    this.db.close();
  }

  private switchDatabase(dbPath: string): void {
    this.db.close();
    this.db = openDatabase(dbPath);
    migrate(this.db);
    this.repository = new GraphRepository(this.db);
  }
}

function workspaceProjectId(rootPath: string): string {
  const hash = crypto.createHash("sha1").update(rootPath).digest("hex").slice(0, 10);
  return `workspace-${hash}`;
}
