/* --------------------------------------------------------------------------- *
 *  Contrôleur du laboratoire : pilote les deux TP, la qualité et les actions    *
 * --------------------------------------------------------------------------- */

import { QUALITY_PRESETS, SPEEDS, type Quality } from './shared';
import { Tp1Simulation } from './tp1';
import { Tp2Simulation, type TerminalId } from './tp2';

export interface FpsSample {
  fps: number;
  frames: number;
}

export class LabController {
  readonly tp1 = new Tp1Simulation();
  readonly tp2 = new Tp2Simulation();
  bench: 'tp1' | 'tp2' = 'tp1';
  quality: Quality = 'medium';
  /** Facteur d'accélération du temps laboratoire (commun aux deux paillasses). */
  speed = 1;

  private fpsWindow: number[] = [];
  private fpsCheckedAt = 0;
  private suggestedLow = false;

  constructor(quality: Quality = 'medium') {
    this.quality = quality;
  }

  setBench(bench: 'tp1' | 'tp2'): void {
    if (this.bench === bench) return;
    this.bench = bench;
    this.tp2.cancelWire();
    this.tp1.state.cablePending = false;
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
  }

  /** Change la vitesse d'écoulement du temps de séance (×1, ×4, ×12, ×30). */
  setSpeed(speed: number): number {
    const found = SPEEDS.find((value) => value === speed) ?? 1;
    this.speed = found;
    this.tp1.setSpeed(found);
    this.tp2.setSpeed(found);
    return found;
  }

  /** Vitesse suivante (ou précédente) dans la liste des facteurs. */
  cycleSpeed(backwards = false): number {
    const index = SPEEDS.indexOf(this.speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[(Math.max(0, index) + (backwards ? SPEEDS.length - 1 : 1)) % SPEEDS.length];
    return this.setSpeed(next);
  }

  get preset() {
    return QUALITY_PRESETS[this.quality];
  }

  /** Avance les deux physiques : la salle continue de vivre pendant qu'on marche. */
  step(delta: number): void {
    const dt = Math.min(delta, 0.1);
    this.tp1.step(dt);
    this.tp2.step(dt);
  }

  /** Surveille la cadence de rendu et suggère une qualité inférieure. */
  sample(delta: number, now: number, onSuggestion: (fps: number) => void): FpsSample | null {
    this.fpsWindow.push(delta);
    if (this.fpsWindow.length < 90) return null;
    const average = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
    this.fpsWindow = [];
    const fps = 1 / Math.max(1e-4, average);
    if (!this.suggestedLow && fps < 26 && this.quality !== 'low' && now - this.fpsCheckedAt > 12) {
      this.fpsCheckedAt = now;
      this.suggestedLow = true;
      onSuggestion(fps);
    }
    return { fps, frames: Math.round(fps) };
  }

  resetAll(): void {
    this.tp1.reset();
    this.tp2.reset();
  }

  /** Aiguillage des interactions 3D vers la bonne simulation. */
  interact(id: string, button: number): void {
    if (id.startsWith('terminal:')) {
      this.tp2.clickTerminal(id.slice('terminal:'.length) as TerminalId, this.terminalLabel(id));
      return;
    }
    switch (id) {
      /* ------------------------------- TP1 ------------------------------- */
      case 'valve':
      case 'heaterKnob':
      case 'plateConnector':
      case 'outlet':
      case 'tablet':
      case 'monitor':
      case 'lid':
      case 'cooker':
      case 'temperatureGauge':
      case 'pressureGauge':
        this.tp1.interact(id, button);
        return;

      /* ------------------------------- TP2 ------------------------------- */
      case 'calorimeterBody':
        if (button === 2) this.tp2.placeVessel(2);
        else
          this.tp2.notify(
            `Calorimètre adiabatique · valeur en eau μ₀ = ${this.tp2.state.mu0.toFixed(2)} g (Δμ₀ = ${this.tp2.state.dMu0} g) — affichée sur le panneau mural.`,
            'info',
          );
        return;
      case 'calorimeterLid':
        this.tp2.toggleLid(button);
        return;
      case 'thermometer':
        if (button === 2) this.tp2.toggleThermometer();
        else this.tp2.readThermometer(0);
        return;
      case 'stirrer':
        this.tp2.toggleStirrer();
        return;
      case 'balance':
        if (button === 2) this.tp2.balanceRemoveFromPan();
        else this.tp2.vesselOnBalance();
        return;
      case 'balanceRecord':
        if (button === 2) this.tp2.balanceTareAction();
        else this.tp2.recordFromBalance();
        return;
      case 'balanceTare':
        this.tp2.balanceTareAction();
        return;
      case 'vessel':
        this.tp2.placeVessel(button);
        return;
      case 'vesselFill':
        if (button === 2) this.tp2.emptyVessel();
        else this.tp2.addColdWater();
        return;
      case 'vesselEmpty':
        this.tp2.emptyVessel();
        return;
      case 'beaker':
        if (button === 2) this.tp2.beakerWaterAction();
        else this.tp2.pourHotWater();
        return;
      case 'beakerHeater':
        this.tp2.setBeakerHeater(this.tp2.state.beakerHeater + (button === 2 ? -1 : 1));
        return;
      case 'cylinder':
        this.tp2.cycleVolume(button === 2);
        return;
      case 'copper':
        if (button === 2) this.tp2.toggleCopper(2);
        else this.tp2.weighCopper();
        return;
      case 'genDisplay':
        this.tp2.toggleGenerator();
        return;
      case 'genKnob':
        this.tp2.adjustGenerator(button === 2 ? -0.5 : 0.5);
        return;
      case 'switch':
        this.tp2.toggleSwitch();
        return;
      case 'ammeterCalibre':
        this.tp2.cycleCalibre('ammeter', button);
        return;
      case 'voltmeterCalibre':
        this.tp2.cycleCalibre('voltmeter', button);
        return;
      case 'chrono':
        this.tp2.chronoAction(button);
        return;
      case 'wire':
        if (button === 2) this.tp2.removeWire(2);
        else this.tp2.notify('Fil déjà connecté. Clic droit pour retirer le dernier fil posé.', 'info');
        return;
      default:
        return;
    }
  }

  private terminalLabel(id: string): string {
    const names: Record<string, string> = {
      'terminal:genP': 'la borne + de l’alimentation',
      'terminal:genN': 'la borne − de l’alimentation',
      'terminal:swA': 'l’entrée de l’interrupteur',
      'terminal:swB': 'la sortie de l’interrupteur',
      'terminal:ammA': 'l’entrée de l’ampèremètre',
      'terminal:ammB': 'la sortie de l’ampèremètre',
      'terminal:voltP': 'la borne + du voltmètre',
      'terminal:voltN': 'la borne − du voltmètre',
      'terminal:coilA': 'la borne haute de la résistance',
      'terminal:coilB': 'la borne basse de la résistance',
    };
    return names[id] ?? 'la borne';
  }
}
