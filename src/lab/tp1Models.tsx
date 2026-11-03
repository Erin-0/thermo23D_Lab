/* --------------------------------------------------------------------------- *
 *  TP1 — maquette 3D : autocuiseur scellé, plaque chauffante, écran            *
 *                                                                             *
 *  Changements v2 :                                                            *
 *   · plus de robinet ni d'évier (l'eau est déjà dans la cuve) ;               *
 *   · cocotte immobile et scellée (aucune ouverture/contrôle du couvercle) ;   *
 *   · niveau d'eau visible par un tube de niveau latéral ;                     *
 *   · écran d'ordinateur relié à la cocotte (synthèse de toutes les infos).     *
 * --------------------------------------------------------------------------- */

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeElements } from '@react-three/fiber';
import { ATM_PRESSURE, type Quality } from './shared';
import { POT_ON_PLATE, TABLE_TOP, WATER_MAX, type Tp1Simulation } from './tp1';
import type { Tp2Simulation } from './tp2';
import {
  createBrushedMetalTexture,
  createDynamicScreen,
  createPressureGaugeTexture,
  createSteamSprite,
  drawAcquisitionScreen,
  drawTabletScreen,
  drawTemperatureScreen,
} from './screens';

const STEEL = '#aeb5b7';
const BAKELITE = '#171b1c';

export type ActionGroupProps = ThreeElements['group'] & {
  action: string;
  label: string;
  draggable?: boolean;
  children: ReactNode;
};

export function ActionGroup({ action, label, draggable = false, children, ...props }: ActionGroupProps) {
  return (
    <group {...props} userData={{ interaction: { id: action, label, draggable } }}>
      {children}
    </group>
  );
}

export function useSteelMaterial(quality: Quality) {
  const brushed = useMemo(() => createBrushedMetalTexture(quality === 'low' ? 0.5 : 1), [quality]);
  return useMemo(() => ({ map: brushed, roughnessMap: brushed }), [brushed]);
}

function seg(base: number, quality: Quality): number {
  return Math.max(10, Math.round(base * (quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1)));
}

/* ------------------------------- autocuiseur ------------------------------ */

