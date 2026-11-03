/* --------------------------------------------------------------------------- *
 *  Scène 3D : la salle unique avec les deux paillasses (TP1 et TP2)             *
 * --------------------------------------------------------------------------- */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BENCHES, QUALITY_PRESETS, type Quality } from './shared';
import type { LabController } from './controller';
import { Room, BenchTable, TP1_TABLE_SPEC, TP2_TABLE_SPEC, TP2_ORIGIN } from './room';
import { AcquisitionMonitor, Hotplate, PowerCable, PressureCooker, Tablet, WallOutlet } from './tp1Models';
import { Tp2Bench, Tp2BenchNotice, Wiring } from './tp2Models';

export interface HoverInfo {
  id: string;
  label: string;
  draggable: boolean;
  distance: number;
}

interface SceneProps {
  controller: LabController;
  quality: Quality;
  bench: 'tp1' | 'tp2';
  travel: number; // incrémenté à chaque demande de changement de paillasse
  onHover: (hover: HoverInfo | null) => void;
  onLockChange: (locked: boolean) => void;
  onZoomChange: (zoom: boolean) => void;
  onWireChange: (wireInHand: string | null) => void;
  onFps: (fps: number) => void;
  onBenchArrived: () => void;
}

/* --------------------------------- physique -------------------------------- */

function SimulationRunner({ controller, onFps, quality }: { controller: LabController; onFps: (fps: number) => void; quality: Quality }) {
  const lastReport = useRef(0);
  useFrame((_, delta) => {
    controller.step(delta);
    if (quality === 'low') return;
    const now = performance.now() / 1000;
    const sample = controller.sample(delta, now, () => undefined);
    if (sample && now - lastReport.current > 2) {
      lastReport.current = now;
      onFps(sample.fps);
    }
  });
  return null;
}

/* -------------------------------- collision -------------------------------- */

/** Obstacles de la salle : les deux paillasses et les meubles muraux. */
/** Marge de sécurité autour des meubles : on ne traverse ni les tables ni les armoires. */
const CLEARANCE = 0.2;

function isBlocked(x: number, z: number): boolean {
  const rectangles = [
    { x: 0, z: 0, hw: TP1_TABLE_SPEC.width / 2, hd: TP1_TABLE_SPEC.depth / 2 },
    { x: TP2_ORIGIN[0], z: TP2_ORIGIN[2], hw: TP2_TABLE_SPEC.width / 2, hd: TP2_TABLE_SPEC.depth / 2 },
    { x: -1.2, z: -1.0, hw: 0.48, hd: 0.25 },
    { x: 2.55, z: -1.0, hw: 0.55, hd: 0.25 },
  ];
  return rectangles.some((r) => Math.abs(x - r.x) < r.hw + CLEARANCE && Math.abs(z - r.z) < r.hd + CLEARANCE);
}

/* ------------------------------- contrôleur ------------------------------- */

