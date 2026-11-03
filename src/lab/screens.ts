/* --------------------------------------------------------------------------- *
 *  Écrans, cadrans et textures procédurales                                    *
 *  Toutes les informations des deux TP sont résumées sur l'écran d'ordinateur    *
 *  relié à la cocotte (poste d'acquisition unique).                             *
 * --------------------------------------------------------------------------- */

import * as THREE from 'three';
import { ATM_PRESSURE, ROOM_TEMP, formatClock, type Quality } from './shared';
import { WATER_MAX, duperrayPressure, saturationPressure, type Tp1State } from './tp1';
import {
  AMMETER_CLASS,
  COPPER_MASS,
  D_MASS,
  D_THETA,
  METER_DIVISIONS,
  RESISTOR_R,
  TARGET_HEATING_TIME,
  VOLTMETER_CLASS,
  balanceReading,
  deltaI,
  deltaU,
  type Tp2State,
} from './tp2';

export interface DynamicScreen {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

function screenQualityFactor(quality: Quality): number {
  return quality === 'low' ? 0.6 : quality === 'medium' ? 0.8 : 1;
}

export function createDynamicScreen(width = 768, height = 384, quality: Quality = 'high'): DynamicScreen {
  const factor = screenQualityFactor(quality);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(128, Math.round(width * factor));
  canvas.height = Math.max(64, Math.round(height * factor));
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = quality === 'low' ? 1 : 4;
  texture.generateMipmaps = false;
  return { canvas, context, texture };
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/* ------------------------------ textures fixes ---------------------------- */

export function createBrushedMetalTexture(detail = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(512 * detail);
  canvas.height = Math.round(256 * detail);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a8aaab';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 1931;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const rows = Math.round(canvas.height * (detail < 1 ? 0.5 : 1));
  for (let y = 0; y < rows; y += 1) {
    const value = Math.floor(130 + random() * 75);
    ctx.fillStyle = `rgba(${value},${value + 2},${value + 3},${0.08 + random() * 0.18})`;
    ctx.fillRect(0, y, canvas.width, random() > 0.8 ? 2 : 1);
    const strokes = detail < 1 ? 3 : 9;
    for (let i = 0; i < strokes; i += 1) {
      const x = random() * canvas.width;
      const length = 15 + random() * 120;
      ctx.fillStyle = `rgba(255,255,255,${random() * 0.055})`;
      ctx.fillRect(x, y, length, 1);
    }
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

export function createFloorTexture(detail = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(512 * detail);
  const ctx = canvas.getContext('2d')!;
  const size = canvas.width;
  ctx.fillStyle = '#d5d8d7';
  ctx.fillRect(0, 0, size, size);
  let seed = 417;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const speckles = Math.round(14000 * detail * detail);
  for (let i = 0; i < speckles; i += 1) {
    const shade = random() > 0.5 ? 255 : 90;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + random() * 0.035})`;
    const s = random() * 1.8;
    ctx.fillRect(random() * size, random() * size, s, s);
  }
  ctx.strokeStyle = 'rgba(95,105,105,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  const texture = canvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6);
  return texture;
}

export function createSteamSprite(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,.8)');
  gradient.addColorStop(0.28, 'rgba(245,250,250,.45)');
  gradient.addColorStop(0.68, 'rgba(235,242,242,.12)');
  gradient.addColorStop(1, 'rgba(235,242,242,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}

export function createPressureGaugeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = 512; // cadran de 63 mm : 512 px suffisent largement
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(c * 0.76, c * 0.66, 10, c, c, c * 0.98);
  gradient.addColorStop(0, 'rgba(255,255,255,.8)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0)');
  gradient.addColorStop(1, 'rgba(75,70,58,.16)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 60; i += 1) {
    const pressure = -1 + i * 0.05;
    const angle = (135 - (i / 60) * 270) * (Math.PI / 180);
    const major = i % 10 === 0;
    const medium = i % 2 === 0;
    const outer = c * 0.83;
    const inner = major ? c * 0.668 : medium ? c * 0.726 : c * 0.762;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(angle) * inner, c - Math.cos(angle) * inner);
    ctx.lineTo(c + Math.sin(angle) * outer, c - Math.cos(angle) * outer);
    ctx.strokeStyle = pressure < 0 ? '#315d74' : pressure > 1.21 ? '#b8493f' : '#202a2c';
    ctx.lineWidth = major ? 5 : medium ? 2.5 : 1.5;
    ctx.stroke();
    if (major) {
      ctx.fillStyle = pressure < 0 ? '#315d74' : '#202a2c';
      ctx.font = '600 29px Arial, sans-serif';
      ctx.fillText(Math.round(pressure).toString(), c + Math.sin(angle) * c * 0.566, c - Math.cos(angle) * c * 0.566);
    }
  }
  ctx.beginPath();
  ctx.arc(c, c, c * 0.869, -Math.PI * 0.92, -Math.PI * 0.55);
  ctx.strokeStyle = 'rgba(52,126,95,.65)';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  ctx.fillStyle = '#263235';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText('PRESSION', c, c * 1.17);
  ctx.font = '500 17px Arial, sans-serif';
  ctx.fillText('bar relatif', c, c * 1.27);
  ctx.font = '600 12px Arial, sans-serif';
  ctx.fillStyle = '#718083';
  ctx.fillText('CLASSE 1,6  ·  Ø 63', c, c * 1.39);
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillStyle = '#34494d';
  ctx.fillText('THERMO.lab', c, c * 0.76);
  return canvasTexture(canvas);
}

/* --------------------- cadran d'appareil analogique ---------------------- */

export interface MeterFaceOptions {
  kind: 'A' | 'V';
  calibres: number[];
  classe: number;
  title: string;
}

export function createMeterFaceTexture(options: MeterFaceOptions): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, 640, 400);
  const cx = 320;
  const cy = 330;
  const radius = 250;
  ctx.strokeStyle = '#2a3234';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 1.166, Math.PI * 1.834);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d <= METER_DIVISIONS; d += 1) {
    const angle = Math.PI * 1.166 + (d / METER_DIVISIONS) * Math.PI * 0.668;
    const major = d % 5 === 0;
    const inner = radius - (major ? 26 : 13);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.lineWidth = major ? 3 : 1.4;
    ctx.strokeStyle = d > METER_DIVISIONS * 0.92 ? '#a8443a' : '#22282a';
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#22282a';
      ctx.font = '600 22px Arial, sans-serif';
      ctx.fillText(String(d), cx + Math.cos(angle) * (inner - 20), cy + Math.sin(angle) * (inner - 20));
    }
  }
  // Bande miroir anti-parallaxe.
  ctx.strokeStyle = 'rgba(120,140,145,.5)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 62, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.fillStyle = '#20272a';
  ctx.font = '700 40px Georgia, serif';
  ctx.fillText(options.kind === 'A' ? 'A' : 'V', cx - 118, 92);
  ctx.font = '600 20px Arial, sans-serif';
  ctx.fillStyle = '#41504f';
  ctx.fillText(options.title, cx + 42, 78);
  ctx.font = '500 17px Arial, sans-serif';
  ctx.fillStyle = '#5c6a68';
  ctx.fillText(`classe ${options.classe}  ·  ${METER_DIVISIONS} divisions`, cx + 42, 104);
  ctx.fillText(options.calibres.map((c) => `${c} ${options.kind === 'A' ? 'A' : 'V'}`).join('   ·   '), cx + 30, 136);
  ctx.font = '500 15px Arial, sans-serif';
  ctx.fillStyle = '#7b8886';
  ctx.fillText('THERMO.lab  ·  appareil analogique', cx, 176);
  return canvasTexture(canvas);
}

/* ------------------------------ afficheur LCD ----------------------------- */

function lcdBase(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#0d1a19');
  gradient.addColorStop(1, '#132524');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

export function drawBalanceScreen(screen: DynamicScreen, mass: number, tared: boolean, stable: boolean): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  lcdBase(ctx, w, h);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8fe9c4';
  ctx.shadowColor = 'rgba(80,255,190,.3)';
  ctx.shadowBlur = w * 0.02;
  ctx.font = `500 ${Math.round(h * 0.52)}px "Courier New", monospace`;
  ctx.fillText(Math.max(0, mass).toFixed(2), w * 0.74, h * 0.52);
  ctx.shadowBlur = 0;
  ctx.font = `500 ${Math.round(h * 0.24)}px Arial, sans-serif`;
  ctx.fillStyle = '#67b69c';
  ctx.fillText('g', w * 0.93, h * 0.56);
  ctx.textAlign = 'left';
  ctx.font = `600 ${Math.round(h * 0.15)}px Arial, sans-serif`;
  ctx.fillStyle = stable ? '#63c7a4' : '#d6b371';
  ctx.fillText(stable ? '● STABLE' : '○ …', w * 0.05, h * 0.2);
  ctx.fillStyle = tared ? '#8fb0d8' : '#3f5b56';
  ctx.fillText(tared ? 'TARE' : '    ', w * 0.05, h * 0.83);
  texture.needsUpdate = true;
}

export function drawGeneratorScreen(screen: DynamicScreen, voltage: number, current: number, on: boolean): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  lcdBase(ctx, w, h);
  ctx.textBaseline = 'middle';
  const rowH = h / 2;
  ctx.font = `600 ${Math.round(h * 0.13)}px Arial, sans-serif`;
  ctx.fillStyle = '#5f8f83';
  ctx.textAlign = 'left';
  ctx.fillText('U  VOLTS', w * 0.05, rowH * 0.32);
  ctx.fillText('I  AMPS', w * 0.05, rowH * 1.32);
  ctx.textAlign = 'right';
  ctx.font = `500 ${Math.round(h * 0.3)}px "Courier New", monospace`;
  ctx.fillStyle = on ? '#ffd08a' : '#4c5a58';
  ctx.fillText(voltage.toFixed(1), w * 0.82, rowH * 0.42);
  ctx.fillStyle = on && current > 0.005 ? '#8fe9c4' : '#4c5a58';
  ctx.fillText(current.toFixed(2), w * 0.82, rowH * 1.42);
  ctx.font = `500 ${Math.round(h * 0.14)}px Arial, sans-serif`;
  ctx.fillStyle = '#4f6a64';
  ctx.fillText(on ? 'SORTIE ON' : 'SORTIE OFF', w * 0.96, h * 0.93);
  texture.needsUpdate = true;
}

export function drawChronoScreen(screen: DynamicScreen, seconds: number, running: boolean): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  lcdBase(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = running ? '#8fe9c4' : '#d6b371';
  ctx.shadowColor = running ? 'rgba(80,255,190,.28)' : 'rgba(255,200,120,.2)';
  ctx.shadowBlur = w * 0.02;
  ctx.font = `500 ${Math.round(h * 0.5)}px "Courier New", monospace`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  ctx.fillText(`${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`, w * 0.5, h * 0.55);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.round(h * 0.14)}px Arial, sans-serif`;
  ctx.fillStyle = '#5f8f83';
  ctx.fillText(running ? 'MARCHE' : seconds > 0 ? 'PAUSE' : 'PRET', w * 0.5, h * 0.16);
  texture.needsUpdate = true;
}

export function drawThermometerScreen(screen: DynamicScreen, temperature: number, inserted: boolean): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  lcdBase(ctx, w, h);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd08a';
  ctx.font = `500 ${Math.round(h * 0.5)}px "Courier New", monospace`;
  ctx.fillText(temperature.toFixed(1), w * 0.72, h * 0.54);
  ctx.font = `500 ${Math.round(h * 0.22)}px Arial, sans-serif`;
  ctx.fillStyle = '#c39a63';
  ctx.fillText('°C', w * 0.94, h * 0.58);
  ctx.textAlign = 'left';
  ctx.font = `600 ${Math.round(h * 0.14)}px Arial, sans-serif`;
  ctx.fillStyle = inserted ? '#63c7a4' : '#8a6a5a';
  ctx.fillText(inserted ? 'SONDE EN PLACE' : 'SONDE RETIRÉE', w * 0.05, h * 0.18);
  ctx.fillStyle = '#4f6a64';
  ctx.fillText('0 … 110 °C · 1/10', w * 0.05, h * 0.86);
  texture.needsUpdate = true;
}

/* ------------------------- panneau mural μ₀ du TP2 ------------------------ */

export function createWallPanelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 700;
  canvas.height = 460;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5f4ee';
  ctx.fillRect(0, 0, 700, 460);
  ctx.fillStyle = '#325b59';
  ctx.fillRect(0, 0, 700, 74);
  ctx.fillStyle = '#f3f5ef';
  ctx.font = '600 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TP2 · CALORIMÉTRIE — DONNÉES DE LA SALLE', 350, 38);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#344143';
  ctx.font = '500 25px Arial, sans-serif';
  const lines = [
    ['Valeur en eau du calorimètre  μ₀', '32,50 g'],
    ['Incertitude  Δμ₀', '0,01 g'],
    ['Chaleur massique de l’eau  c₀', '1 cal·g⁻¹·°C⁻¹'],
    ['Incertitude relative  Δc₀ / c₀', '5 %'],
    ['Incertitude sur les températures  Δθᵢ', '0,1 °C'],
    ['Incertitude sur les masses  Δmⱼ', '0,01 g'],
    ['Résistance chauffante  R', `${RESISTOR_R.toFixed(1)} Ω`],
    ['Masse de cuivre (étiquette)', `${COPPER_MASS.toFixed(1)} g`],
    ['c_cu (tables)', '0,100 cal·g⁻¹·°C⁻¹'],
    ['Coefficient de Joule attendu', '4,18 J/cal'],
  ];
  lines.forEach(([label, value], index) => {
    const y = 118 + index * 32;
    ctx.fillStyle = index % 2 ? 'rgba(50,91,89,.05)' : 'rgba(0,0,0,0)';
    ctx.fillRect(18, y - 14, 664, 30);
    ctx.fillStyle = '#3d4a4b';
    ctx.font = '500 21px Arial, sans-serif';
    ctx.fillText(label, 30, y);
    ctx.fillStyle = '#1f6b58';
    ctx.font = '700 21px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(value, 670, y);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#8b9694';
  ctx.font = '500 15px Arial, sans-serif';
  ctx.fillText('THERMO.lab — salle de thermodynamique · poste TP2', 30, 440);
  return canvasTexture(canvas);
}

/* --------------------------- écran d'acquisition -------------------------- */

interface Column {
  x: number;
  width: number;
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, accent: string): number {
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(140,190,175,.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 3, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '700 13px Arial, sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(title.toUpperCase(), x + 12, y + 15);
  return y + 32;
}

function row(
  ctx: CanvasRenderingContext2D,
  col: Column,
  y: number,
  label: string,
  value: string,
  unit: string,
  tone: 'normal' | 'good' | 'warn' | 'muted' = 'normal',
  rowHeight = 21,
): number {
  ctx.font = '500 12px Arial, sans-serif';
  ctx.fillStyle = '#7d938d';
  ctx.textAlign = 'left';
  ctx.fillText(label, col.x + 12, y);
  ctx.textAlign = 'right';
  ctx.font = '500 15px "Courier New", monospace';
  ctx.fillStyle = tone === 'good' ? '#8fe9c4' : tone === 'warn' ? '#e8b473' : tone === 'muted' ? '#5d726c' : '#dcebe4';
  const unitWidth = unit ? ctx.measureText(` ${unit}`).width + 8 : 0;
  ctx.fillText(value, col.x + col.width - 12 - unitWidth, y);
  if (unit) {
    ctx.font = '500 11px Arial, sans-serif';
    ctx.fillStyle = '#7d938d';
    ctx.fillText(unit, col.x + col.width - 12, y);
  }
  return y + rowHeight;
}

function levelBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, ratio: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(x, y, width, 7);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, ratio)) * width, 7);
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, 6);
}