function PotHandles({ quality }: { quality: Quality }) {
  const detail = seg(16, quality);
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.176, 0.158, 0]} rotation={[0, 0, side * -0.08]}>
          <RoundedBox args={[0.105, 0.047, 0.071]} radius={0.016} smoothness={quality === 'low' ? 2 : 4} castShadow>
            <meshStandardMaterial color={BAKELITE} roughness={0.38} metalness={0.05} />
          </RoundedBox>
          <mesh position={[-side * 0.038, -0.012, 0]} castShadow>
            <boxGeometry args={[0.025, 0.055, 0.08]} />
            <meshStandardMaterial color="#737b7d" metalness={0.85} roughness={0.28} />
          </mesh>
          {[-0.024, 0.024].map((z) => (
            <mesh key={z} position={[-side * 0.052, 0.007, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.006, 0.006, 0.003, detail]} />
              <meshStandardMaterial color="#c7cdcf" metalness={0.9} roughness={0.22} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

/** Eau contenue dans la cuve (visible quand le niveau descend sous le couvercle). */
function WaterBody({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const body = useRef<THREE.Mesh>(null);
  const surface = useRef<THREE.Mesh>(null);
  const transmit = quality === 'high';
  useFrame(() => {
    const s = sim.state;
    const height = Math.min(0.19, Math.max(0.002, s.water * 0.0255));
    if (body.current) {
      body.current.visible = s.water > 0.002;
      body.current.scale.y = height;
      body.current.position.y = 0.026 + height / 2;
    }
    if (surface.current) {
      surface.current.visible = s.water > 0.002;
      surface.current.position.y = 0.027 + height;
    }
  });
  return (
    <>
      <mesh ref={body} renderOrder={2}>
        <cylinderGeometry args={[0.128, 0.126, 1, seg(48, quality)]} />
        <meshPhysicalMaterial
          color="#7fb7c3"
          transparent
          opacity={0.5}
          roughness={0.08}
          metalness={0}
          transmission={transmit ? 0.22 : 0}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={surface} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
        <circleGeometry args={[0.127, seg(48, quality)]} />
        <meshPhysicalMaterial color="#a9d4db" transparent opacity={0.62} roughness={0.06} transmission={transmit ? 0.3 : 0} depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * Tube de niveau latéral : la cuve est scellée, le niveau d'eau se lit donc
 * par ce verre de niveau (comme sur un générateur de vapeur de laboratoire).
 */
function LevelGauge({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const column = useRef<THREE.Mesh>(null);
  const height = 0.2;
  useFrame(() => {
    const ratio = Math.max(0, Math.min(1, sim.state.water / WATER_MAX));
    if (!column.current) return;
    const h = Math.max(0.002, ratio * height);
    column.current.scale.y = h;
    column.current.position.y = -height / 2 + h / 2;
  });
  const detail = seg(20, quality);
  return (
    <group position={[0.163, 0.13, 0.012]}>
      {/* Deux piquages reliés à la cuve. */}
      {[height / 2 - 0.012, -height / 2 + 0.012].map((y) => (
        <mesh key={y} position={[-0.018, y, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.005, 0.005, 0.038, detail]} />
          <meshStandardMaterial color="#9aa2a4" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      <mesh castShadow>
        <cylinderGeometry args={[0.0125, 0.0125, height + 0.02, detail, 1, true]} />
        <meshPhysicalMaterial color="#dcecf0" transparent opacity={0.28} roughness={0.05} metalness={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group position={[0, 0, 0]}>
        <mesh ref={column} renderOrder={3}>
          <cylinderGeometry args={[0.0105, 0.0105, 1, detail]} />
          <meshBasicMaterial color="#7fc6d4" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </group>
      {/* Graduations litres. */}
      {Array.from({ length: 7 }, (_, i) => i).map((i) => (
        <mesh key={i} position={[0.014, -height / 2 + (i / 6) * height, 0]}>
          <boxGeometry args={[0.006, 0.0014, 0.0014]} />
          <meshBasicMaterial color="#5c6a6b" />
        </mesh>
      ))}
      <mesh position={[0, height / 2 + 0.014, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.012, detail]} />
        <meshStandardMaterial color="#7d8688" metalness={0.8} roughness={0.32} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.014, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 0.012, detail]} />
        <meshStandardMaterial color="#7d8688" metalness={0.8} roughness={0.32} />
      </mesh>
    </group>
  );
}

function PressureEye({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const face = useMemo(() => createPressureGaugeTexture(), []);
  const needle = useRef<THREE.Group>(null);
  useFrame(() => {
    const relative = sim.state.pressureAbs - ATM_PRESSURE;
    const clamped = Math.max(-1, Math.min(2, relative));
    const angle = ((135 - ((clamped + 1) / 3) * 270) * Math.PI) / 180;
    if (needle.current) needle.current.rotation.z += (-angle - needle.current.rotation.z) * 0.16;
  });
  const detail = seg(64, quality);
  return (
    <ActionGroup action="pressureGauge" label="Manomètre · clic : pression absolue / relative" position={[-0.076, 0.077, 0.066]} rotation={[-0.28, 0.06, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.035, detail]} />
        <meshStandardMaterial color="#30383a" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0, 0.019]}>
        <circleGeometry args={[0.0585, detail]} />
        <meshStandardMaterial map={face} roughness={0.78} metalness={0} />
      </mesh>
      <mesh position={[0, 0, 0.021]}>
        <torusGeometry args={[0.0605, 0.0042, 10, detail]} />
        <meshStandardMaterial color="#d2d7d8" metalness={0.94} roughness={0.16} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.024]}>
        <mesh position={[0, 0.019, 0]}>
          <boxGeometry args={[0.0024, 0.043, 0.0014]} />
          <meshStandardMaterial color="#c74435" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.009, 0]}>
          <boxGeometry args={[0.0035, 0.019, 0.0014]} />
          <meshStandardMaterial color="#7c2924" roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.026]}>
        <sphereGeometry args={[0.0062, 14, 10]} />
        <meshStandardMaterial color="#333b3d" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[-0.019, 0.024, 0.029]} rotation={[0, 0, -0.55]} renderOrder={4}>
        <planeGeometry args={[0.008, 0.052]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </ActionGroup>
  );
}

function TemperatureEye({ sim, quality, hz }: { sim: Tp1Simulation; quality: Quality; hz: number }) {
  const screen = useMemo(() => createDynamicScreen(768, 384, quality), [quality]);
  const lastDraw = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastDraw.current < 1 / hz) return;
    lastDraw.current = clock.elapsedTime;
    drawTemperatureScreen(screen, sim.state.temperature, true);
  });
  const detail = seg(64, quality);
  return (
    <ActionGroup action="temperatureGauge" label="Sonde Pt100 · affichage 0,1 °C" position={[0.076, 0.077, 0.066]} rotation={[-0.28, -0.06, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.035, detail]} />
        <meshStandardMaterial color="#30383a" metalness={0.88} roughness={0.24} />
      </mesh>
      <mesh position={[0, 0, 0.019]}>
        <circleGeometry args={[0.0585, detail]} />
        <meshStandardMaterial color="#06110f" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.021]} scale={[1, 0.54, 1]}>
        <planeGeometry args={[0.099, 0.099]} />
        <meshBasicMaterial map={screen.texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.024]}>
        <torusGeometry args={[0.0605, 0.0042, 10, detail]} />
        <meshStandardMaterial color="#d2d7d8" metalness={0.94} roughness={0.16} />
      </mesh>
      <mesh position={[-0.025, 0.018, 0.028]} rotation={[0, 0, -0.55]} renderOrder={4}>
        <planeGeometry args={[0.006, 0.048]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </ActionGroup>
  );
}

