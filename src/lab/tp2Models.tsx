/* --------------------------------------------------------------------------- *
 *  TP2 — Calorimétrie : maquette 3D de la paillasse                            *
 *                                                                             *
 *  Trois appareils principaux, comme en salle :                                *
 *    1. l'alimentation continue (avec interrupteur de circuit),                *
 *    2. l'ampèremètre analogique,                                              *
 *    3. le voltmètre analogique,                                               *
 *  plus le grand cylindre : le calorimètre adiabatique (résistance chauffante,  *
 *  agitateur, thermomètre, vase). Verrerie : béchers, éprouvettes, flacon.      *
 *                                                                             *
 *  Câblage : un clic sur une borne met le fil « en main » ; le clic suivant le  *
 *  connecte automatiquement à la borne visée (aucun second point exposé).       *
 * --------------------------------------------------------------------------- */

import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Quality } from './shared';
import {
  COPPER_MASS,
  METER_DIVISIONS,
  REQUIRED_LINKS,
  RESISTOR_R,
  TARGET_HEATING_TIME,
  VESSEL_MASS,
  balanceReading,
  meterDivisions,
  type TerminalId,
  type Tp2Simulation,
} from './tp2';
import { ActionGroup, useSteelMaterial } from './tp1Models';
import { TP2_ORIGIN } from './room';
import {
  createDynamicScreen,
  createMeterFaceTexture,
  drawBalanceScreen,
  drawChronoScreen,
  drawGeneratorScreen,
  drawThermometerScreen,
} from './screens';

const TOP = 0.9; // hauteur de la paillasse TP2
const BODY = '#d9dad4';
const DARK = '#22292b';
const COPPER_COLOR = '#b4703f';

function seg(base: number, quality: Quality): number {
  return Math.max(10, Math.round(base * (quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1)));
}

/* ------------------------------- positions ------------------------------- */

const L = {
  generator: [-0.7, -0.33] as [number, number],
  ammeter: [-0.42, -0.33] as [number, number],
  voltmeter: [-0.05, -0.33] as [number, number],
  calorimeter: [-0.52, 0.06] as [number, number],
  balance: [-0.02, 0.24] as [number, number],
  heater: [0.62, -0.3] as [number, number],
  beaker: [0.62, -0.3] as [number, number],
  chronometer: [-0.86, 0.3] as [number, number],
  copper: [0.4, 0.36] as [number, number],
  cylinder: [0.7, 0.2] as [number, number],
  flask: [0.88, 0.32] as [number, number],
  benchVessel: [0.36, -0.02] as [number, number],
};

/** Bornes : position locale (x, y, z) par rapport à l'origine de la paillasse. */
const TERMINAL_POS: Record<TerminalId, [number, number, number]> = {
  genP: [L.generator[0] + 0.125, TOP + 0.086, L.generator[1] + 0.1],
  genN: [L.generator[0] + 0.165, TOP + 0.086, L.generator[1] + 0.1],
  swA: [L.generator[0] - 0.15, TOP + 0.098, L.generator[1] + 0.09],
  swB: [L.generator[0] - 0.11, TOP + 0.098, L.generator[1] + 0.09],
  ammA: [L.ammeter[0] - 0.055, TOP + 0.062, L.ammeter[1] + 0.09],
  ammB: [L.ammeter[0] + 0.055, TOP + 0.062, L.ammeter[1] + 0.09],
  voltP: [L.voltmeter[0] - 0.075, TOP + 0.062, L.voltmeter[1] + 0.09],
  voltN: [L.voltmeter[0] + 0.075, TOP + 0.062, L.voltmeter[1] + 0.09],
  coilA: [L.calorimeter[0] + 0.085, TOP + 0.045, L.calorimeter[1] + 0.15],
  coilB: [L.calorimeter[0] + 0.145, TOP + 0.045, L.calorimeter[1] + 0.15],
};

export function terminalWorld(id: TerminalId): [number, number, number] {
  const local = TERMINAL_POS[id];
  return [TP2_ORIGIN[0] + local[0], local[1], TP2_ORIGIN[2] + local[2]];
}

/** Chemins de câblage (points locaux) : évitent les appareils posés sur la table. */
const WIRE_WAYPOINTS: Partial<Record<string, [number, number, number][]>> = {
  'ammB-coilA': [
    [L.ammeter[0] + 0.055, TOP + 0.062, L.ammeter[1] + 0.09],
    [L.ammeter[0] + 0.12, TOP + 0.1, L.ammeter[1] + 0.17],
    [L.calorimeter[0] - 0.02, TOP + 0.09, L.calorimeter[1] + 0.22],
    [L.calorimeter[0] + 0.085, TOP + 0.045, L.calorimeter[1] + 0.15],
  ],
  'coilB-swA': [
    [L.calorimeter[0] + 0.145, TOP + 0.045, L.calorimeter[1] + 0.15],
    [L.calorimeter[0] + 0.24, TOP + 0.06, L.calorimeter[1] + 0.02],
    [L.calorimeter[0] + 0.25, TOP + 0.13, L.calorimeter[1] - 0.14],
    [L.voltmeter[0] + 0.16, TOP + 0.13, L.voltmeter[1] + 0.02],
    [L.generator[0] - 0.06, TOP + 0.12, L.generator[1] + 0.06],
    [L.generator[0] - 0.15, TOP + 0.098, L.generator[1] + 0.09],
  ],
  'coilA-voltP': [
    [L.calorimeter[0] + 0.085, TOP + 0.045, L.calorimeter[1] + 0.15],
    [L.calorimeter[0] + 0.14, TOP + 0.05, L.calorimeter[1] + 0.28],
    [L.voltmeter[0] - 0.13, TOP + 0.05, L.voltmeter[1] + 0.22],
    [L.voltmeter[0] - 0.075, TOP + 0.062, L.voltmeter[1] + 0.09],
  ],
  'coilB-voltN': [
    [L.calorimeter[0] + 0.145, TOP + 0.045, L.calorimeter[1] + 0.15],
    [L.calorimeter[0] + 0.2, TOP + 0.05, L.calorimeter[1] + 0.26],
    [L.voltmeter[0] + 0.1, TOP + 0.05, L.voltmeter[1] + 0.2],
    [L.voltmeter[0] + 0.075, TOP + 0.062, L.voltmeter[1] + 0.09],
  ],
};

function wirePoints(a: TerminalId, b: TerminalId): [number, number, number][] {
  const key = `${a}-${b}`;
  const custom = WIRE_WAYPOINTS[key] ?? WIRE_WAYPOINTS[`${b}-${a}`];
  if (custom) return custom.map(([x, y, z]) => [TP2_ORIGIN[0] + x, y, TP2_ORIGIN[2] + z]);
  const pa = terminalWorld(a);
  const pb = terminalWorld(b);
  const mid: [number, number, number] = [(pa[0] + pb[0]) / 2, Math.min(pa[1], pb[1]) - 0.035, (pa[2] + pb[2]) / 2];
  return [pa, mid, pb];
}

