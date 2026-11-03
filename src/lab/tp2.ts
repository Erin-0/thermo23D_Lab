/* --------------------------------------------------------------------------- *
 *  TP2 — Calorimétrie                                                          *
 *                                                                             *
 *  Calorimètre adiabatique (grand cylindre) + trois appareils de paillasse :    *
 *  alimentation continue, ampèremètre analogique, voltmètre analogique,         *
 *  avec balance électronique, thermomètre 1/10 °C, chronomètre, agitateur,      *
 *  résistance chauffante, béchers et masse de cuivre.                          *
 *                                                                             *
 *  Partie A : chaleur massique du cuivre par méthode du mélange.               *
 *  Partie B : équivalence énergie électrique / chaleur — coefficient de Joule.  *
 * --------------------------------------------------------------------------- */

import {
  ATM_PRESSURE,
  ROOM_TEMP,
  SPEEDS,
  absoluteSum,
  analogUncertainty,
  formatTime,
  instrumentUncertainty,
  readingUncertainty,
  relativeSum,
  type LabEvent,
  type NoticeTone,
  type ProtocolStep,
} from './shared';

/* ------------------------- données de la salle ------------------------- */

/** Valeur en eau du calorimètre, affichée sur le panneau mural de la salle. */
export const MU0 = 32.5; // g
export const D_MU0 = 0.01; // g
/** Chaleur massique de l'eau et son incertitude relative (données de l'énoncé). */
export const C0 = 1; // cal·g⁻¹·°C⁻¹
export const D_C0_REL = 0.05; // 5 %
/** Chaleur massique du cuivre donnée par les tables. */
export const C_CU_TABLE = 0.1; // cal·g⁻¹·°C⁻¹
/** Incertitudes imposées par l'énoncé. */
export const D_THETA = 0.1; // °C (θ0, θ1, θf) — thermomètre gradué au 1/10 de degré
export const D_MASS = 0.01; // g (balance électronique, une seule pesée)
export const D_T_CHRONO = 0.2; // s (chronomètre)
export const CAL_TO_JOULE = 4.184; // J/cal (valeur de référence)

/* --------------------------- appareils (3 + 1) -------------------------- */

export const AMMETER_CALIBRES = [0.3, 0.6, 1.2, 2.4]; // A
export const VOLTMETER_CALIBRES = [3, 7.5, 15, 30]; // V
export const METER_DIVISIONS = 30; // graduations totales de l'échelle choisie
export const AMMETER_CLASS = 1.5;
export const VOLTMETER_CLASS = 1.5;

export const RESISTOR_R = 11.4; // Ω — résistance chauffante immergée
export const GEN_INTERNAL_R = 0.6; // Ω
export const GEN_MAX_CURRENT = 2.4; // A (limitation de l'alimentation)
export const TARGET_HEATING_TIME = 180; // s — « laisser passer le courant 3 minutes »

export const BEAKER_MAX_G = 220; // g d'eau dans le bécher
export const VESSEL_MAX_G = 420; // g d'eau dans le vase calorimétrique
export const COPPER_MASS = 121.3; // g — masse du morceau de cuivre
export const VESSEL_MASS = 96.4; // g — vase calorimétrique seul (aluminium)

/* ------------------------------- câblage -------------------------------- */

export type TerminalId = 'genP' | 'genN' | 'ammA' | 'ammB' | 'coilA' | 'coilB' | 'swA' | 'swB' | 'voltP' | 'voltN';

export interface Terminal {
  id: TerminalId;
  device: string;
  sign: '+' | '−';
  /** Position monde (paillasse TP2) — remplie par les modèles 3D. */
  position: [number, number, number];
  label: string;
}

export interface WireLink {
  a: TerminalId;
  b: TerminalId;
  color: string;
  purpose: string;
}

/** Chaîne série attendue + voltmètre en dérivation aux bornes de la résistance. */
export const REQUIRED_LINKS: WireLink[] = [
  { a: 'genP', b: 'ammA', color: '#c0453a', purpose: 'Départ + alimentation → ampèremètre' },
  { a: 'ammB', b: 'coilA', color: '#c0453a', purpose: 'Ampèremètre → borne haute de la résistance' },
  { a: 'coilB', b: 'swA', color: '#2f3a3d', purpose: 'Résistance → interrupteur' },
  { a: 'swB', b: 'genN', color: '#2f3a3d', purpose: 'Interrupteur → retour − alimentation' },
  { a: 'coilA', b: 'voltP', color: '#3f6fa8', purpose: 'Voltmètre en dérivation (borne +)' },
  { a: 'coilB', b: 'voltN', color: '#3f6fa8', purpose: 'Voltmètre en dérivation (borne −)' },
];

export function sameLink(a: TerminalId, b: TerminalId, link: WireLink): boolean {
  return (link.a === a && link.b === b) || (link.a === b && link.b === a);
}

export function findRequiredLink(a: TerminalId, b: TerminalId): WireLink | undefined {
  return REQUIRED_LINKS.find((link) => sameLink(a, b, link));
}

export interface Connection {
  a: TerminalId;
  b: TerminalId;
  color: string;
}

/* --------------------------------- état --------------------------------- */

export type VesselPlace = 'bench' | 'balance' | 'calorimeter';
export type CopperPlace = 'bench' | 'balance' | 'vessel';

export interface PartARecord {
  mv: number | null;
  m0: number | null;
  mCu: number | null;
  theta0: number | null;
  theta1: number | null;
  thetaF: number | null;
  mTotal: number | null;
  m1: number | null;
}

export interface PartBRecord {
  mv: number | null;
  m0: number | null;
  theta0: number | null;
  thetaF: number | null;
  u: number | null;
  i: number | null;
  t: number | null;
  voltCalibre: number | null;
  ammCalibre: number | null;
}

export interface Tp2State {
  time: number;
  speed: number;
  events: LabEvent[];
  notice: LabEvent;

  // — calorimètre (grand cylindre) —
  lidClosed: boolean;
  thermometerIn: boolean;
  stirring: boolean;
  stirAngle: number;
  vesselPlace: VesselPlace;
  vesselWater: number; // g d'eau froide/chaude dans le vase
  vesselTemp: number; // °C
  copperPlace: CopperPlace;
  copperTemp: number; // °C
  wallTemp: number; // °C — paroi + accessoires (valeur en eau μ₀)
  mu0: number; // g (affiché en salle)
  dMu0: number;
  ambient: number;

  // — partie A : eau chaude & cuivre préchauffés au bain —
  beakerWater: number; // g
  beakerTemp: number; // °C
  beakerHeater: number; // 0..3
  hotPlateTemp: number; // °C
  selectedVolume: number; // mL de l'éprouvette choisie
  pouredHot: number; // g réellement versés
  theta1AtPour: number | null;

  // — balance électronique —
  balanceTare: number; // g
  balanceLoad: 'none' | 'vessel' | 'copper';
  balanceStableAt: number;

  // — partie B : montage électrique —
  generatorOn: boolean;
  generatorVoltage: number; // V (consigne à vide)
  switchClosed: boolean;
  ammeterCalibre: number;
  voltmeterCalibre: number;
  connections: Connection[];
  wireInHand: TerminalId | null;
  voltage: number; // V mesuré (avec bruit d'aiguille)
  current: number; // A mesuré
  resistorPower: number; // W
  circuitClosed: boolean;

  // — chronomètre —
  chrono: number;
  chronoRunning: boolean;
  heatingTime: number; // s pendant lesquelles le courant a circulé
  heatingStarted: boolean;
  heatingStopped: boolean;

  // — relevés et exploitation —
  partA: PartARecord;
  partB: PartBRecord;
  partADone: boolean;
  partBDone: boolean;
  /** Formule d'incertitude analogique retenue : 'manual' = classe × calibre² / 100 (énoncé), 'normalized' = classe × calibre / 100. */
  analogFormula: 'manual' | 'normalized';
  /** Étapes du protocole déjà accomplies (mémorisées : la liste ne revient pas en arrière). */
  achieved: Record<string, boolean>;
  equilibriumReached: boolean;
  finalEquilibrium: boolean;
  stirSeconds: number;
  wireWarningAt: number;
}

function initialPartA(): PartARecord {
  return { mv: null, m0: null, mCu: null, theta0: null, theta1: null, thetaF: null, mTotal: null, m1: null };
}

function initialPartB(): PartBRecord {
  return { mv: null, m0: null, theta0: null, thetaF: null, u: null, i: null, t: null, voltCalibre: null, ammCalibre: null };
}