function Valve({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const control = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  useFrame(() => {
    if (control.current) control.current.rotation.y += ((-sim.state.valve * Math.PI * 2) / 3 - control.current.rotation.y) * 0.14;
    if (rotor.current) rotor.current.rotation.y = sim.state.valveSpin;
  });
  const detail = seg(32, quality);
  const marks = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202728';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#e2ded2';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('0 · 1 · 2', 128, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  return (
    <ActionGroup action="valve" label="Soupape 3 positions · clic = suivant, clic droit = précédent" position={[0, 0.035, -0.077]}>
      <mesh position={[0, 0.018, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.027, 0.038, detail]} />
        <meshStandardMaterial color="#747e80" metalness={0.9} roughness={0.24} />
      </mesh>
      <group ref={control} position={[0, 0.047, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.029, 0.025, 0.032, detail]} />
          <meshStandardMaterial color="#202728" roughness={0.34} metalness={0.18} />
        </mesh>
        <mesh position={[0, 0.0165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.052, 0.013]} />
          <meshBasicMaterial map={marks} transparent />
        </mesh>
      </group>
      <group ref={rotor} position={[0, 0.09, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.019, 0.022, 0.038, seg(24, quality)]} />
          <meshStandardMaterial color="#4c5557" metalness={0.82} roughness={0.29} />
        </mesh>
        <RoundedBox args={[0.052, 0.014, 0.016]} radius={0.005} smoothness={3} position={[0, 0.016, 0]} castShadow>
          <meshStandardMaterial color="#6b7476" metalness={0.85} roughness={0.25} />
        </RoundedBox>
        <mesh position={[0.024, 0.018, 0]}>
          <sphereGeometry args={[0.005, 10, 8]} />
          <meshStandardMaterial color="#d1d6d7" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </ActionGroup>
  );
}

function SealedLid({ sim, quality, hz }: { sim: Tp1Simulation; quality: Quality; hz: number }) {
  const steel = useSteelMaterial(quality);
  const detail = seg(64, quality);
  return (
    <group position={[POT_ON_PLATE.x, TABLE_TOP + 0.103 + 0.218, POT_ON_PLATE.z]}>
      <ActionGroup action="lid" label="Couvercle scellé — aucune manœuvre possible (sécurité)">
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.153, 0.149, 0.026, detail]} />
          <meshStandardMaterial color={STEEL} metalness={0.91} roughness={0.25} {...steel} />
        </mesh>
        <mesh position={[0, -0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.143, 0.006, 10, detail]} />
          <meshStandardMaterial color="#252a29" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.014, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.145, 0.003, 8, detail]} />
          <meshStandardMaterial color="#e0e4e5" metalness={0.95} roughness={0.18} />
        </mesh>
        <RoundedBox args={[0.19, 0.035, 0.042]} radius={0.014} smoothness={4} position={[0, 0.046, -0.13]} castShadow>
          <meshStandardMaterial color={BAKELITE} roughness={0.35} />
        </RoundedBox>
        {[-0.073, 0.073].map((x) => (
          <mesh key={x} position={[x, 0.025, -0.13]} castShadow>
            <boxGeometry args={[0.022, 0.045, 0.035]} />
            <meshStandardMaterial color="#252b2c" roughness={0.4} />
          </mesh>
        ))}
        {/* Bague de verrouillage : rappelle que la cocotte est scellée. */}
        <mesh position={[0, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.152, 0.0035, 8, detail]} />
          <meshStandardMaterial color="#8d9496" metalness={0.9} roughness={0.3} />
        </mesh>
        <PressureEye sim={sim} quality={quality} />
        <TemperatureEye sim={sim} quality={quality} hz={hz} />
        <Valve sim={sim} quality={quality} />
      </ActionGroup>
    </group>
  );
}

