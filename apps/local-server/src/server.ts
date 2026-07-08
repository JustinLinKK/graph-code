import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { resolveDbPath, resolveRepoRoot, resolveServerHost, resolveServerPort } from "./config";
import { registerApiRoutes } from "./routes";
import { WorkspaceRuntime } from "./workspace";

export async function buildServer(options: { dbPath?: string; seedSelf?: boolean; selfRootPath?: string } = {}) {
  const runtime = new WorkspaceRuntime(options.dbPath ?? resolveDbPath(), options.selfRootPath ?? resolveRepoRoot());
  if (options.seedSelf) {
    runtime.seedSelfGraph();
  }

  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" }
  });

  await app.register(cors, {
    origin: true
  });

  await registerApiRoutes(app, runtime);

  app.addHook("onClose", async () => {
    runtime.close();
  });

  app.setErrorHandler((error, _request, reply) => {
    const caughtError = error as Error & { statusCode?: number };
    const statusCode = typeof caughtError.statusCode === "number" ? caughtError.statusCode : 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : "Request Error",
      message: caughtError.message
    });
  });

  return app;
}

async function main(): Promise<void> {
  const port = resolveServerPort();
  const host = resolveServerHost();
  const app = await buildServer();
  await app.listen({ port, host });

  const close = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