/* ------------------------------ calorimètre ------------------------------- */

function Calorimeter({ sim, quality, hz }: { sim: Tp2Simulation; quality: Quality; hz: number }) {
  const lid = useRef<THREE.Group>(null);
  const stirrer = useRef<THREE.Group>(null);
  const coilMat = useRef<THREE.MeshStandardMaterial>(null);
  const thermoScreen = useMemo(() => createDynamicScreen(420, 180, quality), [quality]);
  const lastDraw = useRef(0);
  const steel = useSteelMaterial(quality);
  const detail = seg(48, quality);
  const [x, z] = L.calorimeter;

  useFrame(({ clock }) => {
    const s = sim.state;
    if (lid.current) {
      const targetY = TOP + (s.lidClosed ? 0.288 : 0.5);
      lid.current.position.y += (targetY - lid.current.position.y) * 0.16;
      lid.current.position.x = s.lidClosed ? 0 : 0.19;
    }
    if (stirrer.current) stirrer.current.rotation.y = s.stirAngle;
    if (coilMat.current) {
      const heat = Math.max(0, Math.min(1, s.resistorPower / 26));
      coilMat.current.emissive.setRGB(heat * 0.75, heat * 0.16, heat * 0.04);
      coilMat.current.emissiveIntensity = heat;
    }
    if (clock.elapsedTime - lastDraw.current >= 1 / hz) {
      lastDraw.current = clock.elapsedTime;
      drawThermometerScreen(thermoScreen, sim.displayedTemperature(), s.thermometerIn);
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Enceinte adiabatique : grand cylindre à double paroi. */}
      <ActionGroup action="calorimeterBody" label="Calorimètre adiabatique · clic droit = poser/retirer le vase">
        <mesh position={[0, TOP + 0.145, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.14, 0.146, 0.29, detail, 1, true]} />
          <meshStandardMaterial color="#c8cfcc" metalness={0.55} roughness={0.34} side={THREE.DoubleSide} {...steel} />
        </mesh>
        <mesh position={[0, TOP + 0.005, 0]} receiveShadow>
          <cylinderGeometry args={[0.146, 0.15, 0.02, detail]} />
          <meshStandardMaterial color="#9aa3a2" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, TOP + 0.29, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.14, 0.006, 8, detail]} />
          <meshStandardMaterial color="#b6bebc" metalness={0.8} roughness={0.25} />
        </mesh>
        {/* Bande d'identification */}
        <mesh position={[0, TOP + 0.235, 0]}>
          <cylinderGeometry args={[0.1415, 0.1415, 0.032, detail, 1, true]} />
          <meshStandardMaterial color="#3c6b62" metalness={0.2} roughness={0.55} side={THREE.DoubleSide} />
        </mesh>
        {/* Socle et pieds */}
        {[-0.09, 0.09].map((px) =>
          [-0.09, 0.09].map((pz) => (
            <mesh key={`${px}-${pz}`} position={[px, TOP + 0.008, pz]}>
              <cylinderGeometry args={[0.014, 0.017, 0.016, seg(12, quality)]} />
              <meshStandardMaterial color="#2f3638" roughness={0.7} />
            </mesh>
          )),
        )}
      </ActionGroup>

      {/* Bornier de la résistance chauffante */}
      <group position={[0.115, TOP + 0.03, 0.145]}>
        <RoundedBox args={[0.09, 0.03, 0.05]} radius={0.006} smoothness={3} castShadow>
          <meshStandardMaterial color="#2b2118" roughness={0.55} />
        </RoundedBox>
        <Terminal id="coilA" label="Borne haute de la résistance R" color="#c0453a" wireInHand={sim.state.wireInHand} sim={sim} local={[0.03 - 0.115 + 0.0, 0.015 - 0.03, 0.005]} />
        <Terminal id="coilB" label="Borne basse de la résistance R" color="#3d4648" wireInHand={sim.state.wireInHand} sim={sim} local={[0.09 - 0.115, 0.015 - 0.03, 0.005]} />
      </group>

      {/* Vase calorimétrique + résistance + agitateur (visibles couvercle ouvert) */}
      <VesselInCalorimeter sim={sim} quality={quality} />

      {/* Couvercle */}
      <group ref={lid} position={[0, TOP + 0.288, 0]}>
        <ActionGroup action="calorimeterLid" label="Couvercle du calorimètre · clic = ouvrir, clic droit = fermer">
          <mesh castShadow>
            <cylinderGeometry args={[0.146, 0.144, 0.018, detail]} />
            <meshStandardMaterial color="#b9c1bf" metalness={0.72} roughness={0.3} {...steel} />
          </mesh>
          <mesh position={[0, 0.011, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.145, 0.004, 8, detail]} />
            <meshStandardMaterial color="#d5dbd9" metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Trois orifices : thermomètre, agitateur, résistance. */}
          {([
            { x: 0.055, z: 0, key: 'thermo' },
            { x: -0.05, z: 0.03, key: 'stir' },
            { x: 0.02, z: -0.07, key: 'coil' },
          ] as const).map(({ x: ox, z: oz, key }) => (
            <mesh key={key} position={[ox, 0.009, oz]}>
              <cylinderGeometry args={[0.011, 0.011, 0.02, seg(16, quality)]} />
              <meshStandardMaterial color="#2c3335" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.03, -0.1]}>
            <boxGeometry args={[0.05, 0.022, 0.03]} />
            <meshStandardMaterial color={DARK} roughness={0.45} />
          </mesh>
        </ActionGroup>

        {/* Thermomètre 0-110 °C au 1/10, avec répétiteur */}
        <group position={[0.055, 0, 0]}>
          <ActionGroup action="thermometer" label="Thermomètre · clic = consigner θ, clic droit = le retirer / le mettre">
            <mesh position={[0, -0.13, 0]}>
              <cylinderGeometry args={[0.0035, 0.0035, 0.26, seg(10, quality)]} />
              <meshPhysicalMaterial color="#dfeef0" transparent opacity={0.55} roughness={0.06} />
            </mesh>
            <mesh position={[0, -0.255, 0]}>
              <sphereGeometry args={[0.007, seg(14, quality), 10]} />
              <meshStandardMaterial color="#c9402f" roughness={0.35} />
            </mesh>
            <mesh position={[0, -0.13, 0]}>
              <cylinderGeometry args={[0.0016, 0.0016, 0.26, 6]} />
              <meshStandardMaterial color="#c9402f" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.055, 0]} castShadow>
              <cylinderGeometry args={[0.013, 0.013, 0.11, seg(16, quality)]} />
              <meshStandardMaterial color="#e6e3d8" roughness={0.45} />
            </mesh>
            {/* Répériteur numérique : lecture au 1/10 sans erreur de parallaxe. */}
            <mesh position={[0, 0.055, 0.0135]} rotation={[0, 0, 0]}>
              <planeGeometry args={[0.024, 0.012]} />
              <meshBasicMaterial map={thermoScreen.texture} toneMapped={false} />
            </mesh>
          </ActionGroup>
        </group>

        {/* Agitateur */}
        <group position={[-0.05, 0, 0.03]}>
          <ActionGroup action="stirrer" label="Agitateur · clic = agiter / arrêter">
            <mesh position={[0, 0.035, 0]} castShadow>
              <cylinderGeometry args={[0.006, 0.006, 0.07, seg(12, quality)]} />
              <meshStandardMaterial color="#3a4244" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.074, 0]}>
              <sphereGeometry args={[0.012, seg(14, quality), 10]} />
              <meshStandardMaterial color={DARK} roughness={0.4} />
            </mesh>
            <group ref={stirrer} position={[0, -0.14, 0]}>
              <mesh>
                <cylinderGeometry args={[0.0032, 0.0032, 0.24, seg(8, quality)]} />
                <meshStandardMaterial color="#c3cbcc" metalness={0.85} roughness={0.25} />
              </mesh>
              <mesh position={[0, -0.11, 0]} rotation={[0, 0, Math.PI / 2]}>
                <boxGeometry args={[0.004, 0.05, 0.014]} />
                <meshStandardMaterial color="#c3cbcc" metalness={0.85} roughness={0.25} />
              </mesh>
            </group>
          </ActionGroup>
        </group>
      </group>

      {/* Résistance chauffante immergée (visible à travers le vase) */}
      <group position={[0.02, TOP + 0.12, -0.07]}>
        <mesh>
          <cylinderGeometry args={[0.012, 0.012, 0.14, seg(14, quality)]} />
          <meshStandardMaterial ref={coilMat} color="#6d7375" metalness={0.7} roughness={0.4} emissive="#000000" />
        </mesh>
        {[0.02, 0.045, 0.07].map((y) => (
          <mesh key={y} position={[0, -0.05 + y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.014, 0.0022, 6, seg(20, quality)]} />
            <meshStandardMaterial color="#8d9496" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function VesselInCalorimeter({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const water = useRef<THREE.Mesh>(null);
  const detail = seg(40, quality);
  useFrame(() => {
    const s = sim.state;
    if (!water.current) return;
    const inPlace = s.vesselPlace === 'calorimeter';
    const height = Math.max(0.002, Math.min(0.2, s.vesselWater / 900));
    water.current.visible = inPlace && s.vesselWater > 0.5;
    water.current.scale.y = height;
    water.current.position.y = TOP + 0.03 + height / 2;
    const mat = water.current.material as THREE.MeshStandardMaterial;
    const hot = THREE.MathUtils.clamp((s.vesselTemp - 20) / 70, 0, 1);
    mat.color.setRGB(0.45 + hot * 0.45, 0.7 - hot * 0.22, 0.8 - hot * 0.36);
  });
  return (
    <group>
      <mesh position={[0, TOP + 0.125, 0]} castShadow>
        <cylinderGeometry args={[0.098, 0.092, 0.23, detail, 1, true]} />
        <meshStandardMaterial color="#c4cccd" metalness={0.88} roughness={0.28} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, TOP + 0.014, 0]}>
        <cylinderGeometry args={[0.092, 0.092, 0.016, detail]} />
        <meshStandardMaterial color="#a9b1b2" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh ref={water} position={[0, TOP + 0.05, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.09, 0.086, 1, detail]} />
        <meshStandardMaterial color="#79b6c8" transparent opacity={0.72} roughness={0.15} depthWrite={false} />
      </mesh>
      {/* Masse de cuivre immergée dans le vase */}
      {sim.state.copperPlace === 'vessel' && (
        <mesh position={[0.022, TOP + 0.075, -0.012]} rotation={[0.16, 0.4, 0.22]} castShadow>
          <cylinderGeometry args={[0.021, 0.021, 0.058, seg(20, quality)]} />
          <meshStandardMaterial color={COPPER_COLOR} metalness={0.92} roughness={0.26} />
        </mesh>
      )}
    </group>
  );
}

/* --------------------------------- bornes --------------------------------- */

function Terminal({
  id,
  label,
  color,
  wireInHand,
  sim,
  local,
}: {
  id: TerminalId;
  label: string;
  color: string;
  wireInHand: TerminalId | null;
  sim: Tp2Simulation;
  local: [number, number, number];
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const active = sim.state.wireInHand != null;
    const mat = ring.current.material as THREE.MeshBasicMaterial;
    mat.opacity = active ? 0.28 + Math.sin(clock.elapsedTime * 4) * 0.12 : 0;
    ring.current.visible = active;
  });
  return (
    <ActionGroup action={`terminal:${id}`} label={`${label} · clic = connecter le fil`} position={local}>
      <mesh castShadow>
        <cylinderGeometry args={[0.0095, 0.011, 0.018, 16]} />
        <meshStandardMaterial color={color} metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.008, 12]} />
        <meshStandardMaterial color="#d8dedd" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh ref={ring} position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.016, 0.021, 24]} />
        <meshBasicMaterial color="#8fe9c4" transparent opacity={0} depthWrite={false} />
      </mesh>
      {wireInHand === id && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
          <ringGeometry args={[0.013, 0.017, 24]} />
          <meshBasicMaterial color="#ffd08a" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
    </ActionGroup>
  );
}