function SealedPot({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const steel = useSteelMaterial(quality);
  const detail = seg(64, quality);
  const marking = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = '#495255';
    ctx.font = '600 40px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8 L · INOX  —  CUVE SCELLÉE', 256, 34);
    ctx.font = '500 26px Arial, sans-serif';
    ctx.fillStyle = '#6c7678';
    ctx.fillText('eau : 1,00 L (consigne du livre)', 256, 72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  return (
    <group position={[POT_ON_PLATE.x, TABLE_TOP + 0.103, POT_ON_PLATE.z]}>
      <ActionGroup action="cooker" label="Autocuiseur 8 L scellé et immobile sur sa plaque">
        <mesh position={[0, 0.122, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.147, 0.137, 0.218, detail, 1, true]} />
          <meshStandardMaterial color={STEEL} metalness={0.9} roughness={0.26} side={THREE.DoubleSide} {...steel} />
        </mesh>
        <mesh position={[0, 0.122, 0]} scale={[0.958, 0.97, 0.958]}>
          <cylinderGeometry args={[0.147, 0.137, 0.218, detail, 1, true]} />
          <meshStandardMaterial color="#889193" metalness={0.82} roughness={0.34} side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, 0.018, 0]} receiveShadow>
          <cylinderGeometry args={[0.137, 0.137, 0.025, detail]} />
          <meshStandardMaterial color="#777f81" metalness={0.88} roughness={0.33} />
        </mesh>
        <mesh position={[0, 0.232, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.145, 0.006, 10, detail]} />
          <meshStandardMaterial color="#d4d9da" metalness={0.94} roughness={0.17} />
        </mesh>
        <mesh position={[0, 0.017, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.134, 0.004, 8, detail]} />
          <meshStandardMaterial color="#3e4648" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.126, 0.1485]}>
          <planeGeometry args={[0.2, 0.038]} />
          <meshBasicMaterial map={marking} transparent />
        </mesh>
        <PotHandles quality={quality} />
        <WaterBody sim={sim} quality={quality} />
        <LevelGauge sim={sim} quality={quality} />
        {/* Câbles des capteurs qui descendent vers l'écran d'acquisition. */}
        <SensorCable />
      </ActionGroup>
    </group>
  );
}

function SensorCable() {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(POT_ON_PLATE.x - 0.1, TABLE_TOP + 0.19, POT_ON_PLATE.z + 0.1),
        new THREE.Vector3(POT_ON_PLATE.x - 0.26, TABLE_TOP + 0.09, POT_ON_PLATE.z + 0.16),
        new THREE.Vector3(-0.34, TABLE_TOP + 0.035, 0.02),
        new THREE.Vector3(-0.62, TABLE_TOP + 0.05, -0.16),
        new THREE.Vector3(-0.82, TABLE_TOP + 0.22, -0.28),
      ]),
    [],
  );
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.0042, 6, false), [curve]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#2c3a3c" roughness={0.6} />
    </mesh>
  );
}

interface Particle {
  age: number;
  life: number;
  velocity: THREE.Vector3;
  drift: number;
}

