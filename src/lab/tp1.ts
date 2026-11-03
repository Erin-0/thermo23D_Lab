/* --------------------------------------------------------------------------- *
 *  TP1 — Équilibre liquide-vapeur (autocuiseur instrumenté)                   *
 *                                                                             *
 *  Version 2 : plus de robinet ni d'évier, la cuve est remplie d'avance avec   *
 *  la quantité imposée par le livre (≈ 1 L), l'autocuiseur est scellé et       *
 *  immobile sur sa plaque, et toutes les grandeurs partent vers l'écran        *
 *  d'ordinateur relié à la cocotte.                                           *
 * --------------------------------------------------------------------------- */

import {
  ATM_PRESSURE,
  ROOM_TEMP,
  SPEEDS,
  formatTime,
  type LabEvent,
  type NoticeTone,
  type ProtocolStep,
} from './shared';

/** Hauteur du plan de travail de la paillasse TP1. */
export const TABLE_TOP = 0.92;
/** Position fixe de l'autocuiseur (posé une fois pour toutes sur la plaque). */
export const POT_ON_PLATE = { x: 0.12, z: 0.02 };
/** Quantité d'eau imposée par l'énoncé : « vérifier qu'il contient bien de l'eau (≈ 1 litre) ». */
export const BOOK_WATER = 1.0;
export const WATER_MAX = 6.4; // 8 L utiles, gradués jusqu'à 6,4 L
/** Dimensions réduites de la paillasse TP1 (demande : « réduire le premier tableau »). */
export const TP1_TABLE = { width: 2.4, depth: 0.95, x: 0, z: 0 };
/** Paillasse TP2. */
export const TP2_TABLE = { width: 2.0, depth: 1.0, x: -2.65, z: 1.3, top: 0.9 };

export interface Measurement {
  id: number;
  t: number;
  temperature: number;
  relativePressure: number;
  absolutePressure: number;
  duperray: number;
  phase: 'Chauffage' | 'Refroidissement' | 'Manuel';
}

export interface Tp1State {
  time: number;
  speed: number;
  temperature: number;
  plateTemperature: number;
  pressureAbs: number;
  water: number; // litres
  initialWater: number;
  waterLoss: number; // litres vaporisés depuis le début
  steamRate: number;
  ventRate: number;
  valve: 0 | 1 | 2;
  valveSpin: number;
  heaterLevel: number;
  plugged: boolean;
  cablePending: boolean;
  timer: number;
  timerRunning: boolean;
  airMoles: number;
  measurements: Measurement[];
  events: LabEvent[];
  notice: LabEvent;
  maxTemperature: number;
  maxRelativePressure: number;
  minRelativePressure: number;
  atmosphericPlateau: boolean;
  valve1Plateau: boolean;
  valve2Plateau: boolean;
  coolingStarted: boolean;
  depressionReached: boolean;
  lastAutoMeasurement: number;
  autoMeasure: boolean;
  overheated: boolean;
  cableConnectedOnce: boolean;
  heater6Reached: boolean;
  sealWarning: number;
  waterChecked: boolean;
}

const HEATER_POWER = [0, 140, 260, 420, 620, 850, 1050, 1250];
export const HEATER_POWER_W = HEATER_POWER;
const GAS_CONSTANT = 8.314462618;
const POT_VOLUME = 0.008; // 8 L

function latentHeatOfWater(tempC: number): number {
  return Math.max(1.9e6, (2500.8 - 2.36 * tempC) * 1000);
}

export function saturationPressure(tempC: number): number {
  const t = Math.max(1, Math.min(180, tempC));
  const high = t >= 99;
  const a = high ? 8.14019 : 8.07131;
  const b = high ? 1810.94 : 1730.63;
  const c = high ? 244.485 : 233.426;
  const mmHg = Math.pow(10, a - b / (c + t));
  return mmHg * 0.001333223684; // bar
}

