/* --------------------------------------------------------------------------- *
 *  Panneaux HTML : protocole des deux TP, tableaux de mesures, aide, qualité    *
 * --------------------------------------------------------------------------- */

import { useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Circle,
  Download,
  FlaskConical,
  Gauge,
  Info,
  Keyboard,
  MousePointer2,
  Plug,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  AMMETER_CLASS,
  CAL_TO_JOULE,
  C0,
  C_CU_TABLE,
  D_MASS,
  D_MU0,
  D_THETA,
  D_T_CHRONO,
  METER_DIVISIONS,
  MU0,
  RESISTOR_R,
  VOLTMETER_CLASS,
  analogBreakdown,
  computeCopper,
  computeJoule,
  getProtocol as getTp2Protocol,
  type Tp2State,
} from '../lab/tp2';
import {
  duperrayDeviation,
  clapeyronLatentHeat,
  getProtocol as getTp1Protocol,
  saturationPressure,
  type Tp1State,
} from '../lab/tp1';
import type { LabController } from '../lab/controller';
import { ATM_PRESSURE, formatTime, QUALITY_ORDER, QUALITY_PRESETS, type Quality } from '../lab/shared';

/* ============================== PROTOCOLE ================================= */

export function ProtocolPanel({
  controller: _controller,
  tp1,
  tp2,
  bench,
  onBench,
  onClose,
}: {
  controller?: LabController;
  tp1: Tp1State;
  tp2: Tp2State;
  bench: 'tp1' | 'tp2';
  onBench: (bench: 'tp1' | 'tp2') => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'tp1' | 'tp2'>(bench);
  const steps = tab === 'tp1' ? getTp1Protocol(tp1) : getTp2Protocol(tp2);
  const nextIndex = steps.findIndex((step) => !step.done);
  const next = nextIndex >= 0 ? steps[nextIndex] : null;
  const completed = steps.filter((step) => step.done).length;
  const events = (tab === 'tp1' ? tp1.events : tp2.events).slice(0, 4);
  return (
    <aside className="lab-panel protocol-panel pointer-events-auto">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">CAHIER DE MANIPULATION</span>
          <h2>Protocoles</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Fermer le protocole"><X size={16} /></button>
      </div>

      <div className="bench-tabs">
        {(['tp1', 'tp2'] as const).map((id) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              onBench(id);
            }}
          >
            <span>{id === 'tp1' ? 'TP1' : 'TP2'}</span>
            <small>{id === 'tp1' ? 'Liquide–vapeur' : 'Calorimétrie'}</small>
          </button>
        ))}
      </div>

      <div className="progress-track"><span style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
      <div className="progress-caption"><span>{completed} / {steps.length} étapes validées</span><span>{Math.round((completed / steps.length) * 100)}%</span></div>

      <div className={`next-objective ${next ? '' : 'complete'}`}>
        <span className="objective-index">{next ? String(nextIndex + 1).padStart(2, '0') : <Check size={17} />}</span>
        <div>
          <span className="eyebrow">{next ? 'PROCHAINE MANIPULATION' : 'PROTOCOLE TERMINÉ'}</span>
          <strong>{next?.label ?? 'Toutes les étapes sont validées'}</strong>
          <p>{next?.detail ?? 'Poursuivez les mesures ou exportez les tableaux depuis l’onglet Mesures.'}</p>
        </div>
      </div>

      <div className="protocol-steps">
        {steps.map((step, index) => (
          <div key={step.id} className={`protocol-step ${step.done ? 'done' : ''} ${index === nextIndex ? 'active' : ''}`}>
            <span className="step-check">{step.done ? <Check size={12} /> : <Circle size={9} />}</span>
            <div><strong>{step.label}</strong>{index === nextIndex && <p className="step-detail">{step.detail}</p>}</div>
          </div>
        ))}
      </div>

      <div className="event-log">
        <div className="section-label"><Activity size={13} /> JOURNAL DE PAILLASSE · {tab.toUpperCase()}</div>
        {events.map((event: { id: number; time: number; text: string }) => (
          <div className="event-row" key={event.id}>
            <span>{formatTime(event.time).slice(0, 5)}</span>
            <p>{event.text}</p>
          </div>
        ))}
      </div>
      <p className="panel-foot">Touches <kbd>1</kbd> / <kbd>2</kbd> : marcher jusqu’à la paillasse TP1 ou TP2.</p>
    </aside>
  );
}