function SteamPlume({ sim, kind, quality }: { sim: Tp1Simulation; kind: 'valve' | 'open'; quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const sprite = useMemo(() => createSteamSprite(), []);
  const baseCount = kind === 'valve' ? 72 : 48;
  const count = Math.max(10, Math.round(baseCount * (quality === 'low' ? 0.35 : quality === 'medium' ? 0.65 : 1)));
  const { geometry, particles, positions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const parts: Particle[] = [];
    for (let i = 0; i < count; i += 1) {
      pos[i * 3 + 1] = -20;
      parts.push({ age: 10, life: 1, velocity: new THREE.Vector3(), drift: Math.random() * 6.28 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return { geometry: geo, particles: parts, positions: pos };
  }, [count]);

  useFrame((_, delta) => {
    const s = sim.state;
    // Cocotte toujours fermée : seul le jet de soupape est actif.
    const active = kind === 'valve' ? s.ventRate > 0.000004 : false;
    const intensity =
      kind === 'valve'
        ? Math.min(1, s.ventRate * 18000 + Math.max(0, s.pressureAbs - ATM_PRESSURE - 0.04) * 0.3)
        : 0;
    if (points.current) {
      points.current.visible = kind === 'valve';
      points.current.position.set(POT_ON_PLATE.x, TABLE_TOP + 0.103 + 0.338, POT_ON_PLATE.z - 0.077);
    }
    if (material.current) material.current.opacity = active ? 0.12 + intensity * 0.28 : 0;
    const dt = Math.min(delta, 0.04) * Math.min(3, s.speed);
    for (let i = 0; i < count; i += 1) {
      const p = particles[i];
      p.age += dt;
      const idx = i * 3;
      if (p.age > p.life) {
        if (active && Math.random() < intensity * 0.3 + 0.025) {
          p.age = 0;
          p.life = 0.65 + Math.random() * 1.3;
          positions[idx] = (Math.random() - 0.5) * 0.009;
          positions[idx + 1] = 0;
          positions[idx + 2] = (Math.random() - 0.5) * 0.009;
          const jet = 0.32 + intensity * 0.65;
          p.velocity.set((Math.random() - 0.5) * 0.055, jet * (0.7 + Math.random() * 0.5), (Math.random() - 0.5) * 0.055);
        } else {
          positions[idx + 1] = -20;
        }
      } else {
        positions[idx] += (p.velocity.x + Math.sin(p.age * 4 + p.drift) * 0.025) * dt;
        positions[idx + 1] += p.velocity.y * dt;
        positions[idx + 2] += (p.velocity.z + Math.cos(p.age * 3 + p.drift) * 0.02) * dt;
        p.velocity.y *= Math.exp(-dt * 0.6);
        p.velocity.x *= Math.exp(-dt * 0.4);
      }
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} renderOrder={6}>
      <pointsMaterial
        ref={material}
        map={sprite}
        size={0.065}
        transparent
        opacity={0}
        depthWrite={false}
        color="#eef5f4"
        sizeAttenuation
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export function PressureCooker({ sim, quality, hz }: { sim: Tp1Simulation; quality: Quality; hz: number }) {
  return (
    <>
      <SealedPot sim={sim} quality={quality} />
      <SealedLid sim={sim} quality={quality} hz={hz} />
      <SteamPlume sim={sim} kind="valve" quality={quality} />
    </>
  );
}

/* ------------------------------ plaque chauffante -------------------------- */

function HotplateDialScale() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 512);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let n = 0; n <= 6; n += 1) {
      const angle = (-125 + n * (250 / 6)) * (Math.PI / 180);
      const x = 256 + Math.sin(angle) * 192;
      const y = 256 - Math.cos(angle) * 192;
      ctx.fillStyle = n === 6 ? '#9c4138' : '#303638';
      ctx.font = `${n === 6 ? '700' : '500'} 48px Arial`;
      ctx.fillText(String(n), x, y);
      ctx.beginPath();
      ctx.moveTo(256 + Math.sin(angle) * 140, 256 - Math.cos(angle) * 140);
      ctx.lineTo(256 + Math.sin(angle) * 155, 256 - Math.cos(angle) * 155);
      ctx.strokeStyle = '#4e5556';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
  return (
    <mesh position={[-0.09, 0.034, 0.224]}>
      <planeGeometry args={[0.15, 0.15]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

export function Hotplate({ sim, quality }: { sim: Tp1Simulation; quality: Quality }) {
  const knob = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const coil = useRef<THREE.MeshStandardMaterial>(null);
  const detail = seg(64, quality);
  useFrame(() => {
    const s = sim.state;
    if (knob.current) knob.current.rotation.z += ((-(-125 + s.heaterLevel * (250 / 6)) * Math.PI) / 180 - knob.current.rotation.z) * 0.16;
    if (led.current) {
      const on = s.plugged && s.heaterLevel > 0;
      led.current.emissiveIntensity = on ? 1.45 : 0;
      led.current.color.set(on ? '#b73127' : '#4b2522');
    }
    if (coil.current) {
      const heat = Math.max(0, Math.min(1, (s.plateTemperature - 90) / 240));
      coil.current.emissive.setRGB(heat * 0.55, heat * 0.055, 0);
      coil.current.emissiveIntensity = heat * 0.75;
    }
  });
  return (
    <group position={[POT_ON_PLATE.x, TABLE_TOP, POT_ON_PLATE.z]}>
      {[0, 1, 2, 3].map((n) => {
        const x = n % 2 === 0 ? -0.18 : 0.18;
        const z = n < 2 ? -0.15 : 0.15;
        return (
          <mesh key={n} position={[x, 0.008, z]}>
            <cylinderGeometry args={[0.018, 0.022, 0.018, seg(16, quality)]} />
            <meshStandardMaterial color="#1e2223" roughness={0.7} />
          </mesh>
        );
      })}
      <RoundedBox args={[0.48, 0.062, 0.43]} radius={0.018} smoothness={4} position={[0, 0.04, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#dadbd5" roughness={0.34} metalness={0.26} />
      </RoundedBox>
      <mesh position={[0, 0.077, -0.005]} castShadow>
        <cylinderGeometry args={[0.182, 0.182, 0.024, detail]} />
        <meshStandardMaterial color="#2c3030" metalness={0.72} roughness={0.48} />
      </mesh>
      {[0.038, 0.071, 0.104, 0.137].map((r) => (
        <mesh key={r} position={[0, 0.094, -0.005]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.008, 8, detail]} />
          <meshStandardMaterial ref={r === 0.038 ? coil : undefined} color="#333737" metalness={0.78} roughness={0.43} emissive="#000000" />
        </mesh>
      ))}
      <mesh position={[0, 0.034, 0.218]}>
        <planeGeometry args={[0.41, 0.052]} />
        <meshStandardMaterial color="#c4c7c2" roughness={0.5} metalness={0.18} />
      </mesh>
      <HotplateDialScale />
      <ActionGroup action="heaterKnob" label="Bouton plaque · clic = +1 / clic droit = −1" position={[-0.09, 0.034, 0.237]}>
        <group ref={knob}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.029, 0.033, 0.028, seg(32, quality)]} />
            <meshStandardMaterial color="#202425" roughness={0.32} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.017, 0.016]}>
            <boxGeometry args={[0.004, 0.019, 0.003]} />
            <meshStandardMaterial color="#f1eee4" roughness={0.5} />
          </mesh>
        </group>
      </ActionGroup>
      <mesh position={[0.115, 0.036, 0.228]}>
        <sphereGeometry args={[0.009, 14, 10]} />
        <meshStandardMaterial ref={led} color="#4b2522" emissive="#ff382b" emissiveIntensity={0} roughness={0.24} />
      </mesh>
      <ActionGroup action="plateConnector" label="Connecteur d’alimentation · clic = saisir le câble" position={[-0.16, 0.039, -0.226]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.027, seg(24, quality)]} />
          <meshStandardMaterial color="#191d1e" roughness={0.48} />
        </mesh>
        <mesh position={[0, 0, -0.017]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.014, 0.003, 6, seg(24, quality)]} />
          <meshStandardMaterial color="#555d5f" metalness={0.7} roughness={0.35} />
        </mesh>
      </ActionGroup>
    </group>
  );
}

export function PowerCable({ sim }: { sim: Tp1Simulation }) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(POT_ON_PLATE.x - 0.16, TABLE_TOP + 0.04, POT_ON_PLATE.z - 0.245),
        new THREE.Vector3(-0.05, TABLE_TOP + 0.02, -0.48),
        new THREE.Vector3(0.35, 0.79, -0.73),
        new THREE.Vector3(0.64, 0.9, -0.95),
        new THREE.Vector3(0.74, 1.18, -1.19),
      ]),
    [],
  );
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.007, 6, false), [curve]);
  const plugged = sim.state.plugged;
  return (
    <>
      {plugged && (
        <mesh geometry={geometry} castShadow>
          <meshStandardMaterial color="#161a1b" roughness={0.53} metalness={0.04} />
        </mesh>
      )}
      {plugged && (
        <group position={[0.74, 1.18, -1.17]}>
          <RoundedBox args={[0.052, 0.065, 0.045]} radius={0.012} smoothness={3}>
            <meshStandardMaterial color="#1b1f20" roughness={0.44} />
          </RoundedBox>
        </group>
      )}
      {sim.state.cablePending && <CableInHand />}
    </>
  );
}