function FirstPersonController(props: SceneProps) {
  const { controller, quality, bench, travel, onHover, onLockChange, onZoomChange, onWireChange, onBenchArrived } = props;
  const { camera, scene, gl } = useThree();
  const yaw = useRef(BENCHES[0].yaw);
  const pitch = useRef(BENCHES[0].pitch);
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const zoom = useRef(false);
  const basePosition = useRef(new THREE.Vector3(...BENCHES[0].position));
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const center = useMemo(() => new THREE.Vector2(0, 0), []);
  const hoverId = useRef<string | null>(null);
  const hovered = useRef<HoverInfo | null>(null);
  const rayClock = useRef(0);
  const lastWire = useRef<string | null>(null);
  const travelState = useRef<{ active: boolean; from: THREE.Vector3; to: THREE.Vector3; t: number; yawFrom: number; yawTo: number } | null>(null);
  const benchRef = useRef(bench);
  const preset = QUALITY_PRESETS[quality];

  benchRef.current = bench;

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    camera.position.copy(basePosition.current);
    camera.rotation.set(pitch.current, yaw.current, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  /* ---- demande de déplacement vers l'autre paillasse (bouton ou touche) ---- */
  useEffect(() => {
    if (travel === 0) return;
    const target = BENCHES.find((b) => b.id === bench) ?? BENCHES[0];
    travelState.current = {
      active: true,
      from: basePosition.current.clone(),
      to: new THREE.Vector3(...target.position),
      t: 0,
      yawFrom: yaw.current,
      yawTo: target.yaw,
    };
    pitch.current = target.pitch;
  }, [travel, bench]);

  useEffect(() => {
    const element = gl.domElement;
    const setZoom = (value: boolean) => {
      if (zoom.current === value) return;
      zoom.current = value;
      onZoomChange(value);
    };
    const pointerLockChange = () => {
      locked.current = document.pointerLockElement === element;
      if (!locked.current) {
        keys.current.clear();
        setZoom(false);
      }
      onLockChange(locked.current);
    };
    const mouseMove = (event: MouseEvent) => {
      if (!locked.current || travelState.current?.active) return;
      const sensitivity = zoom.current ? 0.00082 : 0.00165;
      yaw.current -= event.movementX * sensitivity;
      pitch.current -= event.movementY * sensitivity;
      pitch.current = Math.max(-1.32, Math.min(1.2, pitch.current));
    };
    const mouseDown = (event: MouseEvent) => {
      if (!locked.current) return;
      if (event.button === 1) {
        event.preventDefault();
        setZoom(true);
        return;
      }
      const target = hovered.current;
      if (event.button === 2) {
        if (!target) {
          // Clic droit dans le vide : repose le fil tenu en main (aucune fuite).
          if (controller.tp2.state.wireInHand) controller.tp2.cancelWire();
          return;
        }
        controller.interact(target.id, 2);
        return;
      }
      if (event.button !== 0 || !target) return;
      controller.interact(target.id, 0);
    };
    const mouseUp = (event: MouseEvent) => {
      if (event.button === 1) setZoom(false);
    };
    const wheel = (event: WheelEvent) => {
      if (!locked.current) return;
      // Molette : réglage fin de la tension du générateur quand il est visé.
      if (hovered.current && (hovered.current.id === 'genKnob' || hovered.current.id === 'genDisplay')) {
        event.preventDefault();
        controller.tp2.adjustGenerator(Math.sign(event.deltaY) * -0.5);
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      keys.current.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyF' && locked.current) setZoom(true);
      if (event.code === 'KeyN') controller.tp1.addMeasurement();
      if (event.code === 'KeyT') controller.tp1.interact('tablet');
      if (event.code === 'Escape' && controller.tp2.state.wireInHand) controller.tp2.cancelWire();
      if (event.code === 'KeyE' && locked.current && hovered.current) controller.interact(hovered.current.id, 0);
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
      if (event.code === 'KeyF') setZoom(false);
    };
    const contextMenu = (event: MouseEvent) => event.preventDefault();
    const blur = () => {
      keys.current.clear();
      setZoom(false);
    };
    document.addEventListener('pointerlockchange', pointerLockChange);
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('mousedown', mouseDown);
    document.addEventListener('mouseup', mouseUp);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('contextmenu', contextMenu);
    return () => {
      document.removeEventListener('pointerlockchange', pointerLockChange);
      document.removeEventListener('mousemove', mouseMove);
      document.removeEventListener('mousedown', mouseDown);
      document.removeEventListener('mouseup', mouseUp);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('contextmenu', contextMenu);
    };
  }, [gl, controller, onHover, onLockChange, onZoomChange, onWireChange]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    /* --- trajet assisté entre les deux paillasses --- */
    const travel_ = travelState.current;
    if (travel_?.active) {
      travel_.t = Math.min(1, travel_.t + dt / 1.05);
      const ease = travel_.t < 0.5 ? 2 * travel_.t * travel_.t : 1 - Math.pow(-2 * travel_.t + 2, 2) / 2;
      basePosition.current.lerpVectors(travel_.from, travel_.to, ease);
      let dy = travel_.yawTo - travel_.yawFrom;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw.current = travel_.yawFrom + dy * ease;
      if (travel_.t >= 1) {
        travelState.current = null;
        onBenchArrived();
      }
    }

    camera.rotation.set(pitch.current, yaw.current, 0);

    /* --- visée : raycast cadencé selon la qualité (anti-ralentissements) --- */
    rayClock.current += dt;
    const rayInterval = 1 / preset.rayHz;
    if (locked.current && rayClock.current >= rayInterval) {
      rayClock.current = 0;
      raycaster.setFromCamera(center, camera);
      raycaster.far = 3.9;
      const hits = raycaster.intersectObjects(scene.children, true);
      let found: HoverInfo | null = null;
      for (const hit of hits) {
        if (hit.object.type !== 'Mesh') continue;
        let object: THREE.Object3D | null = hit.object;
        let interaction: { id: string; label: string; draggable?: boolean } | undefined;
        while (object) {
          if (object.userData.interaction) {
            interaction = object.userData.interaction;
            break;
          }
          object = object.parent;
        }
        if (interaction) {
          found = { id: interaction.id, label: interaction.label, draggable: false, distance: hit.distance };
          break;
        }
        const hitMesh = hit.object as THREE.Mesh;
        const materials: THREE.Material[] = Array.isArray(hitMesh.material) ? hitMesh.material : [hitMesh.material];
        const transparent = materials.some((m) => m.transparent && m.opacity < 0.35);
        if (!transparent) break;
      }
      const nextId = found?.id ?? null;
      if (nextId !== hoverId.current) {
        hoverId.current = nextId;
        onHover(found);
      }
      hovered.current = found;
    } else if (!locked.current && hoverId.current !== null) {
      hoverId.current = null;
      hovered.current = null;
      onHover(null);
    }

    /* --- fil en main : état remonté à l'interface (seulement s'il change) --- */
    const wire = controller.tp2.state.wireInHand;
    if (wire !== lastWire.current) {
      lastWire.current = wire;
      onWireChange(wire);
    }

    /* --- déplacement libre --- */
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();
    const pressed = keys.current;
    if (pressed.has('KeyW') || pressed.has('KeyZ') || pressed.has('ArrowUp')) movement.add(forward);
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) movement.sub(forward);
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) movement.add(right);
    if (pressed.has('KeyA') || pressed.has('KeyQ') || pressed.has('ArrowLeft')) movement.sub(right);
    const moving = movement.lengthSq() > 0 && locked.current && !travelState.current?.active;
    if (moving) {
      movement.normalize().multiplyScalar(dt * (pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 0.82 : 1.45));
      const nextX = Math.max(-3.72, Math.min(3.72, basePosition.current.x + movement.x));
      const nextZ = Math.max(-0.72, Math.min(4.05, basePosition.current.z + movement.z));
      if (!isBlocked(nextX, basePosition.current.z)) basePosition.current.x = nextX;
      if (!isBlocked(basePosition.current.x, nextZ)) basePosition.current.z = nextZ;
    }
    const leaning = locked.current && (pressed.has('ShiftLeft') || pressed.has('ShiftRight'));
    const targetHeight = leaning ? 1.49 : 1.64;
    basePosition.current.y += (targetHeight - basePosition.current.y) * Math.min(1, dt * 8);
    camera.position.copy(basePosition.current);
    camera.position.addScaledVector(forward, leaning ? 0.105 : zoom.current ? 0.055 : 0);

    const targetFov = zoom.current ? 29 : 55;
    const perspective = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspective.fov - targetFov) > 0.05) {
      perspective.fov += (targetFov - perspective.fov) * Math.min(1, dt * 8);
      perspective.updateProjectionMatrix();
    }
  });

  // Repère de paillasse active : utilisé par l'interface pour les touches 1 / 2.
  useEffect(() => {
    controller.setBench(bench);
  }, [bench, controller]);

  return null;
}

