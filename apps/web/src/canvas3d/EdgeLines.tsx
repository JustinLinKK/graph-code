import { useMemo } from "react";
import { Vector3, QuadraticBezierCurve3, TubeGeometry, ConeGeometry, Matrix4 } from "three";
import type { CanvasGraph, GraphEdge } from "@graphcode/graph-model";
import { Line } from "@react-three/drei";
import { getNodeCenter } from "./coords";

type EdgeLinesProps = {
  canvas: CanvasGraph;
  selectedEdgeId?: string | null;
};

const EDGE_COLOR = "#94a3b8";
const SELECTED_COLOR = "#38bdf8";
const ARCH_HEIGHT = 35;

export function EdgeLines({ canvas, selectedEdgeId }: EdgeLinesProps) {
  const nodeById = useMemo(() => {
    const map = new Map(canvas.nodes.map((n) => [n.id, n]));
    return map;
  }, [canvas.nodes]);

  return (
    <group>
      {canvas.edges.map((edge) => {
        const source = nodeById.get(edge.sourceNodeId);
        const target = nodeById.get(edge.targetNodeId);
        if (!source || !target) return null;
        return edge.animated ? (
          <AnimatedSingleEdge
            key={edge.id}
            edge={edge}
            source={source}
            target={target}
            selected={edge.id === selectedEdgeId}
          />
        ) : (
          <SolidSingleEdge
            key={edge.id}
            edge={edge}
            source={source}
            target={target}
            selected={edge.id === selectedEdgeId}
          />
        );
      })}
    </group>
  );
}

function useEdgeCurve(source: CanvasGraph["nodes"][number], target: CanvasGraph["nodes"][number]) {
  const s = useMemo(() => getNodeCenter(source), [source]);
  const t = useMemo(() => getNodeCenter(target), [target]);
  return useMemo(() => {
    const start = new Vector3(s.x, s.y + 4, s.z);
    const end = new Vector3(t.x, t.y + 4, t.z);
    const mid = new Vector3().lerpVectors(start, end, 0.5);
    mid.y += ARCH_HEIGHT + Math.min(40, start.distanceTo(end) * 0.15);
    return new QuadraticBezierCurve3(start, mid, end);
  }, [s, t]);
}

function AnimatedSingleEdge({
  edge,
  source,
  target,
  selected
}: {
  edge: GraphEdge;
  source: CanvasGraph["nodes"][number];
  target: CanvasGraph["nodes"][number];
  selected: boolean;
}) {
  const curve = useEdgeCurve(source, target);
  const points = useMemo(() => curve.getPoints(48), [curve]);
  const color = selected ? SELECTED_COLOR : (edge.color ?? EDGE_COLOR);

  return (
    <group>
      <Line points={points} color={color} lineWidth={selected ? 4 : 2} dashed dashScale={20} dashSize={3} gapSize={3} />
    </group>
  );
}

function SolidSingleEdge({
  edge,
  source,
  target,
  selected
}: {
  edge: GraphEdge;
  source: CanvasGraph["nodes"][number];
  target: CanvasGraph["nodes"][number];
  selected: boolean;
}) {
  const curve = useEdgeCurve(source, target);

  const tubeGeo = useMemo(
    () => new TubeGeometry(curve, 48, selected ? 2.2 : 1.6, 8, false),
    [curve, selected]
  );

  const arrowGeo = useMemo(() => new ConeGeometry(4, 12, 8), []);

  const { arrowMatrix, arrowPoint } = useMemo(() => {
    const point = curve.getPoint(0.92);
    const p0 = curve.getPoint(0.88);
    const p1 = curve.getPoint(0.92);
    const dir = new Vector3().subVectors(p1, p0).normalize();
    const up = new Vector3(0, 1, 0);
    const axis = new Vector3().crossVectors(up, dir).normalize();
    const radians = Math.acos(up.dot(dir));
    const m = new Matrix4().makeRotationAxis(axis, radians);
    m.setPosition(point);
    return { arrowMatrix: m, arrowPoint: point };
  }, [curve]);

  const color = selected ? SELECTED_COLOR : (edge.color ?? EDGE_COLOR);

  return (
    <group>
      <mesh geometry={tubeGeo} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          color={color}
          roughness={0.4}
          metalness={0.1}
          emissive={color}
          emissiveIntensity={selected ? 0.25 : 0.08}
        />
      </mesh>
      <mesh geometry={arrowGeo} matrix={arrowMatrix} matrixAutoUpdate={false}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  );
}