/** Câble tenu en main : une extrémité sur le connecteur, l'autre suit la caméra. */
function CableInHand() {
  const { camera } = useThree();
  const [points, setPoints] = useState<[number, number, number][]>([]);
  const last = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.07) return;
    last.current = clock.elapsedTime;
    const start = new THREE.Vector3(POT_ON_PLATE.x - 0.16, TABLE_TOP + 0.05, POT_ON_PLATE.z - 0.245);
    const end = camera.position.clone();
    end.y -= 0.16;
    const next: [number, number, number][] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = start.clone().lerp(end, t);
      point.y -= Math.sin(Math.PI * t) * 0.17;
      next.push([point.x, point.y, point.z]);
    }
    setPoints(next);
  });
  if (points.length < 2) return null;
  return <Line points={points} color="#7fa8a2" lineWidth={1.6} dashed dashSize={0.035} gapSize={0.025} transparent opacity={0.72} />;
}

export function WallOutlet({ sim }: { sim: Tp1Simulation }) {
  return (
    <ActionGroup action="outlet" label="Prise murale 230 V · clic = terminer le câblage" position={[0.74, 1.2, -1.225]}>
      <RoundedBox args={[0.115, 0.145, 0.018]} radius={0.012} smoothness={4} castShadow>
        <meshStandardMaterial color="#e7e8e3" roughness={0.48} />
      </RoundedBox>
      <mesh position={[0, 0, 0.013]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.039, 0.039, 0.008, 32]} />
        <meshStandardMaterial color="#c9ccc8" roughness={0.48} />
      </mesh>
      {[[-0.013, 0.007], [0.013, 0.007]].map(([x, y]) => (
        <mesh key={x} position={[x, y, 0.019]}>
          <circleGeometry args={[0.004, 12]} />
          <meshBasicMaterial color="#272d2e" />
        </mesh>
      ))}
      <mesh position={[0, -0.019, 0.019]}>
        <boxGeometry args={[0.005, 0.012, 0.002]} />
        <meshStandardMaterial color="#8b9291" metalness={0.6} />
      </mesh>
      {sim.state.cablePending && (
        <mesh position={[0, 0, 0.024]}>
          <ringGeometry args={[0.052, 0.056, 32]} />
          <meshBasicMaterial color="#4f9b8b" transparent opacity={0.8} />
        </mesh>
      )}
    </ActionGroup>
  );
}