function initialState(): Tp2State {
  const notice: LabEvent = {
    id: 1,
    time: 0,
    text: 'Paillasse TP2 prête. Valeur en eau du calorimètre μ₀ = 32,5 g (panneau mural). Commencez par la pesée du vase.',
    tone: 'info',
  };
  return {
    time: 0,
    speed: 1,
    events: [notice],
    notice,

    lidClosed: false,
    thermometerIn: false,
    stirring: false,
    stirAngle: 0,
    vesselPlace: 'bench',
    vesselWater: 0,
    vesselTemp: ROOM_TEMP - 2,
    copperPlace: 'bench',
    copperTemp: ROOM_TEMP - 2,
    wallTemp: ROOM_TEMP - 2,
    mu0: MU0,
    dMu0: D_MU0,
    ambient: ROOM_TEMP,

    beakerWater: 0,
    beakerTemp: ROOM_TEMP,
    beakerHeater: 0,
    hotPlateTemp: ROOM_TEMP,
    selectedVolume: 100,
    pouredHot: 0,
    theta1AtPour: null,

    balanceTare: 0,
    balanceLoad: 'none',
    balanceStableAt: -10,

    generatorOn: false,
    generatorVoltage: 15,
    switchClosed: false,
    ammeterCalibre: 2.4,
    voltmeterCalibre: 30,
    connections: [],
    wireInHand: null,
    voltage: 0,
    current: 0,
    resistorPower: 0,
    circuitClosed: false,

    chrono: 0,
    chronoRunning: false,
    heatingTime: 0,
    heatingStarted: false,
    heatingStopped: false,

    partA: initialPartA(),
    partB: initialPartB(),
    partADone: false,
    partBDone: false,
    analogFormula: 'manual',
    achieved: {},
    equilibriumReached: false,
    finalEquilibrium: false,
    stirSeconds: 0,
    wireWarningAt: -100,
  };
}

/* --------------------------- grandeurs lues ---------------------------- */

export function balanceReading(s: Tp2State): number {
  if (s.balanceLoad === 'copper') return Math.max(-999, COPPER_MASS - s.balanceTare);
  if (s.balanceLoad !== 'vessel') return 0;
  const gross = VESSEL_MASS + s.vesselWater + (s.copperPlace === 'vessel' ? COPPER_MASS : 0);
  return Math.max(-999, gross - s.balanceTare);
}

export function deltaU(s: Tp2State): number {
  return s.analogFormula === 'normalized'
    ? readingUncertainty(s.voltmeterCalibre, METER_DIVISIONS) + normUncertainty(VOLTMETER_CLASS, s.voltmeterCalibre)
    : analogUncertainty(VOLTMETER_CLASS, s.voltmeterCalibre, METER_DIVISIONS);
}

export function deltaI(s: Tp2State): number {
  return s.analogFormula === 'normalized'
    ? readingUncertainty(s.ammeterCalibre, METER_DIVISIONS) + normUncertainty(AMMETER_CLASS, s.ammeterCalibre)
    : analogUncertainty(AMMETER_CLASS, s.ammeterCalibre, METER_DIVISIONS);
}

/** Incertitude « normalisée » (classe × calibre / 100), donnée à titre de comparaison. */
export function normUncertainty(classe: number, calibre: number): number {
  return (classe * calibre) / 100;
}

export function meterDivisions(value: number, calibre: number): number {
  return (Math.max(0, value) / calibre) * METER_DIVISIONS;
}

/* ------------------------- exploitation partie A ------------------------ */

export interface CuResult {
  value: number;
  delta: number;
  relative: number;
  terms: { name: string; value: number }[];
  deviation: number;
}

/**
 *  c_cu = [ m₁·c₀·(θ₁−θf) − (m₀+μ₀)·c₀·(θf−θ₀) ] / [ m_cu·(θf−θ₀) ]
 *  Δc_cu = Σ |∂c_cu/∂xᵢ|·Δxᵢ
 */
export function computeCopper(s: Tp2State): CuResult | null {
  const { m0, mCu, m1, theta0, theta1, thetaF } = s.partA;
  if (m0 == null || mCu == null || m1 == null || theta0 == null || theta1 == null || thetaF == null) return null;
  const dT = thetaF - theta0;
  if (Math.abs(dT) < 1e-6 || mCu <= 0) return null;
  const mu0 = s.mu0;
  const A = m1 * C0 * (theta1 - thetaF);
  const B = (m0 + mu0) * C0 * dT;
  const value = (A - B) / (mCu * dT);

  const dM1 = (C0 * (theta1 - thetaF)) / (mCu * dT);
  const dTheta1 = (m1 * C0) / (mCu * dT);
  const dM0 = -(C0 * dT) / (mCu * dT);
  const dMu0 = dM0;
  const dTheta0 = (B - A) / (mCu * dT * dT);
  const dThetaF = (-(m1 * C0) - (m0 + mu0) * C0) / (mCu * dT) - (A - B) / (mCu * dT * dT);
  const dMCu = -(A - B) / (mCu * mCu * dT);
  const dC0 = ((m1 * (theta1 - thetaF)) - (m0 + mu0) * dT) / (mCu * dT);

  const terms = [
    { name: 'm₁', value: Math.abs(dM1) * D_MASS },
    { name: 'm₀', value: Math.abs(dM0) * D_MASS },
    { name: 'm_cu', value: Math.abs(dMCu) * D_MASS },
    { name: 'μ₀', value: Math.abs(dMu0) * D_MU0 },
    { name: 'θ₀', value: Math.abs(dTheta0) * D_THETA },
    { name: 'θ₁', value: Math.abs(dTheta1) * D_THETA },
    { name: 'θf', value: Math.abs(dThetaF) * D_THETA },
    { name: 'c₀', value: Math.abs(dC0) * C0 * D_C0_REL },
  ];
  const delta = absoluteSum(...terms.map((t) => t.value));
  return {
    value,
    delta,
    relative: value !== 0 ? delta / Math.abs(value) : 0,
    terms,
    deviation: Math.abs(value - C_CU_TABLE) / C_CU_TABLE,
  };
}

/* ------------------------- exploitation partie B ------------------------ */

export interface JouleResult {
  we: number;
  dWe: number;
  q: number;
  dQ: number;
  j: number;
  dJ: number;
  relWe: number;
  relQ: number;
  deviation: number;
}

export function computeJoule(s: Tp2State): JouleResult | null {
  const { m0, theta0, thetaF, u, i, t } = s.partB;
  if (m0 == null || theta0 == null || thetaF == null || u == null || i == null || t == null) return null;
  const we = u * i * t; // J
  const q = (m0 + s.mu0) * C0 * (thetaF - theta0); // cal
  if (q <= 0 || we <= 0) return null;

  const relWe = relativeSum(u !== 0 ? deltaU(s) / u : 0, i !== 0 ? deltaI(s) / i : 0, t !== 0 ? D_T_CHRONO / t : 0);
  const dWe = we * relWe;

  const dTheta = Math.sqrt(D_THETA * D_THETA + D_THETA * D_THETA); // θf − θ₀
  const dM0Rel = D_MASS / Math.max(1e-6, m0 + s.mu0);
  const relQ = relativeSum(dM0Rel, s.dMu0 / Math.max(1e-6, m0 + s.mu0), D_C0_REL, (thetaF - theta0) !== 0 ? dTheta / (thetaF - theta0) : 0);
  const dQ = q * relQ;

  const j = we / q;
  const relJ = relativeSum(relWe, relQ);
  const dJ = j * relJ;
  return { we, dWe, q, dQ, j, dJ, relWe, relQ, deviation: Math.abs(j - CAL_TO_JOULE) / CAL_TO_JOULE };
}

/** Détail des incertitudes analogiques, affiché dans le panneau de données. */
export function analogBreakdown(s: Tp2State) {
  return {
    uReading: readingUncertainty(s.voltmeterCalibre, METER_DIVISIONS),
    uInstrument: instrumentUncertainty(VOLTMETER_CLASS, s.voltmeterCalibre),
    uNorm: normUncertainty(VOLTMETER_CLASS, s.voltmeterCalibre),
    iReading: readingUncertainty(s.ammeterCalibre, METER_DIVISIONS),
    iInstrument: instrumentUncertainty(AMMETER_CLASS, s.ammeterCalibre),
    iNorm: normUncertainty(AMMETER_CLASS, s.ammeterCalibre),
  };
}