/* ----------------------------- alimentation DC ---------------------------- */

export function DcSupply({ sim, quality, hz }: { sim: Tp2Simulation; quality: Quality; hz: number }) {
  const screen = useMemo(() => createDynamicScreen(520, 300, quality), [quality]);
  const lastDraw = useRef(0);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const [x, z] = L.generator;
  useFrame(({ clock }) => {
    const s = sim.state;
    if (led.current) {
      led.current.emissiveIntensity = s.generatorOn ? 1.5 : 0;
      led.current.color.set(s.generatorOn ? '#c2402f' : '#4a2622');
    }
    if (clock.elapsedTime - lastDraw.current >= 1 / hz) {
      lastDraw.current = clock.elapsedTime;
      drawGeneratorScreen(screen, s.generatorVoltage, s.current, s.generatorOn);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.34, 0.17, 0.25]} radius={0.008} smoothness={4} position={[0, TOP + 0.085, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={BODY} roughness={0.42} metalness={0.22} />
      </RoundedBox>
      <mesh position={[0, TOP + 0.171, 0]}>
        <boxGeometry args={[0.34, 0.004, 0.25]} />
        <meshStandardMaterial color="#c3c8c4" roughness={0.5} />
      </mesh>
      {/* Façade : afficheur, boutons, voyant */}
      <mesh position={[0, TOP + 0.115, 0.126]}>
        <planeGeometry args={[0.19, 0.088]} />
        <meshBasicMaterial color="#0c1618" />
      </mesh>
      <ActionGroup action="genDisplay" label="Alimentation continue · clic = marche/arrêt, clic droit = régler la tension">
        <mesh position={[0, TOP + 0.115, 0.1275]}>
          <planeGeometry args={[0.178, 0.078]} />
          <meshBasicMaterial map={screen.texture} toneMapped={false} />
        </mesh>
      </ActionGroup>
      <mesh position={[0, TOP + 0.045, 0.127]}>
        <sphereGeometry args={[0.006, 12, 8]} />
        <meshStandardMaterial ref={led} color="#4a2622" emissive="#ff4a33" emissiveIntensity={0} roughness={0.3} />
      </mesh>
      <ActionGroup action="genKnob" label="Réglage de tension · clic = +0,5 V, clic droit = −0,5 V" position={[0.125, TOP + 0.09, 0.128]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.021, 0.023, 0.018, seg(24, quality)]} />
          <meshStandardMaterial color={DARK} roughness={0.35} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.008, 0.014]}>
          <boxGeometry args={[0.003, 0.003, 0.014]} />
          <meshStandardMaterial color="#efe9dc" roughness={0.5} />
        </mesh>
      </ActionGroup>
      {/* Interrupteur de circuit (le « couteau » du montage) */}
      <CircuitSwitch sim={sim} quality={quality} />
      {/* Bornes de sortie */}
      <Terminal id="genP" label="Borne + de l’alimentation" color="#c0453a" wireInHand={sim.state.wireInHand} sim={sim} local={[0.125, 0.086, 0.1]} />
      <Terminal id="genN" label="Borne − de l’alimentation" color="#2f3a3d" wireInHand={sim.state.wireInHand} sim={sim} local={[0.165, 0.086, 0.1]} />
      {/* Étiquette d'appareil */}
      <DeviceLabel text="ALIMENTATION CONTINUE 0-30 V · 2 A" width={0.3} position={[0, TOP + 0.02, 0.126]} />
    </group>
  );
}

