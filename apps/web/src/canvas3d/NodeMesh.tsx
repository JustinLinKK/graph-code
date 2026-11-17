import { RoundedBox, Text } from "@react-three/drei";
import { useRef, useMemo } from "react";
import { Mesh, Vector3 } from "three";
import type { GraphNode, Size } from "@graphcode/graph-model";
import type { ThreeEvent } from "@react-three/fiber";
import { nodePalette } from "../graphStyles";
import { getNodeCenter, getNodeSize } from "./coords";

type NodeMeshProps = {
  node: GraphNode;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>, nodeId: string, center: Vector3, size: Size) => void;
  onPointerUp: (e: ThreeEvent<PointerEvent>, nodeId: string) => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>, nodeId: string) => void;
};

const NODE_THICKNESS = 20;
const STATUS_HEIGHT = 4;

export function NodeMesh({
  node,
  selected,
  dragging,
  onPointerDown,
  onPointerUp,
  onDoubleClick
}: NodeMeshProps) {
  const meshRef = useRef<Mesh>(null);
  const center = useMemo(() => getNodeCenter(node), [node]);
  const size = useMemo(() => getNodeSize(node.size), [node.size]);
  const palette = nodePalette[node.kind] ?? nodePalette.custom;
  const statusColor = statusToColor(node.agentStatus);

  return (
    <group position={[center.x, center.y, center.z]}>
      {/* Soft drop shadow on the layer below */}
      <mesh position={[0, -NODE_THICKNESS / 2 - 1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size.width + 16, size.height + 16]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.22} depthWrite={false} />
      </mesh>

      {/* Selection outline */}
      {selected && (
        <RoundedBox
          args={[size.width + 8, NODE_THICKNESS + 4, size.height + 8]}
          position={[0, 0, 0]}
          radius={4}
          smoothness={2}
        >
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} />
        </RoundedBox>
      )}

      {/* Main block */}
      <RoundedBox
        ref={meshRef}
        args={[size.width, NODE_THICKNESS, size.height]}
        radius={4}
        smoothness={2}
        castShadow
        receiveShadow
        onPointerDown={(e) => onPointerDown(e, node.id, new Vector3(center.x, center.y, center.z), size)}
        onPointerUp={(e) => onPointerUp(e, node.id)}
        onDoubleClick={(e) => onDoubleClick(e, node.id)}
      >
        <meshStandardMaterial
          color={palette.accent}
          roughness={0.35}
          metalness={0.15}
        />
      </RoundedBox>

      {/* Lighter top face for a beveled/card look */}
      <RoundedBox
        args={[size.width - 6, 2, size.height - 6]}
        position={[0, NODE_THICKNESS / 2 + 0.6, 0]}
        radius={2}
        smoothness={2}
      >
        <meshStandardMaterial
          color={palette.accent}
          emissive="#ffffff"
          emissiveIntensity={0.18}
          roughness={0.35}
          metalness={0.15}
        />
      </RoundedBox>

      {/* Status strip */}
      {statusColor && (
        <mesh position={[0, NODE_THICKNESS / 2 + 0.5, -size.height / 2 + 6]}>
          <boxGeometry args={[size.width - 16, STATUS_HEIGHT, 4]} />
          <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.3} />
        </mesh>
      )}

      {/* Label */}
      <Text
        position={[0, NODE_THICKNESS / 2 + 2, 0]}
        fontSize={14}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        maxWidth={size.width - 20}
        textAlign="center"
      >
        {node.name}
      </Text>

      {/* Subtle kind label */}
      <Text
        position={[0, -NODE_THICKNESS / 2 - 8, 0]}
        fontSize={10}
        color="rgba(255,255,255,0.8)"
        anchorX="center"
        anchorY="middle"
      >
        {palette.label}
      </Text>
    </group>
  );
}

function statusToColor(status: GraphNode["agentStatus"]): string | null {
  switch (status) {
    case "planning":
      return "#f59e0b";
    case "coded":
      return "#3b82f6";
    case "reviewed":
      return "#8b5cf6";
    case "implemented":
      return "#10b981";
    case "bugged":
      return "#ef4444";
    default:
      return null;
  }
}