/* ------------------------------- protocole ------------------------------ */

export function getProtocol(s: Tp2State): ProtocolStep[] {
  const wires = s.connections.length;
  /** Une étape accomplie reste cochée même si l'on revient en arrière ensuite. */
  const done = (id: string, live: boolean): boolean => s.achieved[id] === true || live;
  return [
    { id: 'mv', label: 'Peser le vase calorimétrique (mᵥ)', detail: 'Poser le vase sur la balance (clic), lire mᵥ sur l’afficheur puis le retirer (clic droit sur la balance).', done: done('mv', s.partA.mv != null) },
    { id: 'm0', label: 'Mettre de l’eau froide et peser m₀', detail: 'Choisir une éprouvette (100–200 mL), remplir le vase, le reposer sur la balance : m₀ = m(eau+vase) − mᵥ.', done: done('m0', s.partA.m0 != null) },
    { id: 'mcu', label: 'Peser la masse de cuivre m_cu', detail: 'Clic sur le cuivre : il se pose sur la balance. Clic sur l’afficheur pour consigner m_cu.', done: done('mcu', s.partA.mCu != null) },
    { id: 'incu', label: 'Introduire le cuivre dans le calorimètre', detail: 'Clic droit sur le cuivre : il est plongé dans le vase (eau froide + cuivre = le mélange de départ).', done: done('incu', s.copperPlace === 'vessel') },
    { id: 'close', label: 'Fermer, mettre le thermomètre, agiter ≈ 5 min', detail: 'Couvercle, thermomètre, agitateur : attendre l’équilibre thermique du mélange.', done: done('close', s.partA.theta0 != null) },
    { id: 'theta0', label: 'Relever θ₀', detail: 'Clic sur le thermomètre une fois la température stabilisée (2 min d’agitation minimum).', done: done('theta0', s.partA.theta0 != null) },
    { id: 'heat', label: 'Chauffer m₁ d’eau dans le bécher', detail: 'Remplir le bécher (clic droit), régler le chauffe-bécher, viser θ₁ ≈ 75 à 90 °C (trop près de l’ébullition, (θ₁−θf) s’effondre et Δc_cu explose).', done: done('heat', s.beakerTemp >= 85 && s.beakerWater >= 40) },
    { id: 'pour', label: 'Verser l’eau chaude dans le calorimètre', detail: 'Clic sur le bécher : m₁ = volume de l’éprouvette choisie ; θ₁ est relevée automatiquement au versement.', done: done('pour', s.pouredHot > 0) },
    { id: 'thetaf', label: 'Agiter 1 min et relever θf', detail: 'Clic sur le thermomètre dès que la température ne varie plus.', done: done('thetaf', s.partA.thetaF != null) },
    { id: 'mtot', label: 'Peser le vase final et déduire m₁', detail: 'Retirer thermomètre et couvercle, poser le vase sur la balance, clic sur l’afficheur : m₁ = m_total − mᵥ − m₀ − m_cu.', done: done('mtot', s.partA.mTotal != null) },
    { id: 'exploiA', label: 'Exploiter : c_cu et Δc_cu', detail: 'Onglet TP2 · A — comparer à la valeur des tables 0,100 cal·g⁻¹·°C⁻¹.', done: done('exploiA', s.partADone) },
    { id: 'prepB', label: 'Préparer la partie B (eau seule)', detail: 'Sortir le cuivre, vider et essuyer le vase, remettre m₀ ≈ 150 g d’eau, peser, refermer avec le thermomètre.', done: done('prepB', s.partB.m0 != null && s.copperPlace !== 'vessel') },
    { id: 'theta0b', label: 'Attendre la stabilisation, relever θ₀', detail: 'Température constante (agitateur en marche) avant de faire passer le courant.', done: done('theta0b', s.partB.theta0 != null) },
    { id: 'wiring', label: 'Réaliser le montage électrique (6 fils)', detail: 'Clic sur une borne : le fil reste en main ; le clic suivant le connecte automatiquement à la borne visée.', done: done('wiring', wires >= REQUIRED_LINKS.length) },
    { id: 'calibres', label: 'Choisir les calibres (A : 2,4 A ; V : 30 V)', detail: 'Clic sur le sélecteur d’un appareil analogique : calibre juste au-dessus de la valeur mesurée.', done: done('calibres', s.ammeterCalibre === 2.4 && s.voltmeterCalibre === 30) },
    { id: 'gen', label: 'Mettre en marche le générateur (≈ 15 V)', detail: 'Bouton poussoir de l’alimentation continue ; molette ou clic droit pour régler la tension.', done: done('gen', s.generatorOn) },
    { id: 'switch', label: 'Fermer l’interrupteur + démarrer le chrono', detail: 'Les deux gestes doivent être simultanés ; sinon le TP demande de recommencer la mesure.', done: done('switch', s.heatingStarted && s.chronoRunning) },
    { id: 'stir3', label: 'Agiter doucement pendant 3 minutes', detail: 'Agitateur en marche ; le courant circule 180 s.', done: done('stir3', s.heatingTime >= TARGET_HEATING_TIME - 1) },
    { id: 'recordUI', label: 'Consigner U, I et les calibres', detail: 'Clic sur « Consigner U & I » dans le panneau ou sur l’écran du voltmètre.', done: done('recordUI', s.partB.u != null && s.partB.i != null) },
    { id: 'stop', label: 'Couper le courant, continuer à agiter', detail: 'Ouvrir l’interrupteur puis attendre θf (équilibre).', done: done('stop', s.heatingStopped && !s.switchClosed) },
    { id: 'thetafb', label: 'Relever θf de la partie B', detail: 'Clic sur le thermomètre une fois l’équilibre atteint.', done: done('thetafb', s.partB.thetaF != null) },
    { id: 'exploiB', label: 'Exploiter : Wₑ, Q, J et incertitudes', detail: 'Onglet TP2 · B — comparer J à 4,18 J/cal.', done: done('exploiB', s.partBDone) },
  ];
}

/* ------------------------------ simulation ------------------------------ */

const WALL_C = MU0 * 4.184; // J/K — valeur en eau du calorimètre
const LOSS_OPEN = 0.55; // W/K couvercle ouvert
const LOSS_CLOSED = 0.008; // W/K couvercle fermé : enceinte adiabatique (pertes résiduelles faibles)
const COPPER_C = COPPER_MASS * 0.385; // J/K
const BEAKER_C = 62; // J/K — verre du bécher

export class Tp2Simulation {
  state: Tp2State = initialState();
  /** Instant du versement de l'eau chaude (impose ~1 min d'agitation avant θf). */
  pourTime = 0;
  /** Instant de coupure du courant (impose l'attente de l'équilibre avant θf). */
  stopTime = 0;
  private eventId = 2;
  private warningClock = -100;

  reset = (): void => {
    const speed = this.state.speed;
    this.state = initialState();
    this.state.speed = speed;
    this.eventId = 2;
    this.warningClock = -100;
    this.pourTime = 0;
    this.stopTime = 0;
    this.notify('TP2 réinitialisé : calorimètre vide, montage démonté, chronomètre à zéro.', 'info');
  };

  notify(text: string, tone: NoticeTone = 'info'): void {
    const event: LabEvent = { id: this.eventId++, time: this.state.time, text, tone };
    this.state.notice = event;
    this.state.events = [event, ...this.state.events].slice(0, 40);
  }

  setSpeed(speed: number): void {
    if (SPEEDS.includes(speed as (typeof SPEEDS)[number])) this.state.speed = speed;
  }

  /** Bascule la formule d'incertitude analogique (énoncé ↔ normalisée). */
  setAnalogFormula(formula: 'manual' | 'normalized'): void {
    if (this.state.analogFormula === formula) return;
    this.state.analogFormula = formula;
    this.notify(
      formula === 'manual'
        ? `Incertitudes analogiques — formule de l’énoncé (classe × calibre² / 100) : ΔU = ${deltaU(this.state).toFixed(3)} V, ΔI = ${deltaI(this.state).toFixed(4)} A.`
        : `Incertitudes analogiques — forme normalisée (classe × calibre / 100) : ΔU = ${deltaU(this.state).toFixed(3)} V, ΔI = ${deltaI(this.state).toFixed(4)} A.`,
      'info',
    );
  }

  setSelectedVolume(volume: number): void {
    this.state.selectedVolume = volume;
    this.notify(`Éprouvette sélectionnée : ${volume} mL (≈ ${volume} g d’eau).`, 'info');
  }