/* ================================ MESURES ================================= */

type MeasuresTab = 'tp1' | 'tp2a' | 'tp2b';

function Cell({ label, value, unit, delta, tone = '' }: { label: string; value: string; unit?: string; delta?: string; tone?: string }) {
  return (
    <div className={`result-cell ${tone}`}>
      <span>{label}</span>
      <strong>{value}{unit && <small> {unit}</small>}</strong>
      {delta && <em>Δ = {delta}</em>}
    </div>
  );
}

function Tp1Chart({ state }: { state: Tp1State }) {
  const width = 560;
  const height = 210;
  const margin = { left: 45, right: 16, top: 15, bottom: 32 };
  const points = state.measurements;
  const temps = points.map((p) => p.temperature);
  const minT = Math.min(95, ...temps) - 2;
  const maxT = Math.max(106, ...temps) + 2;
  const maxP = Math.min(5, Math.max(1.35, ...points.map((p) => Math.max(p.absolutePressure, p.duperray))) * 1.12);
  const x = (t: number) => margin.left + ((t - minT) / Math.max(1, maxT - minT)) * (width - margin.left - margin.right);
  const y = (p: number) => height - margin.bottom - (Math.max(0, p) / maxP) * (height - margin.top - margin.bottom);
  const measuredPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.temperature).toFixed(1)} ${y(p.absolutePressure).toFixed(1)}`).join(' ');
  const theoretical = useMemo(() => {
    const antoine: string[] = [];
    const duperray: string[] = [];
    for (let i = 0; i <= 60; i += 1) {
      const t = minT + (i / 60) * (maxT - minT);
      antoine.push(`${i === 0 ? 'M' : 'L'} ${x(t).toFixed(1)} ${y(saturationPressure(t)).toFixed(1)}`);
      duperray.push(`${i === 0 ? 'M' : 'L'} ${x(t).toFixed(1)} ${y(Math.pow(Math.max(0, t) / 100, 4)).toFixed(1)}`);
    }
    return { antoine: antoine.join(' '), duperray: duperray.join(' ') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, minT, maxT, maxP]);
  const deviation = duperrayDeviation(points);
  const clapeyron = clapeyronLatentHeat(Math.max(85, Math.min(120, state.maxTemperature)));

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Pression de vapeur saturante en fonction de la température">
        {[0, 1, 2, 3, 4].map((n) => {
          const value = (n / 4) * maxP;
          return (
            <g key={n}>
              <line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} className="chart-grid" />
              <text x={margin.left - 8} y={y(value) + 3} textAnchor="end" className="chart-tick">{value.toFixed(1)}</text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4].map((n) => {
          const value = minT + (n / 4) * (maxT - minT);
          return <text key={n} x={x(value)} y={height - 12} textAnchor="middle" className="chart-tick">{value.toFixed(0)} °C</text>;
        })}
        <text x={12} y={14} className="chart-axis">Pₛ (bar)</text>
        <path d={theoretical.antoine} className="curve-antoine" />
        <path d={theoretical.duperray} className="curve-duperray" />
        {measuredPath && <path d={measuredPath} className="curve-measured" />}
        {points.map((p) => (
          <circle key={p.id} cx={x(p.temperature)} cy={y(p.absolutePressure)} r="3.2" className={p.phase === 'Refroidissement' ? 'point-cooling' : 'point-measured'} />
        ))}
      </svg>
      <div className="chart-legend">
        <span className="legend-measured">Mesures</span>
        <span className="legend-antoine">Antoine</span>
        <span className="legend-duperray">Duperray (T/100)⁴</span>
      </div>
      <div className="chart-derived">
        <div><span>Écart moyen à Duperray</span><strong>{(deviation.mean * 100).toFixed(1)} %</strong></div>
        <div><span>Écart type</span><strong>{(deviation.rms * 100).toFixed(1)} %</strong></div>
        <div><span>dP/dT à {state.maxTemperature.toFixed(0)} °C</span><strong>{clapeyron.dPdT.toFixed(4)} bar/K</strong></div>
        <div><span>Lᵥ (Clapeyron)</span><strong>{clapeyron.latentKJkg.toFixed(0)} kJ/kg</strong></div>
      </div>
    </div>
  );
}

export function MeasuresPanel({
  controller,
  tp1,
  tp2,
  onClose,
}: {
  controller: LabController;
  tp1: Tp1State;
  tp2: Tp2State;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MeasuresTab>('tp1');
  const [filter, setFilter] = useState<'Tous' | 'Chauffage' | 'Refroidissement'>('Tous');

  const download = (content: string, name: string) => {
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rows = tp1.measurements.filter((m) => filter === 'Tous' || m.phase === filter);
  const cu = computeCopper(tp2);
  const joule = computeJoule(tp2);
  const analog = analogBreakdown(tp2);
  const manualFormula = tp2.analogFormula === 'manual';
  const instrU = manualFormula ? analog.uInstrument : analog.uNorm;
  const instrI = manualFormula ? analog.iInstrument : analog.iNorm;

  return (
    <aside className="lab-panel data-panel pointer-events-auto">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EXPLOITATION · TP1 ET TP2</span>
          <h2>Mesures & résultats</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Fermer les mesures"><X size={16} /></button>
      </div>

      <div className="measure-tabs">
        <button className={tab === 'tp1' ? 'active' : ''} onClick={() => setTab('tp1')}>TP1 · P & T</button>
        <button className={tab === 'tp2a' ? 'active' : ''} onClick={() => setTab('tp2a')}>TP2 · A — c<sub>cu</sub></button>
        <button className={tab === 'tp2b' ? 'active' : ''} onClick={() => setTab('tp2b')}>TP2 · B — Joule</button>
      </div>

      {/* ------------------------------- TP1 ------------------------------- */}
      {tab === 'tp1' && (
        <>
          <div className="data-actions">
            <button className="primary-small" onClick={() => controller.tp1.addMeasurement()}><Plus size={14} /> Relever P & T <kbd>N</kbd></button>
            <button className="secondary-small" onClick={() => download(controller.tp1.exportCsv(), 'THERMOlab_TP1')} disabled={!tp1.measurements.length}><Download size={14} /> CSV</button>
            <button className="icon-button danger" title="Vider les mesures" onClick={() => controller.tp1.clearMeasurements()}><Trash2 size={14} /></button>
          </div>
          <label className="auto-toggle">
            <input type="checkbox" checked={tp1.autoMeasure} onChange={(e) => controller.tp1.setAutoMeasure(e.target.checked)} />
            <span>Relevé automatique toutes les 60 s dès 80 °C</span>
            <small>{tp1.measurements.length} points</small>
          </label>
          <Tp1Chart state={tp1} />
          <div className="table-toolbar">
            <div className="filter-tabs">
              {(['Tous', 'Chauffage', 'Refroidissement'] as const).map((name) => (
                <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>
              ))}
            </div>
            <span className="table-count">{rows.length} lignes</span>
          </div>
          <div className="measure-table-wrap">
            <table className="measure-table">
              <thead><tr><th>t (s)</th><th>T (°C)</th><th>Pᵣ (bar)</th><th>Pₛ (bar)</th><th>Duperray</th><th>Phase</th></tr></thead>
              <tbody>
                {rows.slice().reverse().map((m) => (
                  <tr key={m.id}>
                    <td>{m.t.toFixed(0)}</td>
                    <td>{m.temperature.toFixed(1)}</td>
                    <td className={m.relativePressure < 0 ? 'negative' : ''}>{m.relativePressure >= 0 ? '+' : ''}{m.relativePressure.toFixed(3)}</td>
                    <td>{m.absolutePressure.toFixed(3)}</td>
                    <td>{m.duperray.toFixed(3)}</td>
                    <td className="phase-cell">{m.phase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty-data"><Gauge size={25} /><strong>Aucun point dans cette phase</strong><p>Faites chauffer la cuve ou utilisez « Relever P & T ».</p></div>
            )}
          </div>
          <p className="data-note">Pₛ = Pᵣ + {ATM_PRESSURE.toFixed(3)} bar. Antoine sert de référence ; l’air résiduel et le régime de soupape peuvent écarter les mesures de la courbe théorique.</p>
        </>
      )}

      {/* ----------------------------- TP2 · A ----------------------------- */}
      {tab === 'tp2a' && (
        <>
          <div className="result-grid">
            <Cell label="mᵥ (vase vide)" value={tp2.partA.mv?.toFixed(2) ?? '—'} unit="g" delta={D_MASS.toFixed(2)} />
            <Cell label="m₀ (eau froide)" value={tp2.partA.m0?.toFixed(2) ?? '—'} unit="g" delta={D_MASS.toFixed(2)} />
            <Cell label="m_cu" value={tp2.partA.mCu?.toFixed(2) ?? '—'} unit="g" delta={D_MASS.toFixed(2)} />
            <Cell label="m₁ (eau chaude)" value={tp2.partA.m1?.toFixed(2) ?? '—'} unit="g" delta={D_MASS.toFixed(2)} />
            <Cell label="μ₀ (valeur en eau)" value={MU0.toFixed(2)} unit="g" delta={D_MU0.toFixed(2)} />
            <Cell label="θ₀" value={tp2.partA.theta0?.toFixed(1) ?? '—'} unit="°C" delta={D_THETA.toFixed(1)} />
            <Cell label="θ₁" value={tp2.partA.theta1?.toFixed(1) ?? '—'} unit="°C" delta={D_THETA.toFixed(1)} />
            <Cell label="θf" value={tp2.partA.thetaF?.toFixed(1) ?? '—'} unit="°C" delta={D_THETA.toFixed(1)} />
          </div>
          <div className="formula-block">
            <div className="formula">(m₀ + μ₀)·c₀·(θf − θ₀) + m_cu·c_cu·(θf − θ₀) + m₁·c₀·(θf − θ₁) = 0</div>
            <div className="formula">c_cu = [ m₁·c₀·(θ₁ − θf) − (m₀ + μ₀)·c₀·(θf − θ₀) ] / [ m_cu·(θf − θ₀) ]</div>
            <p>avec c₀ = {C0} cal·g⁻¹·°C⁻¹ (Δc₀/c₀ = 5 %) · Δθᵢ = {D_THETA} °C · Δmⱼ = {D_MASS} g · Δμ₀ = {D_MU0} g · Δc_cu = Σ |∂c_cu/∂xᵢ|·Δxᵢ</p>
          </div>
          <div className="result-strip">
            <div className="result-main">
              <span>c_cu mesurée</span>
              <strong>{cu ? cu.value.toFixed(4) : '—'}<small> cal·g⁻¹·°C⁻¹</small></strong>
              <em>{cu ? `± ${cu.delta.toFixed(4)}  (${(cu.relative * 100).toFixed(0)} %)` : 'relevés incomplets'}</em>
            </div>
            <div className="result-compare">
              <span>Valeur des tables</span>
              <strong>{C_CU_TABLE.toFixed(3)}<small> cal·g⁻¹·°C⁻¹</small></strong>
              <em className={cu && Math.abs(cu.value - C_CU_TABLE) <= cu.delta ? 'good' : cu ? 'warn' : ''}>
                {cu ? `écart ${(cu.deviation * 100).toFixed(0)} % · ${Math.abs(cu.value - C_CU_TABLE) <= cu.delta ? 'compatible avec Δc_cu' : 'hors de l’intervalle d’incertitude'}` : '—'}
              </em>
            </div>
            <button className="primary-small" onClick={() => controller.tp2.validateA()}><Check size={14} /> Valider c_cu</button>
          </div>
          {cu && (
            <div className="uncertainty-table">
              <div className="section-label"><Info size={13} /> CONTRIBUTIONS À Δc_cu</div>
              <div className="uncertainty-grid">
                {cu.terms.map((term) => (
                  <div key={term.name}>
                    <span>{term.name}</span>
                    <strong>{term.value.toFixed(4)}</strong>
                    <small>{cu.delta > 0 ? ((term.value / cu.delta) * 100).toFixed(0) : 0} %</small>
                  </div>
                ))}
              </div>
              <p className="data-note">La sensibilité à Δθ = {D_THETA} °C domine : plus (θf − θ₀) est grand, plus Δc_cu est faible. Eau chaude à θ₁ ≥ 85 °C et m₀ modérée (120–180 g) sont recommandés.</p>
            </div>
          )}
        </>
      )}

      {/* ----------------------------- TP2 · B ----------------------------- */}
      {tab === 'tp2b' && (
        <>
          <div className="result-grid">
            <Cell label="U" value={tp2.partB.u?.toFixed(2) ?? '—'} unit="V" delta={`lect ${analog.uReading.toFixed(3)} + instr ${instrU.toFixed(3)}`} />
            <Cell label="Calibre U" value={String(tp2.voltmeterCalibre)} unit="V" delta={`classe ${VOLTMETER_CLASS}`} />
            <Cell label="I" value={tp2.partB.i?.toFixed(3) ?? '—'} unit="A" delta={`lect ${analog.iReading.toFixed(4)} + instr ${instrI.toFixed(4)}`} />
            <Cell label="Calibre I" value={String(tp2.ammeterCalibre)} unit="A" delta={`classe ${AMMETER_CLASS}`} />
            <Cell label="t" value={tp2.partB.t?.toFixed(1) ?? '—'} unit="s" delta={D_T_CHRONO.toFixed(1)} />
            <Cell label="μ₀" value={MU0.toFixed(2)} unit="g" delta={D_MU0.toFixed(2)} />
            <Cell label="m₀" value={tp2.partB.m0?.toFixed(2) ?? '—'} unit="g" delta={D_MASS.toFixed(2)} />
            <Cell label="θ₀" value={tp2.partB.theta0?.toFixed(1) ?? '—'} unit="°C" delta={D_THETA.toFixed(1)} />
            <Cell label="θf" value={tp2.partB.thetaF?.toFixed(1) ?? '—'} unit="°C" delta={D_THETA.toFixed(1)} />
          </div>

          <div className="formula-block">
            <div className="formula">Wₑ = U·I·t = R·I²·t = U²·t / R   (avec R = {RESISTOR_R.toFixed(1)} Ω)</div>
            <div className="formula">Q = (m₀ + μ₀)·c₀·(θf − θ₀)      J = Wₑ / Q</div>
            <div className="formula">ΔU = (ΔU)lecture + (ΔU)instrument ; lecture = calibre/{METER_DIVISIONS} ; instrument = {manualFormula ? 'classe × calibre² / 100 (énoncé)' : 'classe × calibre / 100 (normalisée)'}</div>
            <div className="formula">ΔWₑ/Wₑ = √[(ΔU/U)² + (ΔI/I)² + (Δt/t)²]      ΔJ/J = √[(ΔWₑ/Wₑ)² + (ΔQ/Q)²]</div>
          </div>

          <div className="result-grid tight">
            <Cell label="Wₑ" value={joule ? joule.we.toFixed(1) : '—'} unit="J" delta={joule ? joule.dWe.toFixed(1) : undefined} tone="accent" />
            <Cell label="Q" value={joule ? joule.q.toFixed(1) : '—'} unit="cal" delta={joule ? joule.dQ.toFixed(1) : undefined} tone="accent" />
            <Cell label="J = Wₑ/Q" value={joule ? joule.j.toFixed(3) : '—'} unit="J/cal" delta={joule ? joule.dJ.toFixed(3) : undefined} tone="accent" />
            <Cell label="Référence" value={CAL_TO_JOULE.toFixed(2)} unit="J/cal" delta={joule ? `écart ${(joule.deviation * 100).toFixed(1)} %` : undefined} tone={joule && joule.deviation < 0.08 ? 'good' : ''} />
          </div>

          <div className="data-actions">
            <button className="primary-small" onClick={() => controller.tp2.recordUI()}><Zap size={14} /> Consigner U & I</button>
            <button className="secondary-small" onClick={() => controller.tp2.recordTiming()}><Activity size={14} /> Consigner t</button>
            <button className="primary-small" onClick={() => controller.tp2.validateB()}><Check size={14} /> Valider J</button>
            <button className="secondary-small" onClick={() => download(controller.tp2.exportCsv(), 'THERMOlab_TP2')}><Download size={14} /> CSV TP2</button>
          </div>

          <div className="uncertainty-table">
            <div className="section-label">
              <Info size={13} /> INCERTITUDES ANALOGIQUES
              <span className="formula-switch">
                <button className={manualFormula ? 'active' : ''} onClick={() => controller.tp2.setAnalogFormula('manual')} title="classe × calibre² / 100, telle qu’écrite dans l’énoncé">Énoncé</button>
                <button className={!manualFormula ? 'active' : ''} onClick={() => controller.tp2.setAnalogFormula('normalized')} title="classe × calibre / 100, forme usuelle des appareils de classe donnée">Normalisée</button>
              </span>
            </div>
            <table className="measure-table compact">
              <thead><tr><th>Grandeur</th><th>Calibre</th><th>Lecture</th><th>Instrument</th><th>ΔX (énoncé)</th><th>ΔX normalisée</th></tr></thead>
              <tbody>
                <tr><td>U (V)</td><td>{tp2.voltmeterCalibre}</td><td>{analog.uReading.toFixed(4)}</td><td>{analog.uInstrument.toFixed(4)}</td><td>{(analog.uReading + analog.uInstrument).toFixed(4)}</td><td>{analog.uNorm.toFixed(4)}</td></tr>
                <tr><td>I (A)</td><td>{tp2.ammeterCalibre}</td><td>{analog.iReading.toFixed(4)}</td><td>{analog.iInstrument.toFixed(4)}</td><td>{(analog.iReading + analog.iInstrument).toFixed(4)}</td><td>{analog.iNorm.toFixed(4)}</td></tr>
              </tbody>
            </table>
            <p className="data-note">
              Formule active : <strong>{manualFormula ? 'énoncé — classe × calibre² / 100' : 'normalisée — classe × calibre / 100'}</strong>.
              La forme de l’énoncé est très majorante (ΔU ≈ {analog.uInstrument.toFixed(1)} V au calibre {tp2.voltmeterCalibre} V) ; la forme normalisée donne ΔU ≈ {analog.uNorm.toFixed(2)} V.
              Les deux colonnes restent affichées pour la comparaison, et ΔWₑ, ΔQ et ΔJ sont recalculés avec la formule choisie.
              {joule ? ` Avec les relevés actuels : ΔWₑ/Wₑ = ${(joule.relWe * 100).toFixed(1)} % et ΔQ/Q = ${(joule.relQ * 100).toFixed(1)} %.` : ''}
            </p>
          </div>
        </>
      )}
    </aside>
  );
}

/* ================================== AIDE ================================== */

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop pointer-events-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help-modal">
        <div className="panel-heading">
          <div><span className="eyebrow">MANUEL DE SIMULATION</span><h2>Commandes, appareils & formules</h2></div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="help-grid">
          <section>
            <h3><MousePointer2 size={16} /> Manipulation</h3>
            <dl className="control-list">
              <div><dt>Clic gauche</dt><dd>Actionner l’élément visé : soupape, bouton de plaque, appareil, balance, bécher, éprouvette, borne de connexion.</dd></div>
              <div><dt>Clic droit</dt><dd>Action inverse ou complémentaire : verrou suivant/précédent, retirer un fil, poser/retirer le vase, tare, vider le bécher, sortir le vase du calorimètre.</dd></div>
              <div><dt>Fil en main</dt><dd>Un clic sur une borne met le fil en main. Le clic suivant le connecte automatiquement à la borne visée : aucune seconde prise n’est exposée, aucun fil ne traîne. Clic droit dans le vide ou Échap pour le reposer.</dd></div>
              <div><dt>F / clic central</dt><dd>Zoom optique stabilisé.</dd></div>
              <div><dt>Maj</dt><dd>Se pencher au-dessus de la paillasse.</dd></div>
            </dl>
          </section>
          <section>
            <h3><Keyboard size={16} /> Clavier & qualité</h3>
            <dl className="control-list compact">
              <div><dt>Z Q S D / W A S D</dt><dd>Se déplacer dans la salle.</dd></div>
              <div><dt>1 / 2</dt><dd>Marcher jusqu’à la paillasse TP1 / TP2.</dd></div>
              <div><dt>N</dt><dd>Relever P & T (tableau TP1).</dd></div>
              <div><dt>T</dt><dd>Pause / reprise du chronomètre TP1.</dd></div>
              <div><dt>X / − / +</dt><dd>Vitesse du temps de séance : ×1, ×4, ×12, ×30 (les deux paillasses suivent).</dd></div>
              <div><dt>Ctrl + 1 / 2 / 3</dt><dd>Qualité basse / moyenne / haute.</dd></div>
              <div><dt>Échap</dt><dd>Libérer la souris pour utiliser les panneaux.</dd></div>
            </dl>
            <div className="theory-note">
              <Gauge size={16} />
              <div><strong>Trois niveaux de qualité, quatre vitesses</strong><p>Basse : ombres coupées, vapeur réduite, écrans 5 Hz, raycast 20 Hz. Moyenne : réglage par défaut. Haute : rendu complet. Un avertissement propose la qualité basse si la cadence passe sous 26 images/s. Les paliers du TP1 et les équilibres du TP2 demandent plusieurs dizaines de minutes : accélérez le temps (×12 ou ×30) pendant les chauffes, puis revenez à ×1 pour les relevés.</p></div>
            </div>
          </section>
          <section className="theory-section">
            <h3><FlaskConical size={16} /> TP1 · équilibre liquide–vapeur</h3>
            <div className="formula">L₁₂ = T(V₂ − V₁) · dP/dT</div>
            <p>Autocuiseur 8 L scellé, immobile sur sa plaque, rempli de 1,00 L d’eau comme l’impose la consigne. Soupape 0 : atmosphère ; 1 : régulation ≈ +0,55 bar ; 2 : cuve fermée jusqu’à ≈ +1,20 bar.</p>
            <div className="formula">Pₛ(Duperray) = 1 bar · (T / 100 °C)⁴</div>
            <p>Pₛ = Pᵣ + Pₐₜₘ avec Pₐₜₘ = {ATM_PRESSURE.toFixed(3)} bar. Au refroidissement, la condensation crée une dépression qui plaque le couvercle.</p>
          </section>
          <section className="theory-section">
            <h3><Plug size={16} /> TP2 · calorimétrie</h3>
            <div className="formula">δQ = (m₀+μ₀)c₀(θf−θ₀) + m_cu·c_cu(θf−θ₀) + m₁c₀(θf−θ₁) = 0</div>
            <div className="formula">Wₑ = U·I·t      Q = (m₀+μ₀)c₀(θf−θ₀)      J = Wₑ/Q ≈ 4,18 J/cal</div>
            <p>Calorimètre adiabatique de valeur en eau μ₀ = {MU0.toFixed(1)} g (panneau mural). Trois appareils principaux : alimentation continue (avec interrupteur de circuit), ampèremètre et voltmètre analogiques — classe {AMMETER_CLASS}, {METER_DIVISIONS} divisions. Résistance chauffante R = {RESISTOR_R.toFixed(1)} Ω.</p>
            <div className="formula">ΔX = (ΔX)lecture + (ΔX)instrument</div>
            <p>lecture = calibre / nombre de graduations ; instrument = classe × calibre² / 100 (mêmes expressions pour ΔI). Dans « Mesures → TP2 · B », un commutateur permet de basculer sur la forme normalisée classe × calibre / 100 : ΔWₑ, ΔQ et ΔJ sont alors recalculés.</p>
          </section>
          <section className="safety-section">
            <h3><ShieldAlert size={16} /> Consignes impératives</h3>
            <ul>
              <li>TP1 : ne jamais ouvrir la cocotte — elle est scellée et le reste pendant toute la séance.</li>
              <li>Vérifier la présence d’environ 1 L d’eau avant de chauffer (niveau lu sur le tube et sur l’écran).</li>
              <li>Ne jamais bloquer ni dévisser la soupape de sécurité.</li>
              <li>En cas de problème, débrancher la prise de la plaque chauffante.</li>
              <li>TP2 : ne jamais alimenter la résistance hors d’eau ; choisir un calibre d’ampèremètre adapté.</li>
            </ul>
            <button className="secondary-small" onClick={onClose}><RotateCcw size={14} /> Retour à la paillasse</button>
          </section>
        </div>
        <div className="help-footer"><Info size={13} /> Les durées physiques sont réelles en vitesse ×1 ; les vitesses ×4, ×12 et ×30 appliquent le même modèle par sous-pas numériques. Toutes les grandeurs sont résumées sur l’écran d’ordinateur relié à la cocotte.</div>
      </div>
    </div>
  );
}

/* ================================= QUALITÉ ================================ */

export function QualityMenu({ quality, fps, onQuality, onClose }: { quality: Quality; fps: number | null; onQuality: (q: Quality) => void; onClose: () => void }) {
  return (
    <div className="quality-menu pointer-events-auto">
      <div className="quality-head">
        <span className="eyebrow">PERFORMANCES</span>
        <button className="icon-button" onClick={onClose}><X size={14} /></button>
      </div>
      {QUALITY_ORDER.map((id) => {
        const preset = QUALITY_PRESETS[id];
        return (
          <button key={id} className={`quality-option ${quality === id ? 'active' : ''}`} onClick={() => onQuality(id)}>
            <span className="quality-bars" data-level={id}><i /><i /><i /></span>
            <div>
              <strong>{preset.label}</strong>
              <small>{preset.detail}</small>
            </div>
            {quality === id && <Check size={15} />}
          </button>
        );
      })}
      <div className="quality-foot">
        <span>Cadence mesurée</span>
        <strong>{fps ? `${fps.toFixed(0)} img/s` : '—'}</strong>
      </div>
    </div>
  );
}

/* ============================ BANDEAU D'ÉTAT ============================== */

export function SafetyBanner({ text, detail }: { text: string; detail: string }) {
  return (
    <div className="safety-banner">
      <ShieldAlert size={17} />
      <strong>{text}</strong>
      <span>{detail}</span>
    </div>
  );
}