export function Tablet({ sim, quality, hz }: { sim: Tp1Simulation; quality: Quality; hz: number }) {
  const screen = useMemo(() => createDynamicScreen(900, 540, quality), [quality]);
  const lastDraw = useRef(0);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastDraw.current < 1 / hz) return;
    lastDraw.current = clock.elapsedTime;
    drawTabletScreen(screen, sim.state.timer, sim.state.timerRunning, sim.state.temperature);
  });
  return (
    <ActionGroup action="tablet" label="Chronomètre-tablette · clic = pause/reprise, clic droit = zéro" position={[0.78, TABLE_TOP + 0.025, 0.14]} rotation={[-Math.PI / 2 + 0.12, 0, -0.08]}>
      <RoundedBox args={[0.36, 0.25, 0.015]} radius={0.018} smoothness={5} castShadow>
        <meshStandardMaterial color="#20272a" metalness={0.65} roughness={0.28} />
      </RoundedBox>
      <mesh position={[0, 0, 0.009]}>
        <planeGeometry args={[0.326, 0.215]} />
        <meshBasicMaterial map={screen.texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.117, 0.009]}>
        <circleGeometry args={[0.0035, 12]} />
        <meshStandardMaterial color="#080b0c" metalness={0.4} roughness={0.18} />
      </mesh>
    </ActionGroup>
  );
}

/* ------------------------ écran d'ordinateur (synthèse) ------------------- */

