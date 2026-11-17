import { useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Box3, Vector3 } from "three";
import type { CanvasGraph } from "@graphcode/graph-model";
import type { ViewportController } from "../components/WorkspaceCanvas";
import { getNodeCenter, getBoundaryCenter } from "./coords";

export type CameraRigProps = {
  canvas: CanvasGraph | null;
};

const PAN_STEP = 120;
const FIT_PADDING = 1.2;

export const CameraRig = forwardRef<ViewportController, CameraRigProps>(function CameraRig(
  { canvas },
  ref
) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const zoomIn = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.dollyIn(1.2);
    controls.update();
  }, []);

  const zoomOut = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.dollyOut(1.2);
    controls.update();
  }, []);

  const pan = useCallback((direction: "up" | "down" | "left" | "right") => {
    const controls = controlsRef.current;
    const camera = controls?.object;
    if (!controls || !camera) return;
    const offset = new Vector3();
    switch (direction) {
      case "up":
        offset.z -= PAN_STEP;
        break;
      case "down":
        offset.z += PAN_STEP;
        break;
      case "left":
        offset.x -= PAN_STEP;
        break;
      case "right":
        offset.x += PAN_STEP;
        break;
    }
    camera.position.add(offset);
    controls.target.add(offset);
    controls.update();
  }, []);

  const fitView = useCallback(() => {
    const controls = controlsRef.current;
    const camera = controls?.object;
    if (!controls || !camera || !canvas || canvas.nodes.length === 0) return;
    const box = new Box3();
    for (const node of canvas.nodes) {
      const center = getNodeCenter(node);
      const size = node.size ?? { width: 200, height: 120 };
      box.expandByPoint(new Vector3(center.x - size.width / 2, 0, center.z - size.height / 2));
      box.expandByPoint(new Vector3(center.x + size.width / 2, 0, center.z + size.height / 2));
    }
    for (const boundary of canvas.boundaries ?? []) {
      const center = getBoundaryCenter(boundary);
      const size = boundary.size ?? { width: 300, height: 200 };
      box.expandByPoint(new Vector3(center.x - size.width / 2, 0, center.z - size.height / 2));
      box.expandByPoint(new Vector3(center.x + size.width / 2, 0, center.z + size.height / 2));
    }
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.z);
    const distance = maxDim * FIT_PADDING;
    controls.target.copy(center);
    camera.position.set(center.x, distance, center.z + distance * 0.5);
    controls.update();
  }, [canvas]);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, fitView, pan }), [zoomIn, zoomOut, fitView, pan]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={50}
      maxDistance={5000}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
});
