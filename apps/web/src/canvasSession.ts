export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

type CanvasSessionProject = {
  lastScopeNodeId: string | null;
  viewports: Record<string, CanvasViewport>;
};

type CanvasSessionState = {
  lastProjectId: string | null;
  lastOpenedProjectId: string | null;
  projects: Record<string, CanvasSessionProject>;
};

const STORAGE_KEY = "graphcode.canvasSession.v1";
const NULL_SCOPE_KEY = "__project__";

export function getStoredCanvasProjectId(): string | null {
  return readSession().lastOpenedProjectId;
}

export function getStoredCanvasScope(projectId: string): string | null | undefined {
  return readSession().projects[projectId]?.lastScopeNodeId;
}

export function rememberCanvasScope(projectId: string, scopeNodeId: string | null): void {
  const session = readSession();
  const project = ensureProjectSession(session, projectId);
  project.lastScopeNodeId = scopeNodeId;
  session.lastProjectId = projectId;
  session.lastOpenedProjectId = projectId;
  writeSession(session);
}

export function getStoredCanvasViewport(projectId: string, scopeNodeId: string | null): CanvasViewport | null {
  return readSession().projects[projectId]?.viewports[scopeKey(scopeNodeId)] ?? null;
}

export function rememberCanvasViewport(projectId: string, scopeNodeId: string | null, viewport: CanvasViewport): void {
  const session = readSession();
  const project = ensureProjectSession(session, projectId);
  project.viewports[scopeKey(scopeNodeId)] = viewport;
  project.lastScopeNodeId = scopeNodeId;
  session.lastProjectId = projectId;
  session.lastOpenedProjectId = projectId;
  writeSession(session);
}

function ensureProjectSession(session: CanvasSessionState, projectId: string): CanvasSessionProject {
  session.projects[projectId] ??= { lastScopeNodeId: null, viewports: {} };
  return session.projects[projectId];
}

function readSession(): CanvasSessionState {
  if (typeof window === "undefined") {
    return emptySession();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptySession();
    }
    return parseSession(JSON.parse(raw));
  } catch {
    return emptySession();
  }
}

function writeSession(session: CanvasSessionState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Canvas session persistence should never block graph editing.
  }
}

function parseSession(value: unknown): CanvasSessionState {
  if (!value || typeof value !== "object") {
    return emptySession();
  }
  const input = value as Partial<CanvasSessionState>;
  const projects: Record<string, CanvasSessionProject> = {};
  const rawProjects = input.projects && typeof input.projects === "object" ? input.projects : {};
  for (const [projectId, rawProject] of Object.entries(rawProjects)) {
    if (!rawProject || typeof rawProject !== "object") {
      continue;
    }
    const project = rawProject as Partial<CanvasSessionProject>;
    const viewports: Record<string, CanvasViewport> = {};
    const rawViewports = project.viewports && typeof project.viewports === "object" ? project.viewports : {};
    for (const [key, rawViewport] of Object.entries(rawViewports)) {
      if (isViewport(rawViewport)) {
        viewports[key] = rawViewport;
      }
    }
    projects[projectId] = {
      lastScopeNodeId: typeof project.lastScopeNodeId === "string" ? project.lastScopeNodeId : null,
      viewports
    };
  }
  return {
    lastProjectId: typeof input.lastProjectId === "string" ? input.lastProjectId : null,
    lastOpenedProjectId: typeof input.lastOpenedProjectId === "string" ? input.lastOpenedProjectId : null,
    projects
  };
}

function emptySession(): CanvasSessionState {
  return { lastProjectId: null, lastOpenedProjectId: null, projects: {} };
}

function isViewport(value: unknown): value is CanvasViewport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const viewport = value as CanvasViewport;
  return Number.isFinite(viewport.x) && Number.isFinite(viewport.y) && Number.isFinite(viewport.zoom);
}

function scopeKey(scopeNodeId: string | null): string {
  return scopeNodeId ?? NULL_SCOPE_KEY;
}