export function AcquisitionMonitor({
  tp1,
  tp2,
  bench,
  quality,
  hz,
  position = [-0.82, TABLE_TOP, -0.27],
  rotationY = 0.42,
}: {
  tp1: Tp1Simulation;
  tp2: Tp2Simulation;
  bench: 'tp1' | 'tp2';
  quality: Quality;
  hz: number;
  position?: [number, number, number];
  rotationY?: number;
}) {
  const screen = useMemo(() => createDynamicScreen(1180, 664, quality), [quality]);
  const lastDraw = useRef(0);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (led.current) led.current.emissiveIntensity = 1.1 + Math.sin(clock.elapsedTime * 2.4) * 0.16;
    if (clock.elapsedTime - lastDraw.current < 1 / hz) return;
    lastDraw.current = clock.elapsedTime;
    drawAcquisitionScreen(screen, tp1.state, tp2.state, bench);
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Pied et colonne */}
      <mesh position={[0, 0.008, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.11, 0.13, 0.016, 24]} />
        <meshStandardMaterial color="#2b3234" metalness={0.55} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.13, -0.01]} castShadow>
        <boxGeometry args={[0.05, 0.24, 0.04]} />
        <meshStandardMaterial color="#343c3e" metalness={0.6} roughness={0.38} />
      </mesh>
      {/* Écran */}
      <group position={[0, 0.36, 0]} rotation={[-0.09, 0, 0]}>
        <RoundedBox args={[0.66, 0.4, 0.028]} radius={0.008} smoothness={4} castShadow>
          <meshStandardMaterial color="#232a2c" metalness={0.5} roughness={0.42} />
        </RoundedBox>
        <ActionGroup action="monitor" label="Écran d’acquisition · clic : synthèse des grandeurs" position={[0, 0, 0.016]}>
          <mesh>
            <planeGeometry args={[0.615, 0.352]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        </ActionGroup>
        <mesh position={[0, -0.182, 0.015]}>
          <planeGeometry args={[0.6, 0.016]} />
          <meshStandardMaterial color="#1b2122" roughness={0.6} />
        </mesh>
        <mesh position={[0.27, -0.182, 0.018]}>
          <sphereGeometry args={[0.004, 10, 8]} />
          <meshStandardMaterial ref={led} color="#2f6b58" emissive="#7ef0c0" emissiveIntensity={1} roughness={0.3} />
        </mesh>
      </group>
      {/* Unité centrale + câble vers la cocotte */}
      <group position={[0.3, 0.11, -0.06]}>
        <RoundedBox args={[0.1, 0.22, 0.24]} radius={0.008} smoothness={3} castShadow>
          <meshStandardMaterial color="#2a3133" metalness={0.45} roughness={0.45} />
        </RoundedBox>
        <mesh position={[-0.051, 0.04, 0]}>
          <circleGeometry args={[0.012, 16]} />
          <meshStandardMaterial color="#4d5a5c" metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
      <MonitorCable />
      {/* Clavier et souris */}
      <group position={[0.02, 0.018, 0.3]}>
        <RoundedBox args={[0.34, 0.012, 0.12]} radius={0.004} smoothness={3} castShadow>
          <meshStandardMaterial color="#313a3c" roughness={0.55} />
        </RoundedBox>
        <mesh position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.31, 0.095]} />
          <meshStandardMaterial color="#1d2426" roughness={0.7} />
        </mesh>
      </group>
      <mesh position={[0.26, 0.021, 0.3]} castShadow>
        <sphereGeometry args={[0.022, 14, 10]} />
        <meshStandardMaterial color="#2c3436" roughness={0.5} />
      </mesh>
    </group>
  );
}

function MonitorCable() {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.82, TABLE_TOP + 0.22, -0.28),
        new THREE.Vector3(-0.7, TABLE_TOP + 0.06, -0.2),
        new THREE.Vector3(-0.34, TABLE_TOP + 0.03, -0.02),
        new THREE.Vector3(POT_ON_PLATE.x - 0.2, TABLE_TOP + 0.06, POT_ON_PLATE.z + 0.12),
        new THREE.Vector3(POT_ON_PLATE.x - 0.1, TABLE_TOP + 0.19, POT_ON_PLATE.z + 0.1),
      ]),
    [],
  );
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 36, 0.0045, 6, false), [curve]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#22292b" roughness={0.62} />
    </mesh>
  );
}

