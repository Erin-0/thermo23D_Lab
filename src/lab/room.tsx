/* --------------------------------------------------------------------------- *
 *  La salle de TP : sol, murs, luminaires, rangements et panneaux muraux       *
 * --------------------------------------------------------------------------- */

import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { createFloorTexture, createWallPanelTexture } from './screens';
import type { Quality } from './shared';

/** Sécurité du TP1 (rappel de l'énoncé). */
function SafetyPanel() {
  return (
    <group position={[0.15, 1.66, -1.25]}>
      <RoundedBox args={[0.92, 1.05, 0.018]} radius={0.012} smoothness={3}>
        <meshStandardMaterial color="#f5f4ee" roughness={0.74} />
      </RoundedBox>
      <mesh position={[0, 0.435, 0.012]}>
        <planeGeometry args={[0.84, 0.12]} />
        <meshStandardMaterial color="#325b59" roughness={0.7} />
      </mesh>
      {/* Bandeau et lignes simulées : pas de chargement de police externe. */}
      {[0.28, 0.16, 0.04, -0.08, -0.2, -0.32].map((y, i) => (
        <mesh key={y} position={[-0.38 + (i % 2) * 0.04, y, 0.014]}>
          <planeGeometry args={[0.7 - (i % 2) * 0.12, 0.022]} />
          <meshStandardMaterial color={i === 0 ? '#b8493f' : '#8b9a97'} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, -0.455, 0.014]}>
        <planeGeometry args={[0.6, 0.018]} />
        <meshStandardMaterial color="#c3cbc9" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Données de la salle pour le TP2 : μ₀, incertitudes, constantes. */
function WallDataPanel() {
  const texture = useMemo(() => createWallPanelTexture(), []);
  return (
    <group position={[-2.65, 1.62, -1.25]}>
      <RoundedBox args={[1.02, 0.7, 0.02]} radius={0.01} smoothness={3}>
        <meshStandardMaterial color="#e8e8e2" roughness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.013]}>
        <planeGeometry args={[0.96, 0.64]} />
        <meshStandardMaterial map={texture} roughness={0.78} />
      </mesh>
    </group>
  );
}

/** Armoire de rangement — remplace la zone robinet/évier supprimée. */
function StorageUnit({ x, width = 0.95 }: { x: number; width?: number }) {
  return (
    <group position={[x, 0, -1.0]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.1, 0.5]} />
        <meshStandardMaterial color="#cdd3d0" roughness={0.62} metalness={0.06} />
      </mesh>
      {[0.82, 0.42].map((y) => (
        <mesh key={y} position={[0, y, 0.252]}>
          <boxGeometry args={[width - 0.06, 0.34, 0.012]} />
          <meshStandardMaterial color="#dfe4e1" roughness={0.5} />
        </mesh>
      ))}
      {[0.82, 0.42].map((y) => (
        <mesh key={`h-${y}`} position={[width * 0.3, y, 0.268]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.05, 10]} />
          <meshStandardMaterial color="#8b9495" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 1.112, 0]}>
        <boxGeometry args={[width + 0.03, 0.024, 0.53]} />
        <meshStandardMaterial color="#b9c0bd" roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** Étagère murale avec verrerie de réserve (béchers, erlenmeyers). */
function WallShelf({ x }: { x: number }) {
  const glasses = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        x: -0.52 + i * 0.17,
        h: 0.07 + (i % 3) * 0.022,
        r: 0.031 + (i % 2) * 0.008,
      })),
    [],
  );
  return (
    <group position={[x, 1.42, -1.22]}>
      <mesh castShadow>
        <boxGeometry args={[1.24, 0.028, 0.24]} />
        <meshStandardMaterial color="#c6ccc9" roughness={0.5} metalness={0.14} />
      </mesh>
      {[-0.55, 0.55].map((bx) => (
        <mesh key={bx} position={[bx, -0.13, 0.1]}>
          <boxGeometry args={[0.03, 0.24, 0.03]} />
          <meshStandardMaterial color="#aab2b1" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {glasses.map((g, i) => (
        <mesh key={i} position={[g.x, 0.014 + g.h / 2, 0]}>
          <cylinderGeometry args={[g.r, g.r * 0.92, g.h, 14, 1, true]} />
          <meshPhysicalMaterial color="#cfe4e6" transparent opacity={0.34} roughness={0.08} side={2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Room({ quality }: { quality: Quality }) {
  const floorTexture = useMemo(() => createFloorTexture(quality === 'low' ? 0.5 : 1), [quality]);
  const lights: [number, number][] = quality === 'low' ? [[0, 1.45]] : [[-1.45, 0.45], [1.45, 0.45], [-1.45, 2.85], [1.45, 2.85]];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 1.45]} receiveShadow>
        <planeGeometry args={[8, 5.8]} />
        <meshStandardMaterial map={floorTexture} color="#d6dad8" roughness={0.72} metalness={0.03} />
      </mesh>
      <mesh position={[0, 1.43, -1.31]} receiveShadow>
        <boxGeometry args={[8, 2.86, 0.09]} />
        <meshStandardMaterial color="#e9ece9" roughness={0.88} />
      </mesh>
      <mesh position={[-4.02, 1.43, 1.45]} receiveShadow>
        <boxGeometry args={[0.09, 2.86, 5.8]} />
        <meshStandardMaterial color="#e6e9e6" roughness={0.88} />
      </mesh>
      <mesh position={[4.02, 1.43, 1.45]} receiveShadow>
        <boxGeometry args={[0.09, 2.86, 5.8]} />
        <meshStandardMaterial color="#e6e9e6" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.87, 1.45]}>
        <boxGeometry args={[8, 0.06, 5.8]} />
        <meshStandardMaterial color="#f0f1ed" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.43, 4.36]}>
        <boxGeometry args={[8, 2.86, 0.08]} />
        <meshStandardMaterial color="#e5e8e5" roughness={0.9} />
      </mesh>
      {/* Plinthes */}
      {[
        { p: [-3.965, 1.45, Math.PI / 2] as [number, number, number], y: 0.055 },
        { p: [3.965, 1.45, Math.PI / 2] as [number, number, number], y: 0.055 },
      ].map(({ p, y }, i) => (
        <mesh key={i} position={[p[0], y, p[1]]} rotation={[0, p[2], 0]}>
          <boxGeometry args={[5.7, 0.11, 0.025]} />
          <meshStandardMaterial color="#c4cbc8" roughness={0.55} />
        </mesh>
      ))}
      <mesh position={[0, 0.055, -1.255]}>
        <boxGeometry args={[7.9, 0.11, 0.025]} />
        <meshStandardMaterial color="#c4cbc8" roughness={0.55} />
      </mesh>

      <SafetyPanel />
      <WallDataPanel />
      <WallShelf x={1.75} />
      <WallShelf x={-1.5} />
      <StorageUnit x={-1.15} width={0.95} />
      <StorageUnit x={2.55} width={1.1} />

      {/* Porte */}
      <group position={[3.96, 1.08, 2.65]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <boxGeometry args={[0.92, 2.12, 0.045]} />
          <meshStandardMaterial color="#d5dad7" roughness={0.58} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <boxGeometry args={[0.82, 2.02, 0.018]} />
          <meshStandardMaterial color="#eef0eb" roughness={0.62} />
        </mesh>
        <mesh position={[-0.31, 0, 0.052]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.12, 16]} />
          <meshStandardMaterial color="#879192" metalness={0.82} roughness={0.26} />
        </mesh>
      </group>

      {/* Luminaires plafonniers */}
      {lights.map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 2.825, z]}>
          <RoundedBox args={[1.05, 0.025, 0.34]} radius={0.015} smoothness={3}>
            <meshStandardMaterial color="#c7cecb" metalness={0.35} roughness={0.45} />
          </RoundedBox>
          <mesh position={[0, -0.016, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.94, 0.25]} />
            <meshStandardMaterial color="#f5f6ee" emissive="#f4f6ec" emissiveIntensity={0.55} roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------- tables --------------------------------- */

export interface TableSpec {
  width: number;
  depth: number;
  top: number;
}

/** Paillasse TP1 — taille réduite par rapport à la version 1 (3,20 × 1,15 m). */
export const TP1_TABLE_SPEC: TableSpec = { width: 2.4, depth: 0.95, top: 0.92 };
/** Paillasse TP2 — second tableau, dédié à la calorimétrie. */
export const TP2_TABLE_SPEC: TableSpec = { width: 2.0, depth: 1.15, top: 0.9 };
export const TP2_ORIGIN: [number, number, number] = [-2.65, 0, 1.3];

export function BenchTable({
  position = [0, 0, 0],
  spec,
  accent = '#465153',
  stripes = true,
}: {
  position?: [number, number, number];
  spec: TableSpec;
  accent?: string;
  stripes?: boolean;
}) {
  const { width, depth, top } = spec;
  const legX = width / 2 - 0.18;
  const legZ = depth / 2 - 0.14;
  return (
    <group position={position}>
      <RoundedBox args={[width, 0.065, depth]} radius={0.018} smoothness={4} position={[0, top - 0.033, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e5e8e5" roughness={0.38} metalness={0.08} />
      </RoundedBox>
      {/* Bandeau avant avec liseré couleur (repère de paillasse). */}
      <mesh position={[0, top - 0.072, depth / 2 - 0.01]}>
        <boxGeometry args={[width - 0.08, 0.025, 0.016]} />
        <meshStandardMaterial color={accent} metalness={0.45} roughness={0.42} />
      </mesh>
      {stripes &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * (width / 2 - 0.02), top - 0.072, 0]}>
            <boxGeometry args={[0.012, 0.025, depth - 0.14]} />
            <meshStandardMaterial color={accent} metalness={0.45} roughness={0.42} />
          </mesh>
        ))}
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, (top - 0.07) / 2, 0]} castShadow>
            <boxGeometry args={[0.055, top - 0.07, 0.055]} />
            <meshStandardMaterial color="#aab2b2" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[0.042, 0.046, 0.035, 20]} />
            <meshStandardMaterial color="#333a3b" roughness={0.62} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.23, -legZ]}>
        <boxGeometry args={[width - 0.36, 0.035, 0.035]} />
        <meshStandardMaterial color="#9fa8a8" metalness={0.75} roughness={0.34} />
      </mesh>
      {/* Étagère basse : bidons d'eau distillée et boîte de câbles. */}
      <mesh position={[width * 0.18, 0.23, legZ * 0.6]} castShadow>
        <boxGeometry args={[0.22, 0.28, 0.2]} />
        <meshStandardMaterial color="#c9d6d2" transparent opacity={0.82} roughness={0.4} />
      </mesh>
      <mesh position={[width * 0.18, 0.382, legZ * 0.6]}>
        <cylinderGeometry args={[0.028, 0.028, 0.022, 16]} />
        <meshStandardMaterial color="#3f6f66" roughness={0.6} />
      </mesh>
    </group>
  );
}