function CircuitSwitch({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const blade = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!blade.current) return;
    const target = sim.state.switchClosed ? 0 : -0.72;
    blade.current.rotation.x += (target - blade.current.rotation.x) * 0.18;
  });
  return (
    <group position={[-0.13, TOP + 0.086, 0.09]}>
      <ActionGroup action="switch" label="Interrupteur · clic = fermer/ouvrir le circuit (démarrer le chrono en même temps)">
        <RoundedBox args={[0.075, 0.014, 0.06]} radius={0.004} smoothness={3} castShadow>
          <meshStandardMaterial color="#2f2a22" roughness={0.5} />
        </RoundedBox>
        <group ref={blade} position={[-0.028, 0.01, 0]}>
          <mesh position={[0.028, 0.008, 0]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.056, 0.006, 0.012]} />
            <meshStandardMaterial color="#c9a25a" metalness={0.85} roughness={0.28} />
          </mesh>
          <mesh position={[0.056, 0.012, 0]}>
            <sphereGeometry args={[0.008, seg(12, quality), 8]} />
            <meshStandardMaterial color="#3a2f22" roughness={0.45} />
          </mesh>
        </group>
        {[-0.028, 0.028].map((px) => (
          <mesh key={px} position={[px, 0.012, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.012, 10]} />
            <meshStandardMaterial color="#b9c0be" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}
      </ActionGroup>
      <Terminal id="swA" label="Entrée de l’interrupteur" color="#2f3a3d" wireInHand={sim.state.wireInHand} sim={sim} local={[-0.02, 0.012, 0]} />
      <Terminal id="swB" label="Sortie de l’interrupteur" color="#2f3a3d" wireInHand={sim.state.wireInHand} sim={sim} local={[0.02, 0.012, 0]} />
    </group>
  );
}

/* --------------------------- appareils analogiques ------------------------ */

function AnalogMeter({
  sim,
  quality,
  kind,
  position,
  label,
  calibreAction,
}: {
  sim: Tp2Simulation;
  quality: Quality;
  kind: 'A' | 'V';
  position: [number, number];
  label: string;
  calibreAction: string;
}) {
  const face = useMemo(
    () =>
      createMeterFaceTexture({
        kind,
        calibres: kind === 'A' ? [0.3, 0.6, 1.2, 2.4] : [3, 7.5, 15, 30],
        classe: 1.5,
        title: kind === 'A' ? 'AMPÈREMÈTRE' : 'VOLTMÈTRE',
      }),
    [kind],
  );
  const needle = useRef<THREE.Group>(null);
  useFrame(() => {
    const s = sim.state;
    const value = kind === 'A' ? s.current : s.voltage;
    const calibre = kind === 'A' ? s.ammeterCalibre : s.voltmeterCalibre;
    const divisions = meterDivisions(value, calibre);
    const clamped = Math.max(-2, Math.min(METER_DIVISIONS + 4, divisions));
    // Aiguille : -60° … +60° pour 0 … 30 divisions.
    const target = (-60 + (clamped / METER_DIVISIONS) * 120) * (Math.PI / 180);
    if (needle.current) needle.current.rotation.z += (-target - needle.current.rotation.z) * 0.18;
  });
  const [x, z] = position;
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.21, 0.062, 0.19]} radius={0.006} smoothness={4} position={[0, TOP + 0.031, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={BODY} roughness={0.45} metalness={0.18} />
      </RoundedBox>
      {/* Face inclinée */}
      <group position={[0, TOP + 0.062, 0.01]} rotation={[-0.62, 0, 0]}>
        <RoundedBox args={[0.2, 0.13, 0.012]} radius={0.004} smoothness={3} castShadow>
          <meshStandardMaterial color="#e9e6dc" roughness={0.5} />
        </RoundedBox>
        <mesh position={[0, 0.004, 0.0075]}>
          <planeGeometry args={[0.176, 0.104]} />
          <meshStandardMaterial map={face} roughness={0.72} />
        </mesh>
        <group ref={needle} position={[0, -0.037, 0.009]}>
          <mesh position={[0, 0.036, 0]}>
            <boxGeometry args={[0.0016, 0.078, 0.0012]} />
            <meshStandardMaterial color="#b8322a" roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.008, 0]}>
            <boxGeometry args={[0.0032, 0.018, 0.0012]} />
            <meshStandardMaterial color="#7c2924" roughness={0.4} />
          </mesh>
        </group>
        <mesh position={[0, -0.037, 0.011]}>
          <sphereGeometry args={[0.005, 12, 8]} />
          <meshStandardMaterial color="#2c3335" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Vitrine */}
        <mesh position={[0, 0.004, 0.013]} renderOrder={4}>
          <planeGeometry args={[0.182, 0.11]} />
          <meshPhysicalMaterial color="#e8f4f5" transparent opacity={0.09} roughness={0.05} depthWrite={false} />
        </mesh>
        {/* Vis de réglage du zéro */}
        <mesh position={[-0.078, -0.048, 0.008]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.004, 10]} />
          <meshStandardMaterial color="#9aa2a2" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <ActionGroup action={calibreAction} label={`${label} · clic = calibre suivant, clic droit = précédent`} position={[0.072, TOP + 0.075, 0.055]}>
        <mesh rotation={[Math.PI / 2 - 0.62, 0, 0]} castShadow>
          <cylinderGeometry args={[0.014, 0.016, 0.014, seg(20, quality)]} />
          <meshStandardMaterial color={DARK} roughness={0.36} metalness={0.2} />
        </mesh>
      </ActionGroup>
      {kind === 'A' ? (
        <>
          <Terminal id="ammA" label="Borne d’entrée de l’ampèremètre" color="#c0453a" wireInHand={sim.state.wireInHand} sim={sim} local={[-0.055, 0.062, 0.09]} />
          <Terminal id="ammB" label="Borne de sortie de l’ampèremètre" color="#2f3a3d" wireInHand={sim.state.wireInHand} sim={sim} local={[0.055, 0.062, 0.09]} />
        </>
      ) : (
        <>
          <Terminal id="voltP" label="Borne + du voltmètre" color="#c0453a" wireInHand={sim.state.wireInHand} sim={sim} local={[-0.075, 0.062, 0.09]} />
          <Terminal id="voltN" label="Borne − du voltmètre" color="#2f3a3d" wireInHand={sim.state.wireInHand} sim={sim} local={[0.075, 0.062, 0.09]} />
        </>
      )}
      <DeviceLabel text={kind === 'A' ? 'AMPÈREMÈTRE  ·  CLASSE 1,5' : 'VOLTMÈTRE  ·  CLASSE 1,5'} width={0.2} position={[0, TOP + 0.045, 0.096]} />
    </group>
  );
}