/**
 * Écran d'ordinateur unique : résume TOUTES les informations des deux TP.
 * Colonne de gauche = TP1 (cocotte + plaque), colonne de droite = TP2 (calorimétrie).
 */
export function drawAcquisitionScreen(screen: DynamicScreen, tp1: Tp1State, tp2: Tp2State, bench: 'tp1' | 'tp2'): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  const scale = w / 1180;

  ctx.save();
  ctx.scale(scale, scale);
  const W = 1180;
  const H = h / scale;

  const background = ctx.createLinearGradient(0, 0, 0, H);
  background.addColorStop(0, '#0a1416');
  background.addColorStop(1, '#0f1c1e');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);

  // En-tête
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillStyle = '#8fe9c4';
  ctx.fillText('THERMO.lab', 20, 26);
  ctx.font = '500 13px Arial, sans-serif';
  ctx.fillStyle = '#6d837d';
  ctx.fillText('POSTE D’ACQUISITION — SYNTHÈSE DES DEUX PAILLASSES', 148, 27);
  ctx.textAlign = 'right';
  ctx.font = '500 14px "Courier New", monospace';
  ctx.fillStyle = bench === 'tp1' ? '#8fe9c4' : '#8fb0d8';
  ctx.fillText(`PAILLASSE ACTIVE : ${bench === 'tp1' ? 'TP1' : 'TP2'}`, W - 20, 20);
  ctx.fillStyle = '#6d837d';
  ctx.font = '500 12px Arial, sans-serif';
  ctx.fillText(
    `salle ${ROOM_TEMP.toFixed(1)} °C · Pₐₜₘ ${ATM_PRESSURE.toFixed(3)} bar · temps ×${tp1.speed}`,
    W - 20,
    36,
  );
  ctx.strokeStyle = 'rgba(140,190,175,.18)';
  ctx.beginPath();
  ctx.moveTo(16, 50);
  ctx.lineTo(W - 16, 50);
  ctx.stroke();

  const top = 62;
  const colW = (W - 52) / 2;
  const left: Column = { x: 20, width: colW };
  const right: Column = { x: 32 + colW, width: colW };

  /* ------------------------------ TP1 ------------------------------ */
  const relative = tp1.pressureAbs - ATM_PRESSURE;
  let y = panel(ctx, left.x, top, colW, H - top - 16, 'TP1 · équilibre liquide-vapeur', '#8fe9c4');
  y = row(ctx, left, y + 4, 'T vapeur (Pt100)', tp1.temperature.toFixed(1), '°C', tp1.temperature > 95 ? 'good' : 'normal', 26);
  y = row(ctx, left, y, 'P relative  Pᵣ', `${relative >= 0 ? '+' : ''}${relative.toFixed(3)}`, 'bar', relative < 0 ? 'warn' : 'normal', 26);
  y = row(ctx, left, y, 'P absolue  Pₛ', tp1.pressureAbs.toFixed(3), 'bar', 'normal', 26);
  y = row(ctx, left, y, 'Pₛ saturante (Antoine)', saturationPressure(tp1.temperature).toFixed(3), 'bar', 'muted', 26);
  y = row(ctx, left, y, 'Pₛ Duperray (T/100)⁴', duperrayPressure(tp1.temperature).toFixed(3), 'bar', 'muted', 26);

  // Niveau et quantité d'eau dans la casserole.
  y += 8;
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillStyle = '#7d938d';
  ctx.textAlign = 'left';
  ctx.fillText('EAU DANS LA CUVE', left.x + 12, y);
  ctx.textAlign = 'right';
  ctx.font = '500 17px "Courier New", monospace';
  ctx.fillStyle = tp1.water < 0.6 ? '#e8b473' : '#dcebe4';
  ctx.fillText(`${(tp1.water * 1000).toFixed(0)} g   (${tp1.water.toFixed(2)} L)`, left.x + colW - 12, y);
  y += 12;
  levelBar(ctx, left.x + 12, y, colW - 24, tp1.water / WATER_MAX, tp1.water < 0.6 ? '#c98a4b' : '#4f9fb0');
  // Repère « 1 L » imposé par le livre.
  const markX = left.x + 12 + (1 / WATER_MAX) * (colW - 24);
  ctx.strokeStyle = '#cfe3dc';
  ctx.beginPath();
  ctx.moveTo(markX, y - 3);
  ctx.lineTo(markX, y + 10);
  ctx.stroke();
  ctx.font = '500 10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9fb3ac';
  ctx.fillText('1 L (livre)', markX, y + 20);
  y += 34;

  y = row(ctx, left, y, 'Vaporisé depuis le début', (tp1.waterLoss * 1000).toFixed(0), 'g', 'muted');
  y = row(ctx, left, y, 'Soupape (3 positions)', String(tp1.valve), tp1.valve === 0 ? 'atm' : tp1.valve === 1 ? '+0,55' : '+1,20', tp1.valve === 2 ? 'warn' : 'normal');
  y = row(ctx, left, y, 'Plaque chauffante', `${tp1.heaterLevel} / 6 · ${[0, 140, 260, 420, 620, 850, 1050, 1250][tp1.heaterLevel]} W`, tp1.plugged ? '' : 'débranchée', tp1.plugged && tp1.heaterLevel > 0 ? 'good' : 'warn');
  y = row(ctx, left, y, 'Température plaque', tp1.plateTemperature.toFixed(0), '°C', 'muted');
  y = row(ctx, left, y, 'Jet de vapeur (soupape)', tp1.ventRate > 1e-5 ? (tp1.ventRate * 1000).toFixed(2) : '0,00', 'g/s', tp1.ventRate > 1e-5 ? 'good' : 'muted');
  y = row(ctx, left, y, 'Chronomètre', `${formatClock(tp1.timer)}`, tp1.timerRunning ? 'marche' : 'pause', 'normal', 24);
  y = row(ctx, left, y, 'Points relevés', String(tp1.measurements.length), tp1.autoMeasure ? 'auto 60 s' : 'manuel', 'muted');
  y = row(ctx, left, y, 'Phase', tp1.coolingStarted ? 'REFROIDISSEMENT' : 'CHAUFFAGE', tp1.depressionReached ? 'dépression' : '', tp1.coolingStarted ? 'warn' : 'normal', 24);

  /* ------------------------------ TP2 ------------------------------ */
  let z = panel(ctx, right.x, top, colW, H - top - 16, 'TP2 · calorimétrie', '#8fb0d8');
  z = row(ctx, right, z + 4, 'θ eau du vase', tp2.vesselTemp.toFixed(1), '°C', tp2.vesselWater > 0 ? 'normal' : 'muted', 26);
  z = row(ctx, right, z, 'θ paroi (μ₀ = 32,5 g)', tp2.wallTemp.toFixed(1), '°C', 'muted', 26);
  z = row(ctx, right, z, 'θ cuivre', tp2.copperPlace !== 'vessel' && tp2.partA.mCu == null ? '—' : tp2.copperTemp.toFixed(1), '°C', 'muted', 26);
  z = row(ctx, right, z, 'Masse d’eau dans le vase', tp2.vesselWater > 0 ? tp2.vesselWater.toFixed(1) : '0,0', 'g', tp2.vesselWater > 0 ? 'good' : 'warn', 26);
  z = row(
    ctx,
    right,
    z,
    'Balance électronique',
    tp2.balanceLoad === 'none' ? 'vide' : balanceReading(tp2).toFixed(2),
    tp2.balanceLoad === 'none' ? 'g' : tp2.balanceLoad === 'copper' ? 'g · cuivre' : tp2.balanceTare > 0.5 ? 'g · taré' : 'g',
    tp2.balanceLoad === 'none' ? 'muted' : 'good',
  );

  z += 8;
  ctx.font = '700 12px Arial, sans-serif';
  ctx.fillStyle = '#7d938d';
  ctx.textAlign = 'left';
  ctx.fillText('MONTAGE ÉLECTRIQUE', right.x + 12, z);
  ctx.textAlign = 'right';
  ctx.font = '500 12px Arial, sans-serif';
  ctx.fillStyle = tp2.circuitClosed ? '#8fe9c4' : '#e8b473';
  ctx.fillText(`${tp2.connections.length}/6 FILS`, right.x + colW - 12, z);
  z += 16;
  z = row(ctx, right, z, 'Tension  U (voltmètre)', tp2.voltage.toFixed(2), `V · cal ${tp2.voltmeterCalibre}`, tp2.current > 0.01 ? 'good' : 'muted');
  z = row(ctx, right, z, 'Courant  I (ampèremètre)', tp2.current.toFixed(3), `A · cal ${tp2.ammeterCalibre}`, tp2.current > 0.01 ? 'good' : 'muted');
  z = row(ctx, right, z, 'ΔU / ΔI (classe 1,5)', `${deltaU(tp2).toFixed(2)} V / ${deltaI(tp2).toFixed(3)} A`, '', 'muted');
  z = row(ctx, right, z, 'Puissance  U·I', tp2.resistorPower.toFixed(1), 'W', tp2.resistorPower > 0.5 ? 'good' : 'muted');
  z = row(ctx, right, z, 'Générateur', tp2.generatorOn ? `ON · ${tp2.generatorVoltage.toFixed(1)} V` : 'OFF', tp2.switchClosed ? 'circuit fermé' : 'circuit ouvert', tp2.generatorOn ? 'good' : 'warn');
  z = row(ctx, right, z, 'Chronomètre', formatClock(tp2.chrono), tp2.chronoRunning ? 'marche' : 'arrêt', 'normal');
  z = row(ctx, right, z, 'Durée de chauffage', `${tp2.heatingTime.toFixed(0)} / ${TARGET_HEATING_TIME} s`, tp2.heatingStopped ? 'terminé' : 'en cours', tp2.heatingTime >= TARGET_HEATING_TIME ? 'good' : 'muted');
  z = row(ctx, right, z, 'Agitateur / couvercle', `${tp2.stirring ? 'agite' : 'arrêt'} · ${tp2.lidClosed ? 'fermé' : 'ouvert'}`, tp2.thermometerIn ? 'thermo ✓' : 'thermo ✗', tp2.stirring ? 'good' : 'warn');
  z = row(ctx, right, z, 'Bécher (eau chaude)', tp2.beakerWater > 0 ? `${tp2.beakerWater.toFixed(0)} g · ${tp2.beakerTemp.toFixed(1)} °C` : 'vide', tp2.beakerHeater > 0 ? `chauffe ${tp2.beakerHeater}` : '', tp2.beakerTemp > 75 ? 'good' : 'muted');

  // Pied de page : incertitudes de lecture analogique rappelées.
  ctx.textAlign = 'left';
  ctx.font = '500 11px Arial, sans-serif';
  ctx.fillStyle = '#5d726c';
  ctx.fillText(
    `ΔX = (ΔX)lecture + (ΔX)instrument · lecture = calibre/${METER_DIVISIONS} · instrument = ${
      tp2.analogFormula === 'manual' ? 'classe × calibre²/100 (énoncé)' : 'classe × calibre/100 (normalisée)'
    } (A : ${AMMETER_CLASS} ; V : ${VOLTMETER_CLASS}) · Δθ = ${D_THETA} °C · Δm = ${D_MASS} g`,
    20,
    H - 8,
  );
  ctx.restore();
  texture.needsUpdate = true;
}

