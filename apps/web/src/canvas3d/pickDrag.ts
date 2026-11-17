import { useRef, useCallback, useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, Plane } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Position, Size } from "@graphcode/graph-model";

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

export type PickDragApi = {
  onNodePointerDown: (e: ThreeEvent<PointerEvent>, nodeId: string, center: Vector3, size: Size) => void;
  onNodePointerUp: (e: ThreeEvent<PointerEvent>, nodeId: string) => void;
  onNodeDoubleClick: (e: ThreeEvent<MouseEvent>, nodeId: string) => void;
  /** Call this from the component that owns optimistic node positions during drag. */
  draggingNodeId: string | null;
};

export function usePickDrag({
  onSelectNode,
  onOpenNode,
  onPersistLayout,
  onNodeMove
}: {
  onSelectNode: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onPersistLayout: (nodeId: string, position: Position, size: Size) => void;
  onNodeMove: (nodeId: string, center: Vector3) => void;
}): PickDragApi {
  const { camera, gl, size } = useThree();
  const dragRef = useRef<{
    nodeId: string;
    size: Size;
    offset: Vector3;
    moved: boolean;
    plane: Plane;
  } | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

  const raycastToPlane = useCallback(
    (clientX: number, clientY: number, plane: Plane): Vector3 | null => {
      const raycaster = new Raycaster();
      const pointer = new Vector2(
        ((clientX - size.left) / size.width) * 2 - 1,
        -((clientY - size.top) / size.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const target = new Vector3();
      const hit = raycaster.ray.intersectPlane(plane, target);
      return hit ? target : null;
    },
    [camera, gl, size]
  );

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = raycastToPlane(event.clientX, event.clientY, drag.plane);
      if (!point) return;
      drag.moved = true;
      const center = point.sub(drag.offset);
      onNodeMove(drag.nodeId, center);
    },
    [raycastToPlane, onNodeMove]
  );

  const handleUp = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const point = raycastToPlane(event.clientX, event.clientY, drag.plane);
      if (point) {
        const center = point.sub(drag.offset);
        onPersistLayout(
          drag.nodeId,
          {
            x: center.x - drag.size.width / 2,
            y: center.z - drag.size.height / 2
          },
          drag.size
        );
      }
      dragRef.current = null;
      setDraggingNodeId(null);
    },
    [raycastToPlane, onPersistLayout, handleMove]
  );

  const onNodePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, nodeId: string, center: Vector3, size: Size) => {
      e.stopPropagation();
      // Raycast against a horizontal plane at the node's own elevation so dragging
      // preserves the 3D layer instead of snapping everything to the ground.
      const plane = new Plane(new Vector3(0, 1, 0), -center.y);
      const point = e.point.clone();
      dragRef.current = {
        nodeId,
        size,
        offset: point.sub(center),
        moved: false,
        plane
      };
      setDraggingNodeId(nodeId);
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [handleMove, handleUp]
  );

  const onNodePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>, nodeId: string) => {
      e.stopPropagation();
      const drag = dragRef.current;
      if (drag && drag.nodeId === nodeId && !drag.moved) {
        onSelectNode(nodeId);
      }
    },
    [onSelectNode]
  );

  const onNodeDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, nodeId: string) => {
      e.stopPropagation();
      onOpenNode(nodeId);
    },
    [onOpenNode]
  );

  // Safety cleanup if component unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [handleMove, handleUp]);

  return { onNodePointerDown, onNodePointerUp, onNodeDoubleClick, draggingNodeId };
}
