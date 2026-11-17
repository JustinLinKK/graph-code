import type { WorkspaceSettings } from "@graphcode/graph-model";

export type Canvas3DTheme = "light" | "dark";

export function resolveCanvas3DTheme(theme: WorkspaceSettings["general"]["theme"]): Canvas3DTheme {
  if (theme === "system") {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function theme3dColors(theme: Canvas3DTheme) {
  if (theme === "dark") {
    return {
      background: "#0f172a",
      fog: "#0f172a",
      grid: "#334155",
      gridCenter: "#475569",
      nodeText: "#f8fafc",
      selectedOutline: "#38bdf8",
      boundaryFill: "rgba(51, 65, 85, 0.35)",
      boundaryStroke: "#475569"
    };
  }
  return {
    background: "#f8fafc",
    fog: "#f8fafc",
    grid: "#d4d7dd",
    gridCenter: "#94a3b8",
    nodeText: "#0f172a",
    selectedOutline: "#0284c7",
    boundaryFill: "rgba(203, 213, 225, 0.35)",
    boundaryStroke: "#94a3b8"
  };
}