/* ------------------------- écrans hérités de la v1 ------------------------ */

export function drawTemperatureScreen(screen: DynamicScreen, temperature: number, closed: boolean): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#071615';
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, w * 0.65);
  glow.addColorStop(0, 'rgba(38,126,105,.19)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#29453f';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#83e6c2';
  ctx.shadowColor = 'rgba(80,255,195,.28)';
  ctx.shadowBlur = 18;
  ctx.font = `500 ${Math.round(h * 0.48)}px "Courier New", monospace`;
  ctx.fillText(temperature.toFixed(1), w * 0.46, h * 0.49);
  ctx.shadowBlur = 0;
  ctx.font = `500 ${Math.round(h * 0.16)}px Arial, sans-serif`;
  ctx.fillText('°C', w * 0.86, h * 0.52);
  ctx.textAlign = 'left';
  ctx.font = `600 ${Math.round(h * 0.07)}px Arial, sans-serif`;
  ctx.fillStyle = '#4b9e88';
  ctx.fillText('Pt100  ·  VAPEUR', 36, h * 0.12);
  ctx.textAlign = 'right';
  ctx.fillStyle = closed ? '#6dc7ac' : '#c5a868';
  ctx.fillText(closed ? 'CUVE FERMÉE' : 'AIR LIBRE', w - 34, h - h * 0.1);
  texture.needsUpdate = true;
}