export function saturationTemperature(pressureBar: number): number {
  let low = 1;
  let high = 180;
  const p = Math.max(0.006, Math.min(10, pressureBar));
  for (let i = 0; i < 22; i += 1) {
    const mid = (low + high) / 2;
    if (saturationPressure(mid) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function duperrayPressure(tempC: number): number {
  return Math.pow(Math.max(0, tempC) / 100, 4);
}

export function isPotOnPlate(): boolean {
  // La cuve est scellée sur son foyer : elle y est toujours.
  return true;
}

export function getProtocol(state: Tp1State): ProtocolStep[] {
  return [
    {
      id: 'cable',
      label: 'Alimenter la plaque chauffante',
      detail: 'Clic sur le connecteur arrière puis sur la prise murale 230 V.',
      done: state.plugged || state.cableConnectedOnce,
    },
    {
      id: 'check',
      label: 'Contrôler le niveau d’eau (≈ 1 L)',
      detail: 'Cuve déjà remplie selon la consigne du livre : lire le niveau sur l’écran relié à la cocotte.',
      done: state.waterChecked,
    },
    {
      id: 'level6',
      label: 'Régler le chauffage sur 6',
      detail: 'Bouton de la plaque : clic = +1, clic droit = −1. Le voyant rouge doit s’allumer.',
      done: state.heater6Reached || (state.heaterLevel === 6 && state.plugged),
    },
    {
      id: 'valve0',
      label: 'Palier atmosphérique — soupape 0',
      detail: 'Relever P et T toutes les minutes ; observer le palier vers 100 °C et la légère surpression.',
      done: state.atmosphericPlateau,
    },
    {
      id: 'valve1',
      label: 'Soupape 1 — régime de fonctionnement',
      detail: 'Après ≈ 3 min au palier, passer la soupape en 1 : elle tourne, la pression se stabilise.',
      done: state.valve1Plateau,
    },
    {
      id: 'valve2',
      label: 'Soupape 2 — palier de sécurité',
      detail: 'Poursuivre les relevés jusqu’au second palier (≈ +1,20 bar relatif).',
      done: state.valve2Plateau,
    },
    {
      id: 'cooling',
      label: 'Couper le chauffage, soupape sur 2',
      detail: 'Laisser refroidir et continuer les relevés toutes les minutes pendant 20 à 25 min.',
      done: state.coolingStarted,
    },
    {
      id: 'depression',
      label: 'Observer la dépression',
      detail: 'Relever le temps et la température quand Pᵣ passe sous 0 : le couvercle est plaqué.',
      done: state.depressionReached,
    },
    {
      id: 'duperray',
      label: 'Exploiter : Duperray et Clapeyron',
      detail: 'Ouvrir « Mesures » : comparer Pₛ mesurée à (T/100)⁴ et tracer la courbe de vaporisation.',
      done: state.coolingStarted && state.measurements.filter((m) => m.phase === 'Refroidissement').length >= 3,
    },
  ];
}

function initialAirMoles(temp = ROOM_TEMP, water = BOOK_WATER): number {
  const volume = Math.max(0.001, POT_VOLUME - water / 1000);
  return (ATM_PRESSURE * 1e5 * volume) / (GAS_CONSTANT * (temp + 273.15));
}

function initialState(): Tp1State {
  const notice: LabEvent = {
    id: 1,
    time: 0,
    text: 'Paillasse TP1 prête : cocotte scellée sur sa plaque, 1,00 L d’eau, soupape en 0.',
    tone: 'info',
  };
  const state: Tp1State = {
    time: 0,
    speed: 1,
    temperature: ROOM_TEMP,
    plateTemperature: ROOM_TEMP,
    pressureAbs: ATM_PRESSURE,
    water: BOOK_WATER,
    initialWater: BOOK_WATER,
    waterLoss: 0,
    steamRate: 0,
    ventRate: 0,
    valve: 0,
    valveSpin: 0,
    heaterLevel: 0,
    plugged: false,
    cablePending: false,
    timer: 0,
    timerRunning: true,
    airMoles: initialAirMoles(),
    measurements: [],
    events: [notice],
    notice,
    maxTemperature: ROOM_TEMP,
    maxRelativePressure: 0,
    minRelativePressure: 0,
    atmosphericPlateau: false,
    valve1Plateau: false,
    valve2Plateau: false,
    coolingStarted: false,
    depressionReached: false,
    lastAutoMeasurement: -60,
    autoMeasure: true,
    overheated: false,
    cableConnectedOnce: false,
    heater6Reached: false,
    sealWarning: -100,
    waterChecked: true,
  };
  return state;
}

export class Tp1Simulation {
  state: Tp1State = initialState();
  private eventId = 2;
  private measurementId = 1;
  private warningClock = -100;

  reset = (): void => {
    const speed = this.state.speed;
    this.state = initialState();
    this.state.speed = speed;
    this.eventId = 2;
    this.measurementId = 1;
    this.warningClock = -100;
    this.notify('TP1 réinitialisé : 1,00 L d’eau, soupape 0, plaque hors tension.', 'info');
  };

  notify(text: string, tone: NoticeTone = 'info'): void {
    const event: LabEvent = { id: this.eventId++, time: this.state.time, text, tone };
    this.state.notice = event;
    this.state.events = [event, ...this.state.events].slice(0, 40);
  }

  setSpeed(speed: number): void {
    if (SPEEDS.includes(speed as (typeof SPEEDS)[number])) this.state.speed = speed;
  }

  setAutoMeasure(enabled: boolean): void {
    this.state.autoMeasure = enabled;
  }

  addMeasurement(manual = true): void {
    const s = this.state;
    const measurement: Measurement = {
      id: this.measurementId++,
      t: s.time,
      temperature: s.temperature,
      relativePressure: s.pressureAbs - ATM_PRESSURE,
      absolutePressure: s.pressureAbs,
      duperray: duperrayPressure(s.temperature),
      phase: s.coolingStarted ? 'Refroidissement' : 'Chauffage',
    };
    s.measurements = [...s.measurements, measurement].slice(-240);
    if (manual) {
      this.notify(
        `Point ${measurement.id} — ${s.temperature.toFixed(1)} °C, Pᵣ ${(s.pressureAbs - ATM_PRESSURE).toFixed(3)} bar (t = ${formatTime(s.time)})`,
        'success',
      );
    }
  }

  clearMeasurements(): void {
    this.state.measurements = [];
    this.notify('Tableau de mesures TP1 vidé.', 'info');
  }

  exportCsv(): string {
    const rows = this.state.measurements.map((m) =>
      [m.t.toFixed(1), m.temperature.toFixed(2), m.relativePressure.toFixed(4), m.absolutePressure.toFixed(4), m.duperray.toFixed(4), m.phase].join(';'),
    );
    return ['temps_s;T_C;Pr_bar;Ps_bar;Ps_Duperray_bar;phase', ...rows].join('\n');
  }

  interact(id: string, button = 0): void {
    const s = this.state;
    switch (id) {
      case 'valve': {
        const next = button === 2 ? ((s.valve + 2) % 3) : ((s.valve + 1) % 3);
        s.valve = next as 0 | 1 | 2;
        const descriptions = [
          'position 0 : communication avec l’atmosphère',
          'position 1 : soupape rotative, régulation ≈ +0,55 bar',
          'position 2 : cuve fermée, sécurité ≈ +1,20 bar',
        ];
        this.notify(`Soupape en ${descriptions[next]}.`, next === 2 ? 'warning' : 'info');
        break;
      }
      case 'heaterKnob': {
        s.heaterLevel = button === 2 ? Math.max(0, s.heaterLevel - 1) : (s.heaterLevel + 1) % 7;
        if (!s.plugged && s.heaterLevel > 0) this.notify(`Plaque réglée sur ${s.heaterLevel}, mais elle n’est pas branchée.`, 'warning');
        else if (s.heaterLevel === 0) this.notify('Chauffage coupé.', 'info');
        else this.notify(`Plaque chauffante sur ${s.heaterLevel} (${HEATER_POWER[s.heaterLevel]} W).`, s.heaterLevel === 6 ? 'success' : 'info');
        if (s.heaterLevel === 0 && s.valve === 2 && s.maxTemperature > 105 && !s.coolingStarted) {
          s.coolingStarted = true;
          this.notify('Phase de refroidissement lancée : soupape 2, chauffage 0. Poursuivre les relevés.', 'info');
        }
        break;
      }
      case 'plateConnector': {
        if (s.plugged) {
          s.plugged = false;
          s.cablePending = false;
          this.notify('Plaque débranchée : la résistance n’est plus alimentée.', 'warning');
        } else {
          s.cablePending = !s.cablePending;
          this.notify(s.cablePending ? 'Câble en main : visez la prise murale et cliquez pour le raccorder.' : 'Câble reposé.', 'info');
        }
        break;
      }
      case 'outlet': {
        if (s.cablePending) {
          s.cablePending = false;
          s.plugged = true;
          s.cableConnectedOnce = true;
          this.notify('Prise 230 V connectée : la plaque peut chauffer.', 'success');
        } else if (s.plugged) {
          s.plugged = false;
          this.notify('Fiche retirée de la prise murale.', 'warning');
        } else {
          this.notify('Cliquez d’abord sur le connecteur noir à l’arrière de la plaque.', 'info');
        }
        break;
      }
      case 'tablet': {
        if (button === 2) {
          s.timer = 0;
          s.timerRunning = false;
          this.notify('Chronomètre remis à zéro et mis en pause.', 'info');
        } else {
          s.timerRunning = !s.timerRunning;
          this.notify(s.timerRunning ? 'Chronomètre relancé.' : 'Chronomètre en pause.', 'info');
        }
        break;
      }
      case 'monitor': {
        this.notify(
          `Écran d’acquisition : T = ${s.temperature.toFixed(1)} °C · Pᵣ = ${(s.pressureAbs - ATM_PRESSURE).toFixed(3)} bar · eau ${(s.water * 1000).toFixed(0)} g (${((s.water / WATER_MAX) * 100).toFixed(0)} % du repère 6,4 L).`,
          'info',
        );
        break;
      }
      case 'cooker':
      case 'lid': {
        // Autocuiseur volontairement immobile et scellé (consigne de sécurité du TP).
        if (s.time - s.sealWarning > 4) {
          s.sealWarning = s.time;
          this.notify('Autocuiseur scellé et immobile : couvercle verrouillé, aucune manœuvre possible (consigne de sécurité).', 'warning');
        }
        break;
      }
      case 'temperatureGauge':
        this.notify(`Sonde Pt100 : ${s.temperature.toFixed(2)} °C · résolution affichée 0,1 °C.`, 'info');
        break;
      case 'pressureGauge':
        this.notify(`Manomètre : ${(s.pressureAbs - ATM_PRESSURE).toFixed(3)} bar relatif · ${s.pressureAbs.toFixed(3)} bar absolu.`, 'info');
        break;
      default:
        break;
    }
  }

  step(realDt: number): void {
    const scaled = Math.min(0.12, realDt) * this.state.speed;
    const subdivisions = Math.max(1, Math.ceil(scaled / 0.04));
    const dt = scaled / subdivisions;
    for (let i = 0; i < subdivisions; i += 1) this.physicsStep(dt);
  }

  private physicsStep(dt: number): void {
    const s = this.state;
    s.time += dt;
    if (s.timerRunning) s.timer += dt;

    const electricalPower = s.plugged ? HEATER_POWER[s.heaterLevel] : 0;

    // Plaque : forte inertie de la fonte, pertes vers la salle, contact avec la cuve (toujours posée).
    // La conductance de contact est volontairement finie : le transfert reste stable numériquement.
    const plateLoss = 2.0 * (s.plateTemperature - ROOM_TEMP);
    const contactCoefficient = 40;
    const heatToPot = Math.max(-400, Math.min(1400, contactCoefficient * (s.plateTemperature - s.temperature)));
    const plateCapacity = 1400; // J/K — fonte de la plaque (≈ 3 kg)
    s.plateTemperature += ((electricalPower - plateLoss - heatToPot) / plateCapacity) * dt;
    s.plateTemperature = Math.max(18, Math.min(330, s.plateTemperature));

    const hasWater = s.water > 0.004;
    const liquidHeatCapacity = Math.max(0, s.water) * 4180;
    const heatCapacity = 1650 + liquidHeatCapacity + 230; // cuve + couvercle toujours en place
    const openness = s.valve === 0 ? 0.45 : 0;
    const heatLoss = (1.35 + openness * 1.05) * (s.temperature - ROOM_TEMP);

    const gasVolume = Math.max(0.0008, POT_VOLUME - Math.max(0, s.water) / 1000);
    const kelvin = s.temperature + 273.15;
    const pSat = hasWater ? saturationPressure(s.temperature) : 0;

    if (s.valve === 0) {
      const equilibriumAirPressure = Math.max(0.004, ATM_PRESSURE - Math.min(pSat, ATM_PRESSURE - 0.004));
      const targetMoles = (equilibriumAirPressure * 1e5 * gasVolume) / (GAS_CONSTANT * kelvin);
      s.airMoles += (targetMoles - s.airMoles) * (1 - Math.exp(-dt * 1.8));
    }

    const airPressure = (s.airMoles * GAS_CONSTANT * kelvin) / gasVolume / 1e5;
    const equilibriumPressure = airPressure + pSat;
    const openToAir = s.valve === 0;
    const pressureLimit = openToAir ? ATM_PRESSURE + 0.009 : s.valve === 1 ? ATM_PRESSURE + 0.55 : ATM_PRESSURE + 1.2;
    const pressureTarget = Math.min(equilibriumPressure, pressureLimit);
    const pressureTau = openToAir ? 0.32 : s.valve === 1 ? 0.85 : 1.2;
    s.pressureAbs += (pressureTarget - s.pressureAbs) * (1 - Math.exp(-dt / pressureTau));
    s.pressureAbs = Math.max(0.006, Math.min(3, s.pressureAbs));

    const excessPressure = Math.max(0, equilibriumPressure - pressureLimit);
    const ventConductance = openToAir ? 3.2 : s.valve === 1 ? 0.82 : 0.48;
    const gasMassEquivalent = (excessPressure * 1e5 * gasVolume) / (461.5 * kelvin);
    s.ventRate = gasMassEquivalent * ventConductance;
    if (excessPressure > 0.0002 && s.valve !== 0) {
      s.airMoles *= Math.exp(-dt * ventConductance * 0.045);
    }
    if (s.valve === 1) {
      // La soupape tournante se soulève et tourne dès que la pression approche le seuil de régulation.
      const nearLimit = Math.max(0, Math.min(1, (s.pressureAbs - ATM_PRESSURE - 0.45) / 0.1));
      const spinning = excessPressure > 0.0002 || nearLimit > 0.05;
      if (spinning) s.valveSpin += dt * Math.min(24, 1.5 + nearLimit * 9 + s.ventRate * 16000);
    }

    const boilingTemperature = saturationTemperature(s.pressureAbs);
    const netHeat = heatToPot - heatLoss;
    const latentHeat = latentHeatOfWater(s.temperature);
    let evaporationRate = 0;

    if (hasWater && s.temperature >= boilingTemperature - 0.14 && netHeat > 0) {
      const atPressureLimit = openToAir || equilibriumPressure >= pressureLimit - 0.012;
      const latentFraction = atPressureLimit ? 0.992 : 0.79;
      evaporationRate = Math.max(0, (netHeat * latentFraction) / latentHeat);
      evaporationRate = Math.min(evaporationRate, s.water / Math.max(dt, 0.001));
      s.temperature += ((netHeat - evaporationRate * latentHeat) / heatCapacity) * dt;
      if (atPressureLimit) s.ventRate = Math.max(s.ventRate, evaporationRate);
    } else {
      if (hasWater && openToAir && s.temperature > 42) {
        evaporationRate = Math.min(8e-6, 1.1e-7 * (s.temperature - 40) * (1 + openness));
      }
      s.temperature += ((netHeat - evaporationRate * latentHeat) / heatCapacity) * dt;
    }

    if (evaporationRate > 0) {
      const evaporated = evaporationRate * dt;
      s.water = Math.max(0, s.water - evaporated);
      s.waterLoss += evaporated;
    }
    s.steamRate += (evaporationRate - s.steamRate) * (1 - Math.exp(-dt * 3));
    s.temperature = Math.max(12, Math.min(260, s.temperature));

    const relativePressure = s.pressureAbs - ATM_PRESSURE;
    s.maxTemperature = Math.max(s.maxTemperature, s.temperature);
    s.maxRelativePressure = Math.max(s.maxRelativePressure, relativePressure);
    s.minRelativePressure = Math.min(s.minRelativePressure, relativePressure);

    if (s.plugged && s.heaterLevel === 6) s.heater6Reached = true;
    // Paliers : le manuel demande le palier de température ET de pression (légère surpression en soupape 0).
    if (s.valve === 0 && s.temperature > 100 && s.temperature < 103.5 && relativePressure > 0.0025 && s.water > 0.1) {
      if (!s.atmosphericPlateau) {
        s.atmosphericPlateau = true;
        this.notify(
          `Palier atmosphérique : T = ${s.temperature.toFixed(1)} °C, Pᵣ = +${relativePressure.toFixed(3)} bar — le changement d’état se fait à pression constante.`,
          'success',
        );
      }
    }
    if (s.valve === 1 && s.temperature > 112.2 && (s.valveSpin > 0.3 || relativePressure > 0.54)) {
      if (!s.valve1Plateau) {
        s.valve1Plateau = true;
        this.notify(
          `Palier de fonctionnement : la soupape tourne, Pᵣ = +${relativePressure.toFixed(2)} bar et T = ${s.temperature.toFixed(1)} °C — la température d’ébullition augmente avec la pression.`,
          'success',
        );
      }
    }
    if (s.valve === 2 && relativePressure > 1.14 && s.temperature > 122.6) {
      if (!s.valve2Plateau) {
        s.valve2Plateau = true;
        this.notify(
          `Palier de sécurité atteint : Pᵣ = +${relativePressure.toFixed(2)} bar, T = ${s.temperature.toFixed(1)} °C. Coupez le chauffage 3 min après ce palier.`,
          'success',
        );
      }
    }
    // La soupape tournante se met à siffler/turner dès que le seuil de régulation est dépassé.
    if (s.valve === 1 && s.valveSpin > 0.4 && s.time - this.warningClock > 25) {
      this.warningClock = s.time;
      this.notify(`La soupape tourne : la pression interne atteint le seuil de régulation (+0,55 bar), soit T ≈ ${s.temperature.toFixed(1)} °C.`, 'info');
    }
    if (s.heaterLevel === 0 && s.valve === 2 && s.maxTemperature > 108) s.coolingStarted = true;
    if (s.coolingStarted && relativePressure < -0.015) {
      if (!s.depressionReached) {
        s.depressionReached = true;
        this.notify(
          `Dépression atteinte : Pᵣ = ${relativePressure.toFixed(3)} bar à ${s.temperature.toFixed(1)} °C. Le couvercle est plaqué par la pression atmosphérique.`,
          'success',
        );
      }
    }

    if (s.autoMeasure && s.temperature >= 80 && s.time - s.lastAutoMeasurement >= 60) {
      s.lastAutoMeasurement = s.time;
      this.addMeasurement(false);
    }

    const dryHeating = electricalPower > 0 && s.water < 0.025;
    if (dryHeating && s.temperature > 125 && s.time - this.warningClock > 15) {
      this.warningClock = s.time;
      this.notify('CHAUFFAGE À SEC : la cuve est vide, coupez immédiatement la plaque.', 'warning');
    }
    s.overheated = dryHeating && s.temperature > 125;
    if (s.temperature > 175 && dryHeating) s.heaterLevel = 0;

    if (s.water < 0.55 && s.water > 0.02 && s.time - this.warningClock > 30) {
      this.warningClock = s.time;
      this.notify(`Niveau d’eau bas : ${(s.water * 1000).toFixed(0)} g restants (vaporisés : ${(s.waterLoss * 1000).toFixed(0)} g).`, 'warning');
    }
  }
}

/** Écart relatif mesure / Duperray, exploité dans le panneau de données. */
export function duperrayDeviation(measurements: Measurement[]): { mean: number; rms: number } {
  const usable = measurements.filter((m) => m.temperature > 60);
  if (!usable.length) return { mean: 0, rms: 0 };
  const deviations = usable.map((m) => (m.absolutePressure - m.duperray) / Math.max(0.02, m.absolutePressure));
  const mean = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const rms = Math.sqrt(deviations.reduce((a, b) => a + b * b, 0) / deviations.length);
  return { mean, rms };
}

/** Pente dP/dT et chaleur latente déduite de la relation de Clapeyron. */
export function clapeyronLatentHeat(temperatureC: number): { dPdT: number; latentKJkg: number } {
  const h = 0.35;
  const dPdT = (saturationPressure(temperatureC + h) - saturationPressure(temperatureC - h)) / (2 * h); // bar/K
  const kelvin = temperatureC + 273.15;
  const vGas = (461.5 * kelvin) / (Math.max(0.02, saturationPressure(temperatureC)) * 1e5); // m³/kg
  const latent = kelvin * vGas * dPdT * 1e5; // J/kg
  return { dPdT, latentKJkg: latent / 1000 };
}

/** Incertitude type sur Pₛ déduite de ΔT = 1 °C (propagation par la pente). */
export function saturationPressureUncertainty(temperatureC: number, deltaT = 1): number {
  const { dPdT } = clapeyronLatentHeat(temperatureC);
  return Math.abs(dPdT) * deltaT;
}