/** Étiquette gravée (texture canvas : aucune police externe chargée). */
function DeviceLabel({ text, width, position }: { text: string; width: number; position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 64);
    ctx.fillStyle = '#4c5759';
    ctx.font = '600 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 34);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  return (
    <mesh position={position}>
      <planeGeometry args={[width, width * 0.125]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

/* ------------------------------- balance ---------------------------------- */

export function Balance({ sim, quality, hz }: { sim: Tp2Simulation; quality: Quality; hz: number }) {
  const screen = useMemo(() => createDynamicScreen(420, 200, quality), [quality]);
  const lastDraw = useRef(0);
  const [x, z] = L.balance;
  useFrame(({ clock }) => {
    const s = sim.state;
    if (clock.elapsedTime - lastDraw.current >= 1 / hz) {
      lastDraw.current = clock.elapsedTime;
      drawBalanceScreen(screen, balanceReading(s), s.balanceTare > 0.5, s.time - s.balanceStableAt > 0.8);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.23, 0.075, 0.29]} radius={0.008} smoothness={4} position={[0, TOP + 0.038, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#e4e6e1" roughness={0.4} metalness={0.2} />
      </RoundedBox>
      {/* Plateau inox */}
      <ActionGroup action="balance" label="Balance électronique · clic = poser/retirer le vase, clic droit = retirer ce qui est sur le plateau">
        <mesh position={[0, TOP + 0.082, 0.03]} castShadow>
          <cylinderGeometry args={[0.085, 0.085, 0.008, seg(40, quality)]} />
          <meshStandardMaterial color="#c2c9ca" metalness={0.92} roughness={0.18} />
        </mesh>
        <mesh position={[0, TOP + 0.076, 0.03]}>
          <cylinderGeometry args={[0.05, 0.06, 0.012, seg(24, quality)]} />
          <meshStandardMaterial color="#8f989a" metalness={0.8} roughness={0.3} />
        </mesh>
      </ActionGroup>
      {/* Afficheur incliné */}
      <group position={[0, TOP + 0.09, -0.1]} rotation={[-0.5, 0, 0]}>
        <RoundedBox args={[0.15, 0.062, 0.014]} radius={0.004} smoothness={3} castShadow>
          <meshStandardMaterial color={DARK} roughness={0.42} />
        </RoundedBox>
        <ActionGroup action="balanceRecord" label="Afficheur · clic = consigner la masse, clic droit = tare">
          <mesh position={[0, 0, 0.0085]}>
            <planeGeometry args={[0.132, 0.046]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        </ActionGroup>
      </group>
      <ActionGroup action="balanceTare" label="Touche TARE · remise à zéro de l’afficheur" position={[-0.085, TOP + 0.055, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.028, 0.012, 0.022]} />
          <meshStandardMaterial color="#4f7f74" roughness={0.45} />
        </mesh>
      </ActionGroup>
      <DeviceLabel text="BALANCE  ±0,01 g · 2000 g" width={0.19} position={[0.02, TOP + 0.062, 0.14]} />
      <VesselOnBalance sim={sim} quality={quality} />
    </group>
  );
}

/** Vase calorimétrique : sur le plateau, sur la paillasse ou dans le calorimètre. */
function VesselOnBalance({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const water = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = sim.state;
    if (!water.current) return;
    const height = Math.max(0.002, Math.min(0.13, s.vesselWater / 1400));
    water.current.visible = s.vesselWater > 0.5;
    water.current.scale.y = height;
    water.current.position.y = 0.012 + height / 2;
  });
  const visible = sim.state.vesselPlace === 'balance';
  if (!visible) return null;
  return (
    <group position={[0, TOP + 0.086, 0.03]}>
      <ActionGroup action="vessel" label="Vase calorimétrique · clic = actions, clic droit = dans/hors du calorimètre">
        <mesh castShadow>
          <cylinderGeometry args={[0.062, 0.058, 0.14, seg(36, quality), 1, true]} />
          <meshStandardMaterial color="#c4cccd" metalness={0.88} roughness={0.28} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.065, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.01, seg(36, quality)]} />
          <meshStandardMaterial color="#a9b1b2" metalness={0.85} roughness={0.32} />
        </mesh>
        <mesh ref={water} position={[0, 0, 0]} renderOrder={2}>
          <cylinderGeometry args={[0.057, 0.055, 1, seg(30, quality)]} />
          <meshStandardMaterial color="#79b6c8" transparent opacity={0.7} roughness={0.15} depthWrite={false} />
        </mesh>
      </ActionGroup>
    </group>
  );
}

/** Vase posé sur la paillasse (hors balance, hors calorimètre). */
function BenchVessel({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const visible = sim.state.vesselPlace === 'bench';
  if (!visible) return null;
  return (
    <group position={[L.benchVessel[0], TOP, L.benchVessel[1]]}>
      <ActionGroup action="vesselFill" label="Vase + éprouvette · clic = ajouter l’eau froide choisie, clic droit = vider et essuyer">
        <mesh position={[0, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.062, 0.058, 0.14, seg(36, quality), 1, true]} />
          <meshStandardMaterial color="#c4cccd" metalness={0.88} roughness={0.28} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.005, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.01, seg(36, quality)]} />
          <meshStandardMaterial color="#a9b1b2" metalness={0.85} roughness={0.32} />
        </mesh>
        <BenchWater sim={sim} quality={quality} />
        <DeviceLabel text={`VASE ${VESSEL_MASS.toFixed(1)} g`} width={0.12} position={[0, 0.13, 0]} />
      </ActionGroup>
    </group>
  );
}

function BenchWater({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const water = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = sim.state;
    if (!water.current) return;
    const height = Math.max(0.002, Math.min(0.125, s.vesselWater / 1400));
    water.current.visible = s.vesselWater > 0.5;
    water.current.scale.y = height;
    water.current.position.y = 0.012 + height / 2;
    const mat = water.current.material as THREE.MeshStandardMaterial;
    const hot = THREE.MathUtils.clamp((s.vesselTemp - 20) / 70, 0, 1);
    mat.color.setRGB(0.45 + hot * 0.45, 0.7 - hot * 0.22, 0.8 - hot * 0.36);
  });
  return (
    <mesh ref={water} position={[0, 0.05, 0]} renderOrder={2}>
      <cylinderGeometry args={[0.057, 0.055, 1, seg(30, quality)]} />
      <meshStandardMaterial color="#79b6c8" transparent opacity={0.7} roughness={0.15} depthWrite={false} />
    </mesh>
  );
}