  /** Clic sur une éprouvette : choisit le volume qui sera versé ensuite. */
  cycleVolume(backwards = false): void {
    const s = this.state;
    const volumes = [50, 100, 150, 200];
    const index = Math.max(0, volumes.indexOf(s.selectedVolume));
    const next = volumes[(index + (backwards ? volumes.length - 1 : 1)) % volumes.length];
    s.selectedVolume = next;
    this.notify(`Éprouvette ${next} mL sélectionnée : ce volume sera versé (≈ ${next} g d’eau).`, 'info');
  }

  /* ------------------------------ balance ------------------------------ */

  /** Clic sur la balance : pose ou retrait du vase calorimétrique. */
  vesselOnBalance(): void {
    const s = this.state;
    if (s.vesselPlace === 'balance') {
      this.balanceRemoveFromPan();
      return;
    }
    if (s.vesselPlace === 'calorimeter') {
      this.notify('Sortez d’abord le vase du calorimètre (clic droit sur le calorimètre).', 'warning');
      return;
    }
    if (s.copperPlace === 'balance') {
      s.copperPlace = 'bench';
      s.balanceLoad = 'none';
      this.notify('Masse de cuivre retirée du plateau pour laisser la place au vase.', 'info');
    }
    s.vesselPlace = 'balance';
    s.balanceLoad = 'vessel';
    s.balanceStableAt = s.time;
    this.notify(
      `Vase posé sur le plateau : ${balanceReading(s).toFixed(2)} g (résolution 0,01 g, Δm = ${D_MASS} g). Clic sur l’afficheur pour consigner, clic droit pour tarer.`,
      'success',
    );
  }

  balanceRemoveFromPan(): void {
    const s = this.state;
    if (s.copperPlace === 'balance') {
      s.copperPlace = 'bench';
      s.balanceLoad = 'none';
      this.notify('Masse de cuivre retirée du plateau : elle revient sur sa coupelle.', 'info');
      return;
    }
    if (s.vesselPlace !== 'balance') {
      this.notify('Aucun vase sur le plateau de la balance.', 'info');
      return;
    }
    s.vesselPlace = 'bench';
    s.balanceLoad = 'none';
    this.notify('Vase retiré du plateau : l’afficheur revient à 0,00 g.', 'info');
  }

  /** Clic sur l’afficheur : consigne la masse utile selon l’avancement du protocole. */
  recordFromBalance(): void {
    const s = this.state;
    if (s.vesselPlace !== 'balance') {
      if (s.copperPlace === 'balance') {
        s.partA.mCu = COPPER_MASS;
        this.notify(`m_cu = ${COPPER_MASS.toFixed(2)} g consigné (Δm = ${D_MASS} g). Introduisez maintenant le cuivre dans le calorimètre (clic droit sur le cuivre).`, 'success');
        return;
      }
      this.notify('Posez d’abord le vase sur le plateau (clic sur la balance).', 'warning');
      return;
    }
    const gross = VESSEL_MASS + s.vesselWater + (s.copperPlace === 'vessel' ? COPPER_MASS : 0);
    const reading = balanceReading(s);
    if (reading <= 0.02) {
      this.notify('Afficheur à zéro : la tare compense la charge. Clic droit sur l’afficheur pour annuler la tare.', 'info');
      return;
    }
    s.balanceStableAt = s.time;
    if (s.vesselWater < 1 && s.partA.mv == null) {
      s.partA.mv = gross;
      s.partB.mv = gross;
      this.notify(`mᵥ = ${gross.toFixed(2)} g consigné : masse du vase calorimétrique vide.`, 'success');
    } else if (s.vesselWater >= 1 && s.partA.m0 == null) {
      const mv = s.partA.mv ?? VESSEL_MASS;
      s.partA.m0 = gross - mv;
      this.notify(`m₀ = m(eau+vase) − mᵥ = ${gross.toFixed(2)} − ${mv.toFixed(2)} = ${s.partA.m0.toFixed(2)} g consigné.`, 'success');
    } else if (s.pouredHot > 0 && s.partA.mTotal == null) {
      const mv = s.partA.mv ?? VESSEL_MASS;
      s.partA.mTotal = gross;
      s.partA.m1 = gross - mv - (s.partA.m0 ?? 0) - (s.copperPlace === 'vessel' ? COPPER_MASS : 0);
      s.partA.theta1 = s.theta1AtPour;
      this.notify(
        `m_total = ${gross.toFixed(2)} g → m₁ = m_total − mᵥ − m₀${s.copperPlace === 'vessel' ? ' − m_cu' : ''} = ${(s.partA.m1 ?? 0).toFixed(2)} g ; θ₁ = ${(s.theta1AtPour ?? 0).toFixed(1)} °C.`,
        'success',
      );
    } else if (s.partA.mTotal != null && s.vesselWater >= 1 && s.partB.m0 == null) {
      const mv = s.partB.mv ?? VESSEL_MASS;
      s.partB.m0 = gross - mv - (s.copperPlace === 'vessel' ? COPPER_MASS : 0);
      this.notify(`Partie B — m₀ = ${s.partB.m0.toFixed(2)} g consigné.`, 'success');
    } else {
      this.notify(`Lecture : ${reading.toFixed(2)} g (charge totale ${gross.toFixed(2)} g).`, 'info');
    }
  }

  /** Tare : remise à zéro de l’afficheur avec la charge présente. */
  balanceTareAction(): void {
    const s = this.state;
    if (s.vesselPlace !== 'balance') {
      this.notify('Rien à tarer : le plateau est vide.', 'warning');
      return;
    }
    s.balanceTare = VESSEL_MASS + s.vesselWater + (s.copperPlace === 'vessel' ? COPPER_MASS : 0);
    s.balanceStableAt = s.time;
    this.notify(`Tare effectuée : 0,00 g affiché avec ${s.balanceTare.toFixed(2)} g sur le plateau.`, 'success');
  }

  /* --------------------------- calorimètre ----------------------------- */

  toggleLid(button: number): void {
    const s = this.state;
    if (button === 2 || s.lidClosed) {
      if (!s.lidClosed && s.vesselPlace !== 'calorimeter') {
        this.notify('Placez d’abord le vase dans le calorimètre (clic droit sur le calorimètre).', 'warning');
        return;
      }
      s.lidClosed = !s.lidClosed;
      if (!s.lidClosed) s.stirring = false;
      this.notify(s.lidClosed ? 'Couvercle du calorimètre fermé, joint en place.' : 'Couvercle retiré.', s.lidClosed ? 'success' : 'info');
      return;
    }
    this.notify('Clic droit pour fermer le couvercle, clic gauche pour l’ouvrir.', 'info');
  }

  toggleThermometer(): void {
    const s = this.state;
    if (!s.lidClosed && !s.thermometerIn) {
      this.notify('Fermez le couvercle avant d’y mettre le thermomètre (0–110 °C, gradué au 1/10).', 'warning');
      return;
    }
    s.thermometerIn = !s.thermometerIn;
    this.notify(s.thermometerIn ? 'Thermomètre en place dans le couvercle.' : 'Thermomètre retiré du couvercle.', s.thermometerIn ? 'success' : 'info');
  }

