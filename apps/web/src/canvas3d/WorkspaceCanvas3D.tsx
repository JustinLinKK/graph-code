import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import type { CanvasGraph, GraphNode, Position, Size, WorkspaceSettings } from "@graphcode/graph-model";
import { Vector3 } from "three";
import type { ViewportController } from "../components/WorkspaceCanvas";
import { getNodeCenter, getNodeSize } from "./coords";
import { resolveCanvas3DTheme, theme3dColors } from "./theme3d";
import { CameraRig } from "./cameraRig";
import { NodeMesh } from "./NodeMesh";
import { EdgeLines } from "./EdgeLines";
import { BoundaryMesh } from "./BoundaryMesh";
import { usePickDrag } from "./pickDrag";

export type WorkspaceCanvas3DProps = {
  canvas: CanvasGraph | null;
  theme: WorkspaceSettings["general"]["theme"];
  selectedNodeId: string | null;
  selectedEdgeId?: string | null;
  onSelectNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onPersistLayout: (nodeId: string, position: Position, size: Size) => void;
  onViewportControllerReady?: (controller: ViewportController | null) => void;
};

function hasWebGL(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("webgl2"))
    );
  } catch {
    return false;
  }
}

export function WorkspaceCanvas3D({
  canvas,
  theme,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onOpenNode,
  onPersistLayout,
  onViewportControllerReady
}: WorkspaceCanvas3DProps) {
  // Optimistic positions while dragging in 3D.
  const [dragPositions, setDragPositions] = useState<Map<string, Vector3>>(new Map());

  const onNodeMove = useCallback((nodeId: string, center: Vector3) => {
    setDragPositions((prev) => {
      const next = new Map(prev);
      next.set(nodeId, center.clone());
      return next;
    });
  }, []);

  const handlePersistLayout = useCallback(
    (nodeId: string, position: Position, size: Size) => {
      setDragPositions((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      onPersistLayout(nodeId, position, size);
    },
    [onPersistLayout]
  );

  if (!canvas) {
    return (
      <div className="workspace-canvas-3d-empty" data-testid="workspace-canvas-3d">
        Open a workspace to use the 3D view.
      </div>
    );
  }

  if (!hasWebGL()) {
    return (
      <div className="workspace-canvas-3d-empty" data-testid="workspace-canvas-3d">
        3D view is not available in this environment.
      </div>
    );
  }

  return (
    <div className="workspace-canvas-3d" data-testid="workspace-canvas-3d">
      <Canvas
        camera={{ position: [0, 360, 520], fov: 50, near: 1, far: 10000 }}
        gl={{ antialias: true, alpha: false }}
        shadows
      >
        <Scene
          canvas={canvas}
          theme={theme}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={onSelectNode}
          onOpenNode={onOpenNode}
          onPersistLayout={handlePersistLayout}
          onNodeMove={onNodeMove}
          dragPositions={dragPositions}
          onViewportControllerReady={onViewportControllerReady}
        />
      </Canvas>
    </div>
  );
}

type SceneProps = Omit<WorkspaceCanvas3DProps, "canvas"> & {
  canvas: CanvasGraph;
  dragPositions: Map<string, Vector3>;
  onNodeMove: (nodeId: string, center: Vector3) => void;
};

function Scene({
  canvas,
  theme,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onOpenNode,
  onPersistLayout,
  onNodeMove,
  dragPositions,
  onViewportControllerReady
}: SceneProps) {
  const resolvedTheme = resolveCanvas3DTheme(theme);
  const colors = theme3dColors(resolvedTheme);
  const rigRef = useRef<ViewportController>(null);

  const { onNodePointerDown, onNodePointerUp, onNodeDoubleClick, draggingNodeId } = usePickDrag({
    onSelectNode,
    onOpenNode,
    onPersistLayout,
    onNodeMove
  });

  useEffect(() => {
    onViewportControllerReady?.(rigRef.current);
  }, [onViewportControllerReady]);

  const nodeList = useMemo(() => canvas.nodes, [canvas.nodes]);
  const boundaryList = useMemo(() => canvas.boundaries, [canvas.boundaries]);

  const getNodeCenterLive = useCallback(
    (node: GraphNode) => {
      const dragged = dragPositions.get(node.id);
      return dragged ? dragged : getNodeCenter(node);
    },
    [dragPositions]
  );

  return (
    <>
      <color attach="background" args={[colors.background]} />
      <fog attach="fog" args={[colors.fog, 400, 2800]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[200, 450, 200]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera={{ near: 1, far: 3000, left: -2000, right: 2000, top: 2000, bottom: -2000 }}
      />
      <directionalLight position={[-200, 200, -200]} intensity={0.35} />

      <Grid
        position={[0, -31, 0]}
        args={[5000, 5000]}
        cellColor={colors.grid}
        sectionColor={colors.gridCenter}
        fadeDistance={2500}
        infiniteGrid
      />

      {/* Ground plane to catch shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -31, 0]} receiveShadow>
        <planeGeometry args={[10000, 10000]} />
        <shadowMaterial opacity={0.12} />
      </mesh>

      <CameraRig ref={rigRef} canvas={canvas} />

      <EdgeLines canvas={canvas} selectedEdgeId={selectedEdgeId} />

      {boundaryList.map((boundary) => (
        <BoundaryMesh key={boundary.id} boundary={boundary} colors={colors} />
      ))}

      {nodeList.map((node) => {
        const center = getNodeCenterLive(node);
        const size = getNodeSize(node.size);
        return (
          <NodeMesh
            key={node.id}
            node={{
              ...node,
              position: { x: center.x - size.width / 2, y: center.z - size.height / 2, z: undefined },
              size
            }}
            selected={node.id === selectedNodeId}
            dragging={node.id === draggingNodeId}
            onPointerDown={onNodePointerDown}
            onPointerUp={onNodePointerUp}
            onDoubleClick={onNodeDoubleClick}
          />
        );
      })}
    </>
  );
}

export default WorkspaceCanvas3D;
