/* ------------------------------------------------------------------ *
 *  THERMO.lab — noyau partagé (qualité, temps, formats, incertitudes) *
 * ------------------------------------------------------------------ */

export const ATM_PRESSURE = 1.025; // bar — valeur donnée par l'énoncé du TP1
export const ROOM_TEMP = 21.5; // °C — température de la salle de TP

/** Niveau de qualité graphique choisi par l'utilisateur. */
export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  id: Quality;
  label: string;
  short: string;
  detail: string;
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  shadowType: 'basic' | 'pcf' | 'pcfsoft';
  particles: number; // 0 = aucun jet de vapeur, 1 = nominal
  geometryDetail: number; // multiplicateur du nombre de segments des cylindres
  pointLights: boolean;
  screenHz: number; // fréquence de redraw des écrans canvas
  hudHz: number; // fréquence de refresh de l'interface HTML
  rayHz: number; // fréquence du raycast de visée
  transmit: boolean; // matériaux à transmission (verre / eau)
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: {
    id: 'low',
    label: 'Basse',
    short: 'BASSE',
    detail: 'Ombres désactivées, effets réduits, écrans rafraîchis à 5 Hz. Pour les machines modestes ou les gros ralentissements.',
    dpr: [0.6, 0.85],
    shadows: false,
    shadowMapSize: 512,
    shadowType: 'basic',
    particles: 0.35,
    geometryDetail: 0.5,
    pointLights: false,
    screenHz: 5,
    hudHz: 5,
    rayHz: 20,
    transmit: false,
  },
  medium: {
    id: 'medium',
    label: 'Moyenne',
    short: 'MOYENNE',
    detail: 'Équilibre recommandé : ombres douces allégées, vapeur limitée, écrans à 8 Hz.',
    dpr: [0.85, 1.35],
    shadows: true,
    shadowMapSize: 1024,
    shadowType: 'pcf',
    particles: 0.65,
    geometryDetail: 0.75,
    pointLights: true,
    screenHz: 8,
    hudHz: 8,
    rayHz: 30,
    transmit: false,
  },
  high: {
    id: 'high',
    label: 'Haute',
    short: 'HAUTE',
    detail: 'Rendu complet : ombres PCF douces 2048, transmission du verre et de l’eau, tous les effets.',
    dpr: [1, 1.75],
    shadows: true,
    shadowMapSize: 2048,
    shadowType: 'pcfsoft',
    particles: 1,
    geometryDetail: 1,
    pointLights: true,
    screenHz: 12,
    hudHz: 12,
    rayHz: 60,
    transmit: true,
  },
};

export const QUALITY_ORDER: Quality[] = ['low', 'medium', 'high'];

/** Segments d'un cylindre selon le niveau de qualité (jamais sous 8). */
export function segments(base: number, detail: number): number {
  return Math.max(8, Math.round(base * detail));
}

/* ------------------------------ temps ------------------------------ */

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
}

/* --------------------------- incertitudes --------------------------- */

/**
 * Incertitude de lecture d'un appareil analogique :
 *   (ΔX)lecture = 1 × calibre / nombre total de graduations
 */
export function readingUncertainty(calibre: number, divisions: number): number {
  return calibre / Math.max(1, divisions);
}

/**
 * Incertitude instrumentale d'un appareil analogique de classe donnée :
 *   (ΔX)instrument = classe × calibre² / 100   (forme retenue par l'énoncé)
 */
export function instrumentUncertainty(classe: number, calibre: number): number {
  return (classe * calibre * calibre) / 100;
}

/** ΔU = (ΔU)lecture + (ΔU)instrument — somme arithmétique, comme dans l'énoncé. */
export function analogUncertainty(classe: number, calibre: number, divisions: number): number {
  return readingUncertainty(calibre, divisions) + instrumentUncertainty(classe, calibre);
}

/** Composition quadratique d'incertitudes relatives. */
export function relativeSum(...terms: number[]): number {
  return Math.sqrt(terms.reduce((acc, t) => acc + (Number.isFinite(t) ? t * t : 0), 0));
}

/** Composition linéaire (|∂f/∂xᵢ| Δxᵢ) — méthode de l'énoncé du TP2. */
export function absoluteSum(...terms: number[]): number {
  return terms.reduce((acc, t) => acc + (Number.isFinite(t) ? Math.abs(t) : 0), 0);
}

/* ----------------------------- divers ------------------------------ */

export type NoticeTone = 'info' | 'success' | 'warning';

export interface LabEvent {
  id: number;
  time: number;
  text: string;
  tone: NoticeTone;
}

export interface ProtocolStep {
  id: string;
  label: string;
  detail: string;
  done: boolean;
}

export const SPEEDS = [1, 4, 12, 30] as const;

/** Téléportation / trajet de caméra entre les deux paillasses. */
export interface BenchView {
  id: 'tp1' | 'tp2';
  label: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
}

export const BENCHES: BenchView[] = [
  { id: 'tp1', label: 'TP1 · Équilibre liquide–vapeur', position: [0, 1.64, 1.62], yaw: 0, pitch: -0.245 },
  { id: 'tp2', label: 'TP2 · Calorimétrie', position: [-2.55, 1.64, 2.12], yaw: -0.72, pitch: -0.22 },
];