  readThermometer(button: number): void {
    const s = this.state;
    if (!s.thermometerIn) {
      this.notify('Le thermomètre n’est pas dans le calorimètre.', 'warning');
      return;
    }
    const theta = this.displayedTemperature();
    if (button === 2) {
      this.notify(`Thermomètre : ${theta.toFixed(1)} °C (lecture au 1/10, incertitude Δθ = ${D_THETA} °C).`, 'info');
      return;
    }
    const inPartB = s.partA.mTotal != null;
    if (!inPartB) {
      if (s.pouredHot <= 0 && s.partA.theta0 == null) {
        if (s.stirSeconds < 120) {
          this.notify(`Agitation insuffisante : ${Math.round(s.stirSeconds)} s sur 120 s minimum (le manuel demande ≈ 5 min). L’équilibre n’est pas atteint : θ₀ serait faussée.`, 'warning');
          return;
        }
        s.partA.theta0 = theta;
        this.notify(`θ₀ = ${theta.toFixed(1)} °C consigné (température initiale du mélange eau + cuivre).`, 'success');
      } else if (s.pouredHot > 0 && s.partA.thetaF == null) {
        if (s.time - this.pourTime < 25) {
          this.notify('Continuez d’agiter environ 1 minute : l’équilibre thermique n’est pas atteint.', 'warning');
          return;
        }
        s.partA.thetaF = theta;
        s.equilibriumReached = true;
        const result = computeCopper(s);
        this.notify(
          result
            ? `θf = ${theta.toFixed(1)} °C. c_cu = ${result.value.toFixed(4)} cal·g⁻¹·°C⁻¹ (avant déduction de m₁ par pesée).`
            : `θf = ${theta.toFixed(1)} °C consigné.`,
          'success',
        );
      } else {
        this.notify(`Lecture : ${theta.toFixed(1)} °C.`, 'info');
      }
      return;
    }
    // Partie B
    if (!s.heatingStarted && s.partB.theta0 == null) {
      const stable = s.stirring && Math.abs(theta - s.wallTemp) < 0.15 && Math.abs(this.driftPerMinute()) < 0.3;
      if (!stable) {
        this.notify(
          !s.stirring
            ? 'Mettez l’agitateur en marche et attendez une température constante avant de relever θ₀.'
            : `La température varie encore de ${this.driftPerMinute().toFixed(2)} °C/min (${theta.toFixed(1)} °C) : attendez la stabilisation.`,
          'warning',
        );
        return;
      }
      s.partB.theta0 = theta;
      this.notify(`Partie B — θ₀ = ${theta.toFixed(1)} °C consigné.`, 'success');
    } else if (s.heatingStopped && s.partB.thetaF == null) {
      if (!s.stirring) {
        this.notify('Continuez d’agiter doucement et constamment jusqu’à θf.', 'warning');
        return;
      }
      if (s.time - this.stopTime < 20) {
        this.notify(`La température monte encore (${theta.toFixed(1)} °C) : attendez l’équilibre avant de relever θf.`, 'warning');
        return;
      }
      s.partB.thetaF = theta;
      s.finalEquilibrium = true;
      const joule = computeJoule(s);
      this.notify(
        joule
          ? `Partie B — θf = ${theta.toFixed(1)} °C. J = ${joule.j.toFixed(2)} ± ${joule.dJ.toFixed(2)} J/cal (référence 4,18).`
          : `Partie B — θf = ${theta.toFixed(1)} °C consigné.`,
        'success',
      );
    } else {
      this.notify(`Lecture : ${theta.toFixed(1)} °C.`, 'info');
    }
  }

  toggleStirrer(): void {
    const s = this.state;
    if (!s.lidClosed) {
      this.notify('Fermez le couvercle pour utiliser l’agitateur.', 'warning');
      return;
    }
    s.stirring = !s.stirring;
    this.notify(s.stirring ? 'Agitateur en marche : homogénéisation de la température.' : 'Agitateur arrêté.', s.stirring ? 'success' : 'info');
  }

  placeVessel(button: number): void {
    const s = this.state;
    if (button === 2) {
      if (s.vesselPlace === 'calorimeter') {
        if (s.lidClosed) {
          this.notify('Retirez le couvercle avant de sortir le vase.', 'warning');
          return;
        }
        s.vesselPlace = 'bench';
        s.stirring = false;
        this.notify('Vase sorti du calorimètre.', 'info');
      } else if (s.vesselWater > 0) {
        s.vesselPlace = 'calorimeter';
        this.notify('Vase replacé dans l’enceinte du calorimètre. Fermez le couvercle et mettez le thermomètre.', 'success');
      } else {
        this.notify('Mettez d’abord de l’eau dans le vase (clic sur le vase).', 'warning');
      }
      return;
    }
    // Clic gauche sur le vase : remplissage, pesée ou information selon le contexte.
    if (s.vesselPlace === 'balance') {
      this.recordFromBalance();
      return;
    }
    if (s.vesselPlace === 'bench' && s.beakerWater >= 5 && s.beakerTemp > 45 && s.pouredHot <= 0) {
      this.pourHotWater();
      return;
    }
    this.notify(
      `Vase calorimétrique : ${s.vesselWater.toFixed(1)} g d’eau à ${s.vesselTemp.toFixed(1)} °C · posé ${s.vesselPlace === 'calorimeter' ? 'dans le calorimètre' : 'sur la paillasse'}.`,
      'info',
    );
  }

  addColdWater(): void {
    const s = this.state;
    if (s.vesselPlace === 'calorimeter') {
      this.notify('Sortez le vase du calorimètre pour le remplir.', 'warning');
      return;
    }
    const volume = s.selectedVolume;
    if (s.vesselWater + volume > VESSEL_MAX_G) {
      this.notify(`Le vase déborderait (${(s.vesselWater + volume).toFixed(0)} g > ${VESSEL_MAX_G} g). Choisissez une éprouvette plus petite.`, 'warning');
      return;
    }
    const coldTemp = ROOM_TEMP - 2;
    const total = s.vesselWater + volume;
    s.vesselTemp = (s.vesselWater * s.vesselTemp + volume * coldTemp) / Math.max(1, total);
    s.vesselWater = total;
    s.balanceStableAt = s.time;
    if (s.partB.m0 != null) {
      s.partB.m0 = null;
      this.notify(
        `${volume} mL d’eau à ${coldTemp.toFixed(1)} °C versés (total ${total.toFixed(1)} g). La masse m₀ de la partie B n’est plus valable : repesez le vase sur la balance.`,
        'warning',
      );
      return;
    }
    this.notify(`${volume} mL d’eau à ${coldTemp.toFixed(1)} °C versés dans le vase (total ${total.toFixed(1)} g).`, 'success');
  }

  emptyVessel(): void {
    const s = this.state;
    if (s.vesselPlace === 'calorimeter') {
      this.notify('Sortez le vase du calorimètre avant de le vider.', 'warning');
      return;
    }
    if (s.vesselWater <= 0) {
      this.notify('Le vase est déjà vide.', 'info');
      return;
    }
    s.vesselWater = 0;
    s.pouredHot = 0;
    s.theta1AtPour = null;
    if (s.partB.m0 != null) s.partB.m0 = null;
    this.notify('Vase vidé et essuyé : prêt pour une nouvelle pesée (m₀ à consigner à nouveau).', 'info');
  }

  /**
   * Cuivre : clic gauche = pesée sur la balance, clic droit = introduction dans le
   * vase calorimétrique (manuel : « mesurer m_cu … et l’introduire ensuite dans le
   * calorimètre ») ou retrait du vase.
   */
  toggleCopper(button: number): void {
    const s = this.state;
    if (button === 2) {
      if (s.copperPlace === 'vessel') {
        if (s.vesselPlace === 'calorimeter' && s.lidClosed) {
          this.notify('Retirez le thermomètre et le couvercle avant de sortir le cuivre du vase.', 'warning');
          return;
        }
        s.copperPlace = 'bench';
        if (s.balanceLoad === 'copper') s.balanceLoad = 'none';
        this.notify('Masse de cuivre sortie du vase : elle refroidit sur la paillasse.', 'info');
        return;
      }
      if (s.vesselPlace === 'calorimeter' && s.lidClosed) {
        this.notify('Ouvrez le couvercle du calorimètre pour y introduire le cuivre.', 'warning');
        return;
      }
      if (s.vesselPlace === 'bench' && s.vesselWater < 1) {
        this.notify('Mettez d’abord la masse m₀ d’eau froide dans le vase avant d’y plonger le cuivre.', 'warning');
        return;
      }
      if (s.vesselWater < 1) {
        this.notify('Le vase est vide : mettez d’abord la masse m₀ d’eau froide.', 'warning');
        return;
      }
      s.copperPlace = 'vessel';
      if (s.balanceLoad === 'copper') s.balanceLoad = 'none';
      if (s.partA.mCu == null) s.partA.mCu = COPPER_MASS;
      this.notify(
        `Masse de cuivre (${COPPER_MASS.toFixed(1)} g à ${s.copperTemp.toFixed(1)} °C) plongée dans le vase : elle fait partie du mélange initial et sera à θ₀.`,
        'success',
      );
      return;
    }
    this.weighCopper();
  }

