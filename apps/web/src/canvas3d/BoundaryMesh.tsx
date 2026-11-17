import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import type { GraphBoundary } from "@graphcode/graph-model";
import { getBoundaryCenter, getNodeSize } from "./coords";

type BoundaryMeshProps = {
  boundary: GraphBoundary;
  colors: {
    boundaryFill: string;
    boundaryStroke: string;
  };
};

const BOUNDARY_THICKNESS = 4;

export function BoundaryMesh({ boundary, colors }: BoundaryMeshProps) {
  const center = useMemo(() => getBoundaryCenter(boundary), [boundary]);
  const size = useMemo(() => getNodeSize(boundary.size), [boundary.size]);

  const loopPoints: [number, number, number][] = useMemo(
    () => [
      [-size.width / 2, 0, -size.height / 2],
      [size.width / 2, 0, -size.height / 2],
      [size.width / 2, 0, size.height / 2],
      [-size.width / 2, 0, size.height / 2],
      [-size.width / 2, 0, -size.height / 2]
    ],
    [size]
  );

  return (
    <group position={[center.x, center.y, center.z]}>
      {/* Soft ground shadow */}
      <mesh position={[0, -BOUNDARY_THICKNESS / 2 - 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size.width + 24, size.height + 24]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Translucent slab */}
      <mesh position={[0, -BOUNDARY_THICKNESS / 2, 0]}>
        <boxGeometry args={[size.width, BOUNDARY_THICKNESS, size.height]} />
        <meshBasicMaterial color={colors.boundaryFill} transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* Border */}
      <Line points={loopPoints} color={colors.boundaryStroke} lineWidth={3} />

      {/* Label */}
      <Text
        position={[0, 6, -size.height / 2 + 18]}
        fontSize={16}
        color={colors.boundaryStroke}
        anchorX="center"
        anchorY="bottom"
      >
        {boundary.name}
      </Text>
    </group>
  );
}