/* --------------------------- chauffe-bécher + bécher ---------------------- */

export function BeakerStation({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const knob = useRef<THREE.Group>(null);
  const water = useRef<THREE.Mesh>(null);
  const steam = useRef<THREE.Group>(null);
  const coil = useRef<THREE.MeshStandardMaterial>(null);
  const [x, z] = L.heater;
  useFrame(({ clock }) => {
    const s = sim.state;
    if (knob.current) knob.current.rotation.z += ((-(-120 + s.beakerHeater * 80) * Math.PI) / 180 - knob.current.rotation.z) * 0.16;
    if (coil.current) {
      const heat = Math.max(0, Math.min(1, (s.hotPlateTemp - 60) / 260));
      coil.current.emissive.setRGB(heat * 0.7, heat * 0.12, 0);
      coil.current.emissiveIntensity = heat;
    }
    if (water.current) {
      const height = Math.max(0.002, Math.min(0.085, s.beakerWater / 2600));
      water.current.visible = s.beakerWater > 1;
      water.current.scale.y = height;
      water.current.position.y = TOP + 0.135 + 0.012 + height / 2;
      const mat = water.current.material as THREE.MeshStandardMaterial;
      const hot = THREE.MathUtils.clamp((s.beakerTemp - 20) / 75, 0, 1);
      mat.color.setRGB(0.45 + hot * 0.5, 0.7 - hot * 0.25, 0.8 - hot * 0.4);
    }
    if (steam.current) {
      steam.current.visible = s.beakerTemp > 62 && s.beakerWater > 1;
      steam.current.children.forEach((child, i) => {
        const phase = (clock.elapsedTime * (0.5 + i * 0.11) + i * 0.37) % 1;
        child.position.set(Math.sin(i * 2.4) * 0.018, 0.09 + phase * 0.13, Math.cos(i * 1.9) * 0.018);
        child.scale.setScalar(0.25 + phase * 0.8);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.24 * (1 - phase) * Math.min(1, (s.beakerTemp - 60) / 30));
      });
    }
  });
  return (
    <group position={[x, 0, z]}>
      {/* Chauffe-bécher */}
      <RoundedBox args={[0.24, 0.075, 0.24]} radius={0.008} smoothness={4} position={[0, TOP + 0.038, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#cfd2cc" roughness={0.42} metalness={0.24} />
      </RoundedBox>
      <mesh position={[0, TOP + 0.082, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.014, seg(36, quality)]} />
        <meshStandardMaterial color="#31373a" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, TOP + 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.007, 8, seg(36, quality)]} />
        <meshStandardMaterial ref={coil} color="#3a4041" metalness={0.7} roughness={0.45} emissive="#000000" />
      </mesh>
      <ActionGroup action="beakerHeater" label="Chauffe-bécher · clic = +1 (0 à 3), clic droit = −1" position={[0, TOP + 0.05, 0.125]}>
        <group ref={knob}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.019, 0.021, 0.016, seg(24, quality)]} />
            <meshStandardMaterial color={DARK} roughness={0.34} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.006, 0.013]}>
            <boxGeometry args={[0.003, 0.003, 0.013]} />
            <meshStandardMaterial color="#f0ead9" roughness={0.5} />
          </mesh>
        </group>
      </ActionGroup>
      <DeviceLabel text="CHAUFFE-BÉCHER 600 W" width={0.2} position={[0, TOP + 0.018, 0.121]} />

      {/* Bécher 250 mL en verre borosilicate */}
      <ActionGroup action="beaker" label="Bécher · clic = verser l’eau chaude dans le vase, clic droit = remplir / vider">
        <mesh position={[0, TOP + 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.062, 0.058, 0.12, seg(36, quality), 1, true]} />
          <meshPhysicalMaterial color="#dcecf0" transparent opacity={0.22} roughness={0.05} metalness={0} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, TOP + 0.105, 0]}>
          <cylinderGeometry args={[0.058, 0.058, 0.008, seg(36, quality)]} />
          <meshPhysicalMaterial color="#dcecf0" transparent opacity={0.3} roughness={0.08} depthWrite={false} />
        </mesh>
        <mesh position={[0.062, TOP + 0.21, 0]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.018, 0.004, 0.03]} />
          <meshPhysicalMaterial color="#dcecf0" transparent opacity={0.3} roughness={0.08} depthWrite={false} />
        </mesh>
        <mesh ref={water} position={[0, TOP + 0.15, 0]} renderOrder={2}>
          <cylinderGeometry args={[0.057, 0.055, 1, seg(30, quality)]} />
          <meshStandardMaterial color="#79b6c8" transparent opacity={0.6} roughness={0.12} depthWrite={false} />
        </mesh>
        {/* Graduations */}
        {[0.04, 0.075, 0.11].map((y) => (
          <mesh key={y} position={[0.055, TOP + 0.135 + y, 0.02]}>
            <boxGeometry args={[0.012, 0.0015, 0.0015]} />
            <meshBasicMaterial color="#7d8a8a" transparent opacity={0.7} />
          </mesh>
        ))}
      </ActionGroup>
      <group ref={steam} position={[0, TOP + 0.22, 0]}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.02, 8, 6]} />
            <meshBasicMaterial color="#eef5f4" transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------- chronomètre ------------------------------ */