  weighCopper(): void {
    const s = this.state;
    if (s.copperPlace === 'vessel') {
      this.notify(
        `Masse de cuivre : ${COPPER_MASS.toFixed(2)} g à ${s.copperTemp.toFixed(1)} °C, plongée dans le vase. Clic droit pour la sortir.`,
        'info',
      );
      return;
    }
    if (s.copperPlace === 'bench') {
      if (s.vesselPlace === 'balance') {
        this.notify('Le plateau est occupé par le vase : retirez-le avant de peser le cuivre.', 'warning');
        return;
      }
      s.copperPlace = 'balance';
      s.balanceLoad = 'copper';
      s.balanceStableAt = s.time;
      this.notify(
        `Cuivre posé sur le plateau : ${balanceReading(s).toFixed(2)} g. Cliquez sur l’afficheur (ou sur le cuivre) pour consigner m_cu.`,
        'success',
      );
      return;
    }
    if (s.partA.mCu == null) {
      s.partA.mCu = COPPER_MASS;
      this.notify(
        `m_cu = ${COPPER_MASS.toFixed(2)} g consigné (Δm = ${D_MASS} g). Clic droit sur le cuivre pour l’introduire dans le calorimètre.`,
        'success',
      );
      return;
    }
    this.notify(`m_cu = ${COPPER_MASS.toFixed(2)} g déjà consigné. Clic droit sur le cuivre pour l’introduire dans le vase.`, 'info');
  }

  /* ------------------------- bécher / chauffe -------------------------- */

  /** Clic droit sur le bécher : le remplit s'il est vide, le vide sinon. */
  beakerWaterAction(): void {
    if (this.state.beakerWater > 1) this.emptyBeaker();
    else this.fillBeaker();
  }

  fillBeaker(): void {
    const s = this.state;
    const volume = Math.min(s.selectedVolume, BEAKER_MAX_G);
    s.beakerWater = volume;
    s.beakerTemp = ROOM_TEMP;
    this.notify(`Bécher rempli avec ${volume.toFixed(0)} g d’eau à ${ROOM_TEMP.toFixed(1)} °C.`, 'success');
  }

  emptyBeaker(): void {
    const s = this.state;
    s.beakerWater = 0;
    this.notify('Bécher vidé.', 'info');
  }

  setBeakerHeater(level: number): void {
    const s = this.state;
    s.beakerHeater = Math.max(0, Math.min(3, level));
    const power = [0, 220, 420, 600][s.beakerHeater];
    this.notify(s.beakerHeater === 0 ? 'Chauffe-bécher arrêté.' : `Chauffe-bécher sur ${s.beakerHeater} (${power} W).`, s.beakerHeater === 0 ? 'info' : 'success');
  }

  pourHotWater(): void {
    const s = this.state;
    const requested = s.selectedVolume;
    if (s.beakerWater < 5) {
      this.notify('Le bécher est vide : remplissez-le et chauffez-le d’abord.', 'warning');
      return;
    }
    if (s.partB.m0 != null || s.heatingStarted) {
      this.notify('Partie B en cours : le vase ne doit contenir que la masse m₀ d’eau froide. Ne versez pas l’eau du bécher.', 'warning');
      return;
    }
    if (s.beakerTemp < 60) {
      this.notify(`Eau du bécher à ${s.beakerTemp.toFixed(1)} °C : elle doit être nettement plus chaude que θ₀ (visez 75 à 90 °C).`, 'warning');
      return;
    }
    if (s.vesselPlace === 'calorimeter' && (!s.lidClosed || !s.thermometerIn)) {
      this.notify('Le vase doit être dans le calorimètre, couvercle fermé et thermomètre en place, avant de verser.', 'warning');
      return;
    }
    if (s.pouredHot > 0) {
      this.notify('Un premier ajout d’eau chaude a déjà été effectué. Videz le vase pour recommencer.', 'warning');
      return;
    }
    const poured = Math.min(requested, s.beakerWater);
    const total = s.vesselWater + poured;
    const theta1 = s.beakerTemp;
    s.vesselTemp = (s.vesselWater * s.vesselTemp + poured * theta1) / Math.max(1, total);
    s.vesselWater = total;
    s.beakerWater -= poured;
    s.pouredHot = poured;
    s.theta1AtPour = theta1;
    this.pourTime = s.time;
    if (s.lidClosed) s.stirring = true;
    const advice =
      theta1 > 92
        ? ' Attention : une eau proche de l’ébullition réduit (θ₁ − θf) et majore l’erreur sur c_cu ; visez 75 à 90 °C.'
        : theta1 < 60
          ? ' Eau tiède : (θ₁ − θf) sera faible, donc Δc_cu très grande.'
          : '';
    this.notify(
      `m₁ ≈ ${poured.toFixed(0)} g d’eau chaude à θ₁ = ${theta1.toFixed(1)} °C versés. Agitez ~1 min puis relevez θf ; la pesée finale donnera m₁ exact.${advice}`,
      'success',
    );
  }

  /* --------------------------- montage électrique ----------------------- */

  clickTerminal(terminal: TerminalId, label: string): void {
    const s = this.state;
    if (s.wireInHand == null) {
      s.wireInHand = terminal;
      this.notify(`Fil en main, fixé sur ${label}. Visez une autre borne et cliquez : le raccordement se fait automatiquement.`, 'info');
      return;
    }
    if (s.wireInHand === terminal) {
      s.wireInHand = null;
      this.notify('Fil reposé : aucune connexion réalisée.', 'info');
      return;
    }
    const from = s.wireInHand;
    const link = findRequiredLink(from, terminal);
    if (!link) {
      s.wireInHand = terminal;
      if (s.time - s.wireWarningAt > 2) {
        s.wireWarningAt = s.time;
        const missing = REQUIRED_LINKS.filter((l) => !s.connections.some((c) => sameLink(c.a, c.b, l)));
        const hint = missing.length
          ? ` Raccordements attendus : ${missing.slice(0, 3).map((l) => `${l.a} ↔ ${l.b}`).join(', ')}.`
          : '';
        this.notify(`Ces deux bornes ne font pas partie du montage demandé : le fil est repris en main sur la nouvelle borne.${hint}`, 'warning');
      }
      return;
    }
    if (s.connections.some((c) => sameLink(c.a, c.b, link))) {
      s.wireInHand = null;
      this.notify('Ce raccordement existe déjà.', 'info');
      return;
    }
    s.connections = [...s.connections, { a: link.a, b: link.b, color: link.color }];
    s.wireInHand = null;
    this.notify(`Fil connecté automatiquement — ${link.purpose} (${s.connections.length}/${REQUIRED_LINKS.length}).`, 'success');
    if (s.connections.length === REQUIRED_LINKS.length) {
      s.circuitClosed = true;
      this.notify('Montage complet : générateur → ampèremètre → résistance → interrupteur → retour. Le voltmètre est en dérivation.', 'success');
    }
  }

  cancelWire(): void {
    const s = this.state;
    if (s.wireInHand != null) {
      s.wireInHand = null;
      this.notify('Fil en main reposé sur la paillasse.', 'info');
    }
  }

  removeWire(button: number): void {
    const s = this.state;
    if (button !== 2) {
      this.notify('Clic droit sur un fil pour le déconnecter.', 'info');
      return;
    }
    if (!s.connections.length) {
      this.notify('Aucun fil à retirer.', 'info');
      return;
    }
    s.connections = s.connections.slice(0, -1);
    s.circuitClosed = s.connections.length >= REQUIRED_LINKS.length;
    this.notify(`Fil retiré (${s.connections.length}/${REQUIRED_LINKS.length} raccordements).`, 'info');
  }

  toggleGenerator(): void {
    const s = this.state;
    s.generatorOn = !s.generatorOn;
    if (s.generatorOn) {
      this.notify(`Alimentation continue en marche : consigne ${s.generatorVoltage.toFixed(1)} V.`, 'success');
    } else {
      this.notify('Alimentation continue arrêtée.', 'warning');
    }
  }

  adjustGenerator(delta: number): void {
    const s = this.state;
    s.generatorVoltage = Math.max(0, Math.min(30, Math.round((s.generatorVoltage + delta) * 2) / 2));
    this.notify(`Consigne du générateur : ${s.generatorVoltage.toFixed(1)} V.`, 'info');
  }

  cycleCalibre(which: 'ammeter' | 'voltmeter', button: number): void {
    const s = this.state;
    if (which === 'ammeter') {
      const list = AMMETER_CALIBRES;
      const index = list.indexOf(s.ammeterCalibre);
      s.ammeterCalibre = list[(index + (button === 2 ? list.length - 1 : 1)) % list.length];
      this.notify(`Ampèremètre : calibre ${s.ammeterCalibre} A · classe ${AMMETER_CLASS} · ΔI = ${deltaI(s).toFixed(3)} A.`, 'info');
    } else {
      const list = VOLTMETER_CALIBRES;
      const index = list.indexOf(s.voltmeterCalibre);
      s.voltmeterCalibre = list[(index + (button === 2 ? list.length - 1 : 1)) % list.length];
      this.notify(`Voltmètre : calibre ${s.voltmeterCalibre} V · classe ${VOLTMETER_CLASS} · ΔU = ${deltaU(s).toFixed(3)} V.`, 'info');
    }
  }