/* --------------------------------- lumière -------------------------------- */

function Lights({ quality }: { quality: Quality }) {
  const preset = QUALITY_PRESETS[quality];
  return (
    <>
      <ambientLight intensity={quality === 'low' ? 0.62 : 0.48} color="#e9efed" />
      <hemisphereLight args={['#f5f7f2', '#87918e', quality === 'low' ? 0.85 : 0.68]} />
      <directionalLight
        position={[1.8, 4.8, 3.4]}
        intensity={quality === 'low' ? 1.9 : 1.65}
        color="#f8faf4"
        castShadow={preset.shadows}
        shadow-mapSize-width={preset.shadowMapSize}
        shadow-mapSize-height={preset.shadowMapSize}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-bias={-0.00025}
      />
      {preset.pointLights && (
        <>
          <pointLight position={[-1.5, 2.55, 0.5]} intensity={7.5} distance={5} decay={2} color="#edf5f1" />
          <pointLight position={[1.5, 2.55, 0.5]} intensity={7.5} distance={5} decay={2} color="#f4f3e9" />
          <pointLight position={[-2.65, 2.4, 1.6]} intensity={6.5} distance={4.6} decay={2} color="#eef3ee" />
        </>
      )}
    </>
  );
}

/* ---------------------------------- scène --------------------------------- */

export default function LabScene(props: SceneProps) {
  const { controller, quality, bench } = props;
  const preset = QUALITY_PRESETS[quality];
  const hz = preset.screenHz;
  // `quality` est la clé du Canvas : tout changement de qualité remonte le rendu proprement.
  return (
    <Canvas
      key={quality}
      shadows={preset.shadows}
      dpr={preset.dpr}
      camera={{ position: BENCHES[0].position, fov: 55, near: 0.025, far: 30 }}
      gl={{ antialias: quality !== 'low', alpha: false, powerPreference: quality === 'low' ? 'default' : 'high-performance' }}
      frameloop="always"
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.93;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        if (preset.shadows) {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = preset.shadowType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        } else {
          gl.shadowMap.enabled = false;
        }
      }}
    >
      <color attach="background" args={['#dfe4e2']} />
      <fog attach="fog" args={['#dfe4e2', quality === 'low' ? 11 : 8, quality === 'low' ? 26 : 20]} />
      <Lights quality={quality} />
      <Room quality={quality} />

      {/* Paillasse TP1 — dimensions réduites. */}
      <BenchTable spec={TP1_TABLE_SPEC} accent="#3f6f66" />
      <Hotplate sim={controller.tp1} quality={quality} />
      <PressureCooker sim={controller.tp1} quality={quality} hz={hz} />
      <PowerCable sim={controller.tp1} />
      <WallOutlet sim={controller.tp1} />
      <Tablet sim={controller.tp1} quality={quality} hz={hz} />
      <AcquisitionMonitor tp1={controller.tp1} tp2={controller.tp2} bench={bench} quality={quality} hz={hz} />

      {/* Paillasse TP2 — calorimétrie. */}
      <BenchTable position={TP2_ORIGIN} spec={TP2_TABLE_SPEC} accent="#3f5f8f" />
      <Tp2Bench sim={controller.tp2} quality={quality} hz={hz} />
      <Wiring sim={controller.tp2} quality={quality} />
      <Tp2BenchNotice />

      <SimulationRunner controller={controller} onFps={props.onFps} quality={quality} />
      <FirstPersonController {...props} />
    </Canvas>
  );
}