export function Chronometer({ sim, quality, hz }: { sim: Tp2Simulation; quality: Quality; hz: number }) {
  const screen = useMemo(() => createDynamicScreen(520, 260, quality), [quality]);
  const lastDraw = useRef(0);
  const [x, z] = L.chronometer;
  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastDraw.current >= 1 / hz) {
      lastDraw.current = clock.elapsedTime;
      drawChronoScreen(screen, sim.state.chrono, sim.state.chronoRunning);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <RoundedBox args={[0.16, 0.05, 0.11]} radius={0.012} smoothness={4} position={[0, TOP + 0.025, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2b3234" roughness={0.42} metalness={0.3} />
      </RoundedBox>
      <group position={[0, TOP + 0.055, 0]} rotation={[-0.85, 0, 0]}>
        <ActionGroup action="chrono" label="Chronomètre · clic = marche/pause, clic droit = zéro">
          <mesh>
            <planeGeometry args={[0.135, 0.07]} />
            <meshBasicMaterial map={screen.texture} toneMapped={false} />
          </mesh>
        </ActionGroup>
      </group>
      <mesh position={[0, TOP + 0.052, -0.02]} rotation={[Math.PI / 2 - 0.85, 0, 0]}>
        <planeGeometry args={[0.15, 0.09]} />
        <meshStandardMaterial color="#1f2628" roughness={0.5} />
      </mesh>
      {[
        [-0.055, '#4f7f74'],
        [0, '#8a6a4a'],
        [0.055, '#6d4a4a'],
      ].map(([bx, color]) => (
        <mesh key={String(bx)} position={[bx as number, TOP + 0.052, 0.048]} castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.008, seg(14, quality)]} />
          <meshStandardMaterial color={color as string} roughness={0.4} />
        </mesh>
      ))}
      <DeviceLabel text="CHRONOMÈTRE 1/10 s" width={0.15} position={[0, TOP + 0.012, 0.056]} />
      {/* Durée de chauffage demandée : rappel visuel */}
      <HeatingProgress sim={sim} />
    </group>
  );
}

function HeatingProgress({ sim }: { sim: Tp2Simulation }) {
  const bar = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!bar.current) return;
    const ratio = Math.max(0, Math.min(1, sim.state.heatingTime / TARGET_HEATING_TIME));
    bar.current.scale.x = Math.max(0.001, ratio);
    bar.current.position.x = -0.07 + (0.14 * ratio) / 2;
  });
  return (
    <group position={[0, TOP + 0.053, -0.045]}>
      <mesh>
        <boxGeometry args={[0.14, 0.001, 0.008]} />
        <meshBasicMaterial color="#1d2426" />
      </mesh>
      <mesh ref={bar} position={[-0.07, 0.0012, 0]}>
        <boxGeometry args={[0.14, 0.0015, 0.007]} />
        <meshBasicMaterial color="#8fe9c4" />
      </mesh>
    </group>
  );
}

/* ------------------------------ verrerie ---------------------------------- */

export function Glassware({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const [cx, cz] = L.cylinder;
  const [fx, fz] = L.flask;
  const volumes = [50, 100, 150, 200];
  return (
    <group>
      {/* Éprouvettes graduées : sélection du volume d'eau */}
      {volumes.map((volume, i) => {
        const px = cx - 0.09 + i * 0.06;
        const height = 0.1 + i * 0.018;
        const selected = sim.state.selectedVolume === volume;
        return (
          <ActionGroup key={volume} action="cylinder" label={`Éprouvette ${volume} mL · clic = volume choisi`} position={[px, TOP, cz + (i % 2) * 0.02]}>
            <mesh position={[0, height / 2, 0]} castShadow>
              <cylinderGeometry args={[0.019, 0.019, height, seg(20, quality), 1, true]} />
              <meshPhysicalMaterial color="#dcecf0" transparent opacity={selected ? 0.4 : 0.22} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.006, 0]}>
              <cylinderGeometry args={[0.026, 0.026, 0.012, seg(20, quality)]} />
              <meshPhysicalMaterial color="#dcecf0" transparent opacity={0.3} roughness={0.08} depthWrite={false} />
            </mesh>
            <mesh position={[0, height * 0.55, 0]} renderOrder={2}>
              <cylinderGeometry args={[0.0175, 0.0175, height * 0.45, seg(18, quality)]} />
              <meshStandardMaterial color="#79b6c8" transparent opacity={0.5} roughness={0.12} depthWrite={false} />
            </mesh>
            {selected && (
              <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
                <ringGeometry args={[0.03, 0.036, 28]} />
                <meshBasicMaterial color="#8fe9c4" transparent opacity={0.75} depthWrite={false} />
              </mesh>
            )}
          </ActionGroup>
        );
      })}

      {/* Flacon d'eau distillée */}
      <group position={[fx, TOP, fz]}>
        <mesh position={[0, 0.09, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 0.18, seg(24, quality), 1, true]} />
          <meshPhysicalMaterial color="#dfeef0" transparent opacity={0.24} roughness={0.06} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.075, 0]} renderOrder={2}>
          <cylinderGeometry args={[0.043, 0.048, 0.15, seg(24, quality)]} />
          <meshStandardMaterial color="#9fc9d6" transparent opacity={0.5} roughness={0.1} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.19, 0]}>
          <cylinderGeometry args={[0.018, 0.024, 0.04, seg(16, quality)]} />
          <meshPhysicalMaterial color="#dfeef0" transparent opacity={0.3} roughness={0.08} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.215, 0]}>
          <cylinderGeometry args={[0.019, 0.019, 0.014, seg(16, quality)]} />
          <meshStandardMaterial color="#3f6f66" roughness={0.55} />
        </mesh>
        <DeviceLabel text="EAU DISTILLÉE" width={0.09} position={[0, 0.12, 0.05]} />
      </group>

      {/* Masse de cuivre sur sa coupelle */}
      <CopperSample sim={sim} quality={quality} />
    </group>
  );
}