  toggleSwitch(): void {
    const s = this.state;
    s.switchClosed = !s.switchClosed;
    if (s.switchClosed) {
      if (!s.circuitClosed) {
        this.notify('Interrupteur fermé mais le montage est incomplet : aucun courant ne circule.', 'warning');
        return;
      }
      if (!s.generatorOn) {
        this.notify('Interrupteur fermé, générateur arrêté : aucun courant. Mettez l’alimentation en marche.', 'warning');
        return;
      }
      if (!s.chronoRunning) {
        this.notify('Le chronomètre n’a pas été déclenché en même temps que l’interrupteur : remettez les deux à zéro et recommencez.', 'warning');
        s.switchClosed = false;
        return;
      }
      s.heatingStarted = true;
      this.notify('Le courant circule dans la résistance chauffante : agitez doucement et continûment pendant 3 minutes.', 'success');
    } else {
      if (s.heatingStarted && !s.heatingStopped) {
        s.heatingStopped = true;
        this.stopTime = s.time;
        s.partB.t = s.heatingTime;
        this.notify(`Courant coupé après t = ${s.heatingTime.toFixed(1)} s. Continuez d’agiter jusqu’à la température d’équilibre θf.`, 'success');
      } else {
        this.notify('Interrupteur ouvert : le courant ne circule plus.', 'info');
      }
    }
  }

  /* ------------------------------ chronomètre --------------------------- */

  chronoAction(button: number): void {
    const s = this.state;
    if (button === 2) {
      s.chrono = 0;
      s.chronoRunning = false;
      s.heatingTime = 0;
      s.heatingStarted = false;
      s.heatingStopped = false;
      if (s.switchClosed) s.switchClosed = false;
      this.notify('Chronomètre remis à zéro (mesure de durée à reprendre).', 'info');
      return;
    }
    s.chronoRunning = !s.chronoRunning;
    if (s.chronoRunning && !s.switchClosed) {
      this.notify('Chronomètre démarré : fermez l’interrupteur maintenant pour que les deux gestes soient simultanés.', 'info');
    } else {
      this.notify(s.chronoRunning ? 'Chronomètre en marche.' : 'Chronomètre en pause.', 'info');
    }
  }

  /* ------------------------------- relevés ------------------------------ */

  recordUI(): void {
    const s = this.state;
    if (!s.circuitClosed) {
      this.notify('Montage incomplet : aucune mesure électrique à consigner.', 'warning');
      return;
    }
    s.partB.u = s.voltage;
    s.partB.i = s.current;
    s.partB.voltCalibre = s.voltmeterCalibre;
    s.partB.ammCalibre = s.ammeterCalibre;
    if (s.partB.t == null) s.partB.t = s.heatingTime;
    this.notify(
      `U = ${s.voltage.toFixed(2)} V (calibre ${s.voltmeterCalibre} V) et I = ${s.current.toFixed(3)} A (calibre ${s.ammeterCalibre} A) consignés.`,
      'success',
    );
  }

  recordTiming(): void {
    const s = this.state;
    s.partB.t = s.heatingTime;
    this.notify(`Durée de passage du courant consignée : t = ${s.heatingTime.toFixed(1)} s (Δt = ${D_T_CHRONO} s).`, 'success');
  }

  validateA(): void {
    const s = this.state;
    const result = computeCopper(s);
    if (!result) {
      this.notify('Complétez toutes les grandeurs de la partie A avant l’exploitation.', 'warning');
      return;
    }
    s.partADone = true;
    this.notify(
      `c_cu = ${result.value.toFixed(4)} ± ${result.delta.toFixed(4)} cal·g⁻¹·°C⁻¹ (écart aux tables : ${(result.deviation * 100).toFixed(0)} %).`,
      'success',
    );
  }

  validateB(): void {
    const s = this.state;
    const joule = computeJoule(s);
    if (!joule) {
      this.notify('Complétez m₀, θ₀, θf, U, I et t avant l’exploitation de la partie B.', 'warning');
      return;
    }
    s.partBDone = true;
    this.notify(
      `Wₑ = ${joule.we.toFixed(0)} J · Q = ${joule.q.toFixed(1)} cal · J = ${joule.j.toFixed(2)} ± ${joule.dJ.toFixed(2)} J/cal.`,
      'success',
    );
  }

  exportCsv(): string {
    const s = this.state;
    const cu = computeCopper(s);
    const joule = computeJoule(s);
    const lines = [
      'TP2 - Calorimetrie',
      'Partie A;grandeur;valeur;incertitude;unite',
      `A;m_v;${s.partA.mv ?? ''};${D_MASS};g`,
      `A;m_0;${s.partA.m0 ?? ''};${D_MASS};g`,
      `A;m_cu;${s.partA.mCu ?? ''};${D_MASS};g`,
      `A;m_1;${s.partA.m1 ?? ''};${D_MASS};g`,
      `A;mu_0;${s.mu0};${s.dMu0};g`,
      `A;theta_0;${s.partA.theta0 ?? ''};${D_THETA};degC`,
      `A;theta_1;${s.partA.theta1 ?? ''};${D_THETA};degC`,
      `A;theta_f;${s.partA.thetaF ?? ''};${D_THETA};degC`,
      `A;c_cu;${cu ? cu.value.toFixed(5) : ''};${cu ? cu.delta.toFixed(5) : ''};cal/g.degC`,
      'Partie B;grandeur;valeur;incertitude;unite',
      `B;U;${s.partB.u ?? ''};${deltaU(s).toFixed(4)};V`,
      `B;calibre_U;${s.voltmeterCalibre};;V`,
      `B;I;${s.partB.i ?? ''};${deltaI(s).toFixed(4)};A`,
      `B;calibre_I;${s.ammeterCalibre};;A`,
      `B;t;${s.partB.t ?? ''};${D_T_CHRONO};s`,
      `B;m_0;${s.partB.m0 ?? ''};${D_MASS};g`,
      `B;theta_0;${s.partB.theta0 ?? ''};${D_THETA};degC`,
      `B;theta_f;${s.partB.thetaF ?? ''};${D_THETA};degC`,
      `B;W_e;${joule ? joule.we.toFixed(2) : ''};${joule ? joule.dWe.toFixed(2) : ''};J`,
      `B;Q;${joule ? joule.q.toFixed(2) : ''};${joule ? joule.dQ.toFixed(2) : ''};cal`,
      `B;J;${joule ? joule.j.toFixed(4) : ''};${joule ? joule.dJ.toFixed(4) : ''};J/cal`,
    ];
    return lines.join('\n');
  }

  /** Température réellement lue : gradient si l'agitation est insuffisante. */
  displayedTemperature(): number {
    const s = this.state;
    if (!s.thermometerIn) return s.vesselTemp;
    const gradient = s.stirring ? 0.02 : 0.35;
    return s.vesselTemp + (s.wallTemp - s.vesselTemp) * gradient + (s.copperPlace === 'vessel' ? (s.copperTemp - s.vesselTemp) * (s.stirring ? 0.015 : 0.2) : 0);
  }

  /** Mémorise les étapes du protocole accomplies (la liste ne revient jamais en arrière). */
  private updateAchievements(): void {
    const s = this.state;
    if (s.partA.mv != null) s.achieved.mv = true;
    if (s.partA.m0 != null) s.achieved.m0 = true;
    if (s.partA.mCu != null) s.achieved.mcu = true;
    if (s.copperPlace === 'vessel') s.achieved.incu = true;
    if (s.partA.theta0 != null) {
      s.achieved.theta0 = true;
      s.achieved.close = true;
    }
    if (s.beakerTemp >= 85 && s.beakerWater >= 40) s.achieved.heat = true;
    if (s.pouredHot > 0) s.achieved.pour = true;
    if (s.partA.thetaF != null) s.achieved.thetaf = true;
    if (s.partA.mTotal != null) s.achieved.mtot = true;
    if (s.partADone) s.achieved.exploiA = true;
    if (s.partB.m0 != null && s.copperPlace !== 'vessel') s.achieved.prepB = true;
    if (s.partB.theta0 != null) s.achieved.theta0b = true;
    if (s.connections.length >= REQUIRED_LINKS.length) s.achieved.wiring = true;
    if (s.ammeterCalibre === 2.4 && s.voltmeterCalibre === 30) s.achieved.calibres = true;
    if (s.generatorOn) s.achieved.gen = true;
    if (s.heatingStarted && s.chronoRunning) s.achieved.switch = true;
    if (s.heatingTime >= TARGET_HEATING_TIME - 1) s.achieved.stir3 = true;
    if (s.partB.u != null && s.partB.i != null) s.achieved.recordUI = true;
    if (s.heatingStopped && !s.switchClosed) s.achieved.stop = true;
    if (s.partB.thetaF != null) s.achieved.thetafb = true;
    if (s.partBDone) s.achieved.exploiB = true;
  }