export function drawTabletScreen(screen: DynamicScreen, seconds: number, running: boolean, temperature: number): void {
  const { canvas, context: ctx, texture } = screen;
  const w = canvas.width;
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#101a22');
  gradient.addColorStop(1, '#182b30');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#6f858b';
  ctx.font = `600 ${Math.round(h * 0.046)}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('THERMO.lab  /  CHRONO TP1', w * 0.047, h * 0.09);
  ctx.textAlign = 'right';
  ctx.fillStyle = running ? '#77d6b3' : '#e4b96f';
  ctx.fillText(running ? 'EN MARCHE' : 'PAUSE', w * 0.955, h * 0.09);
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eef8f4';
  ctx.font = `400 ${Math.round(h * 0.26)}px "Courier New", monospace`;
  ctx.fillText(`${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, w / 2, h * 0.51);
  ctx.font = `400 ${Math.round(h * 0.09)}px "Courier New", monospace`;
  ctx.fillStyle = '#92aaa9';
  ctx.fillText(`.${tenths}`, w * 0.84, h * 0.56);
  ctx.strokeStyle = '#365258';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.047, h - h * 0.155);
  ctx.lineTo(w - w * 0.047, h - h * 0.155);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `500 ${Math.round(h * 0.046)}px Arial, sans-serif`;
  ctx.fillStyle = '#89a5a8';
  ctx.fillText(`T vapeur  ${temperature.toFixed(1)} °C`, w * 0.047, h - h * 0.074);
  ctx.textAlign = 'right';
  ctx.fillText('CLIC = PAUSE / REPRISE', w - w * 0.047, h - h * 0.074);
  texture.needsUpdate = true;
}