function CopperSample({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const place = sim.state.copperPlace;
  if (place === 'vessel') return null;
  const onBalance = place === 'balance';
  const x = onBalance ? L.balance[0] : L.copper[0];
  const z = onBalance ? L.balance[1] + 0.03 : L.copper[1];
  const y = onBalance ? TOP + 0.088 : TOP;
  return (
    <group position={[x, y, z]}>
      <ActionGroup
        action="copper"
        label={`Masse de cuivre ${COPPER_MASS.toFixed(1)} g · clic = peser sur la balance, clic droit = plonger dans le vase / retirer`}
      >
        {!onBalance && (
          <mesh position={[0, 0.006, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.012, seg(28, quality)]} />
            <meshStandardMaterial color="#c6cccb" metalness={0.5} roughness={0.45} />
          </mesh>
        )}
        <mesh position={[0, onBalance ? 0.03 : 0.038, 0]} rotation={[0.2, 0.5, 0.12]} castShadow>
          <cylinderGeometry args={[0.021, 0.021, 0.055, seg(20, quality)]} />
          <meshStandardMaterial color={COPPER_COLOR} metalness={0.94} roughness={0.24} />
        </mesh>
        <mesh position={[0.014, onBalance ? 0.05 : 0.058, 0.006]} rotation={[0.2, 0.5, 0.12]}>
          <torusGeometry args={[0.008, 0.0022, 6, seg(18, quality)]} />
          <meshStandardMaterial color="#d08a52" metalness={0.9} roughness={0.3} />
        </mesh>
      </ActionGroup>
    </group>
  );
}

/* -------------------------------- câblage --------------------------------- */

function Wire({ a, b, color, quality }: { a: TerminalId; b: TerminalId; color: string; quality: Quality }) {
  const geometry = useMemo(() => {
    const points = wirePoints(a, b).map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.TubeGeometry(curve, quality === 'low' ? 16 : 32, 0.0042, quality === 'low' ? 4 : 6, false);
  }, [a, b, quality]);
  return (
    <ActionGroup action="wire" label="Fil de connexion · clic droit = retirer le dernier fil" position={[0, 0, 0]}>
      <mesh geometry={geometry} castShadow={quality !== 'low'}>
        <meshStandardMaterial color={color} roughness={0.62} metalness={0.05} />
      </mesh>
    </ActionGroup>
  );
}

/** Fil « en main » : suit la caméra, aucune seconde borne n'est exposée. */
function WireInHand({ sim }: { sim: Tp2Simulation }) {
  const { camera } = useThree();
  const [points, setPoints] = useState<[number, number, number][]>([]);
  const last = useRef(0);
  const from = sim.state.wireInHand;
  useFrame(({ clock }) => {
    if (from == null) return;
    if (clock.elapsedTime - last.current < 0.07) return;
    last.current = clock.elapsedTime;
    const [sx, sy, sz] = terminalWorld(from);
    const start = new THREE.Vector3(sx, sy + 0.012, sz);
    const end = camera.position.clone();
    end.y -= 0.18;
    const next: [number, number, number][] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = start.clone().lerp(end, t);
      point.y -= Math.sin(Math.PI * t) * 0.2;
      next.push([point.x, point.y, point.z]);
    }
    setPoints(next);
  });
  if (from == null || points.length < 2) return null;
  return <Line points={points} color="#e0b478" lineWidth={2} transparent opacity={0.92} />;
}

/** Badge discret au-dessus du calorimètre quand le montage est complet. */
function CircuitCompleteBadge() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = TOP + 0.52 + Math.sin(clock.elapsedTime * 2) * 0.006;
  });
  return (
    <mesh ref={ref} position={[L.calorimeter[0], TOP + 0.52, L.calorimeter[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <ringGeometry args={[0.05, 0.056, 32]} />
      <meshBasicMaterial color="#8fe9c4" transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

export function Wiring({ sim, quality }: { sim: Tp2Simulation; quality: Quality }) {
  const links = sim.state.connections;
  const missing = REQUIRED_LINKS.filter((link) => !links.some((c) => (c.a === link.a && c.b === link.b) || (c.a === link.b && c.b === link.a)));
  return (
    <group>
      {links.map((connection, index) => (
        <Wire key={`${connection.a}-${connection.b}-${index}`} a={connection.a} b={connection.b} color={connection.color} quality={quality} />
      ))}
      {missing.length === 0 && quality !== 'low' && <CircuitCompleteBadge />}
      <WireInHand sim={sim} />
    </group>
  );
}

/* ------------------------------ assemblage -------------------------------- */

export function Tp2Bench({ sim, quality, hz }: { sim: Tp2Simulation; quality: Quality; hz: number }) {
  return (
    <group position={TP2_ORIGIN}>
      <Calorimeter sim={sim} quality={quality} hz={hz} />
      <DcSupply sim={sim} quality={quality} hz={hz} />
      <AnalogMeter sim={sim} quality={quality} kind="A" position={L.ammeter} label="Sélecteur de calibre de l’ampèremètre" calibreAction="ammeterCalibre" />
      <AnalogMeter sim={sim} quality={quality} kind="V" position={L.voltmeter} label="Sélecteur de calibre du voltmètre" calibreAction="voltmeterCalibre" />
      <Balance sim={sim} quality={quality} hz={hz} />
      <BeakerStation sim={sim} quality={quality} />
      <Chronometer sim={sim} quality={quality} hz={hz} />
      <Glassware sim={sim} quality={quality} />
      <BenchVessel sim={sim} quality={quality} />
    </group>
  );
}

/** Rappels textuels de la paillasse TP2 (panneau de consignes local). */
export function Tp2BenchNotice() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eef0ea';
    ctx.fillRect(0, 0, 512, 160);
    ctx.fillStyle = '#325b59';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = '#f3f5ef';
    ctx.font = '600 21px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TP2 · CALORIMÉTRIE — PAILLASSE 02', 256, 18);
    ctx.fillStyle = '#3d4a4b';
    ctx.font = '500 17px Arial, sans-serif';
    ctx.textAlign = 'left';
    const lines = [
      '• Calorimètre adiabatique : μ₀ = 32,5 g (panneau mural)',
      '• Résistance chauffante R = ' + RESISTOR_R.toFixed(1) + ' Ω · agitateur',
      '• Appareils : alimentation continue, ampèremètre, voltmètre',
      '• Balance ±0,01 g · thermomètre 0-110 °C au 1/10 · chronomètre',
    ];
    lines.forEach((line, i) => ctx.fillText(line, 16, 58 + i * 25));
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[TP2_ORIGIN[0], TOP - 0.001, TP2_ORIGIN[2] + 0.42]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.62, 0.19]} />
      <meshStandardMaterial map={texture} roughness={0.75} />
    </mesh>
  );
}
