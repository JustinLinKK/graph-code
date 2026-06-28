import fs from "node:fs";
import path from "node:path";
import { scanRepositoryCodeGraph } from "@graphcode/parser";
import { resolveDbPath, resolveRepoRoot } from "../config";
import { openDatabase } from "../db/connection";
import { GraphRepository } from "../db/repository";
import { migrate } from "../db/schema";

const repoRoot = resolveRepoRoot();
const db = openDatabase(resolveDbPath());
migrate(db);
const repo = new GraphRepository(db);
const project = repo.seedSelfGraph(repoRoot);
repo.replaceScannedCodeGraph(project.id, scanRepositoryCodeGraph(repoRoot));
db.close();

const graphcodePath = path.join(repoRoot, ".graphcode");
fs.mkdirSync(graphcodePath, { recursive: true });
fs.writeFileSync(
  path.join(graphcodePath, "workspace.json"),
  JSON.stringify(
    {
      projectId: project.id,
      rootPath: repoRoot,
      graphcodePath,
      updatedAt: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(`Seeded ${project.name} (${project.id}) at ${path.join(graphcodePath, "graphcode.sqlite")}`);
