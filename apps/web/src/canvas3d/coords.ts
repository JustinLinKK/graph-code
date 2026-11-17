import type { GraphNode, GraphBoundary, GraphNodeKind, Position, Size } from "@graphcode/graph-model";
import type { Vector3 } from "three";

// Vertical elevation per node kind so the 3D view has clear layers:
// coarse containers sit low, fine-grained leaves float higher.
const ELEVATION_BY_KIND: Partial<Record<GraphNodeKind, number>> = {
  framework: 0,
  module: 10,
  website: 10,
  ui_component: 10,
  embedded_system: 10,
  ml_pipeline: 10,
  ml_model: 10,
  object: 20,
  embedded_device: 20,
  ros_node: 20,
  firmware_task: 20,
  ml_training_stage: 20,
  ml_layer: 20,
  function: 30
};

export function nodeElevation(kind: GraphNodeKind): number {
  return ELEVATION_BY_KIND[kind] ?? 40;
}

// Maps the 2D canvas plane (x, y) onto the 3D ground plane (x, 0, z).
// y=0 is the ground; the 2D y axis becomes the 3D z axis so that the 2D top-down
// view and the 3D view feel aligned. Each kind is also lifted by nodeElevation
// to create visible layers in 3D.
export function toWorld(position: Position | null | undefined): { x: number; y: number; z: number } {
  const p = position ?? { x: 0, y: 0 };
  return { x: p.x, y: 0, z: p.y };
}

export function toPlane(world: { x: number; y: number; z: number }): Position {
  return { x: world.x, y: world.z };
}

export function getNodeSize(size: Size | null | undefined): { width: number; height: number } {
  return size ?? { width: 200, height: 120 };
}

export function getNodeCenter(node: GraphNode): { x: number; y: number; z: number } {
  const pos = toWorld(node.position);
  const size = getNodeSize(node.size);
  return {
    x: pos.x + size.width / 2,
    y: pos.y + nodeElevation(node.kind),
    z: pos.z + size.height / 2
  };
}

export function getBoundaryCenter(boundary: GraphBoundary): { x: number; y: number; z: number } {
  const pos = toWorld(boundary.position);
  const size = getNodeSize(boundary.size);
  return {
    x: pos.x + size.width / 2,
    y: pos.y - 20,
    z: pos.z + size.height / 2
  };
}

export function vectorEquals(a: Vector3, b: Vector3, epsilon = 0.001): boolean {
  return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon && Math.abs(a.z - b.z) < epsilon;
}