  /** Vitesse de variation de la température du vase, en °C par minute. */
  driftPerMinute(): number {
    return this.drift * 60;
  }

  private drift = 0;
  private driftClock = 0;
  private lastDriftTemp = initialState().vesselTemp;

  step(realDt: number): void {
    const scaled = Math.min(0.12, realDt) * this.state.speed;
    const subdivisions = Math.max(1, Math.ceil(scaled / 0.05));
    const dt = scaled / subdivisions;
    for (let i = 0; i < subdivisions; i += 1) this.physicsStep(dt);
  }

  private physicsStep(dt: number): void {
    const s = this.state;
    s.time += dt;
    if (s.chronoRunning) s.chrono += dt;
    if (s.stirring) {
      s.stirAngle += dt * 3.4;
      if (s.lidClosed && s.vesselPlace === 'calorimeter') s.stirSeconds += dt;
    }

    /* ------------------------- circuit électrique ------------------------ */
    const complete = s.connections.length >= REQUIRED_LINKS.length;
    s.circuitClosed = complete;
    let current = 0;
    let terminalVoltage = 0;
    if (complete && s.generatorOn && s.switchClosed) {
      const totalR = RESISTOR_R + GEN_INTERNAL_R;
      current = s.generatorVoltage / totalR;
      if (current > GEN_MAX_CURRENT) current = GEN_MAX_CURRENT; // limitation de l'alimentation
      terminalVoltage = current * RESISTOR_R;
    }
    const jitter = 0.004;
    s.current += (current * (1 + (Math.random() - 0.5) * jitter) - s.current) * Math.min(1, dt * 6);
    s.voltage += (terminalVoltage * (1 + (Math.random() - 0.5) * jitter) - s.voltage) * Math.min(1, dt * 6);
    s.resistorPower = s.current * s.voltage;
    if (s.heatingStarted && !s.heatingStopped && s.current > 0.01) {
      s.heatingTime += dt;
      if (s.heatingTime >= TARGET_HEATING_TIME && s.heatingTime - dt < TARGET_HEATING_TIME) {
        this.notify('3 minutes de chauffage atteintes : coupez le courant (interrupteur) et continuez d’agiter.', 'success');
      }
    }

    /* ---------------------------- chauffe-bécher ------------------------- */
    const beakerPower = [0, 220, 420, 600][s.beakerHeater];
    const plateTarget = ROOM_TEMP + beakerPower * 0.16;
    s.hotPlateTemp += (plateTarget - s.hotPlateTemp) * (1 - Math.exp(-dt / 22));
    if (s.beakerWater > 0) {
      const capacity = s.beakerWater * 4.184 + BEAKER_C;
      const input = s.beakerHeater > 0 ? 2.4 * (s.hotPlateTemp - s.beakerTemp) : 0;
      const loss = 0.42 * (s.beakerTemp - s.ambient) + (s.beakerTemp > 60 ? 0.012 * Math.pow(s.beakerTemp - s.ambient, 1.35) : 0);
      s.beakerTemp += ((input - loss) / capacity) * dt;
      s.beakerTemp = Math.max(s.ambient - 3, Math.min(99.4, s.beakerTemp));
    } else {
      s.beakerTemp += (s.ambient - s.beakerTemp) * (1 - Math.exp(-dt / 40));
    }
    if (s.copperPlace !== 'vessel') {
      // Cuivre sur sa coupelle ou sur la balance : il reste à la température de la salle.
      s.copperTemp += (s.ambient - s.copperTemp) * (1 - Math.exp(-dt / 55));
    }

    /* ------------------------------ calorimètre -------------------------- */
    const inCalorimeter = s.vesselPlace === 'calorimeter';
    const waterC = Math.max(0.01, s.vesselWater) * 4.184; // J/K
    const electrical = inCalorimeter ? s.resistorPower : 0; // W (résistance immergée)

    let lossK: number; // conductance de fuite vers la salle
    if (!inCalorimeter) lossK = 1.1; // vase nu sur la paillasse
    else if (s.lidClosed) lossK = LOSS_CLOSED; // enceinte adiabatique fermée
    else lossK = LOSS_OPEN; // couvercle retiré

    const netPower = electrical - lossK * (s.vesselTemp - s.ambient);
    s.vesselTemp += (netPower / waterC) * dt;

    // Homogénéisation : paroi (valeur en eau μ₀) puis masse de cuivre.
    if (inCalorimeter && s.vesselWater > 0.5) {
      const conductance = s.stirring ? waterC * WALL_C / ((waterC + WALL_C) * 9) : waterC * WALL_C / ((waterC + WALL_C) * 150);
      const flow = conductance * (s.vesselTemp - s.wallTemp); // W
      s.vesselTemp -= (flow / waterC) * dt;
      s.wallTemp += (flow / WALL_C) * dt;
    } else {
      s.wallTemp += (s.ambient - s.wallTemp) * (1 - Math.exp(-dt / 240));
    }
    if (s.copperPlace === 'vessel' && s.vesselWater > 0.5) {
      const conductance = s.stirring ? waterC * COPPER_C / ((waterC + COPPER_C) * 16) : waterC * COPPER_C / ((waterC + COPPER_C) * 150);
      const flow = conductance * (s.copperTemp - s.vesselTemp); // W
      s.vesselTemp += (flow / waterC) * dt;
      s.copperTemp -= (flow / COPPER_C) * dt;
    }

    // Garde-fous numériques.
    s.vesselTemp = Math.max(s.ambient - 8, Math.min(99, s.vesselTemp));
    s.wallTemp = Math.max(s.ambient - 8, Math.min(99, s.wallTemp));

    // Suivi de la dérive thermique : sert à juger de la stabilisation avant relevé.
    this.driftClock += dt;
    if (this.driftClock >= 0.25) {
      this.drift = (s.vesselTemp - this.lastDriftTemp) / this.driftClock;
      this.lastDriftTemp = s.vesselTemp;
      this.driftClock = 0;
    }

    /* ------------------------------- balance ----------------------------- */
    if (s.vesselPlace === 'balance') s.balanceLoad = 'vessel';
    else if (s.copperPlace === 'balance') s.balanceLoad = 'copper';
    else s.balanceLoad = 'none';
    this.updateAchievements();

    /* --------------------------- alarmes pédagogiques -------------------- */
    if (s.beakerHeater > 0 && s.beakerWater <= 0 && s.time - this.warningClock > 20) {
      this.warningClock = s.time;
      this.notify('Chauffe-bécher en marche à vide : remplissez le bécher ou coupez le chauffage.', 'warning');
    }
    if (inCalorimeter && electrical > 0.5 && s.vesselWater < 20 && s.time - this.warningClock > 20) {
      this.warningClock = s.time;
      this.notify('Résistance chauffante alimentée hors d’eau : coupez le courant immédiatement.', 'warning');
    }
    if (s.current > s.ammeterCalibre * 1.02 && s.time - this.warningClock > 10) {
      this.warningClock = s.time;
      this.notify(`Aiguille hors échelle : le calibre ${s.ammeterCalibre} A est trop petit pour ${s.current.toFixed(2)} A.`, 'warning');
    }
    if (s.voltage > s.voltmeterCalibre * 1.02 && s.time - this.warningClock > 10) {
      this.warningClock = s.time;
      this.notify(`Aiguille hors échelle : le calibre ${s.voltmeterCalibre} V est trop petit pour ${s.voltage.toFixed(1)} V.`, 'warning');
    }
  }
}

/** Pression atmosphérique rappelée pour les panneaux (identique au TP1). */
export { ATM_PRESSURE, formatTime };
