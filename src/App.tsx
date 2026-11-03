import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Droplets,
  Expand,
  FlaskConical,
  Gauge,
  MousePointer2,
  PanelLeft,
  Plug,
  PlugZap,
  RotateCcw,
  ScanLine,
  Thermometer,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import LabScene, { type HoverInfo } from './lab/LabScene';
import { LabController } from './lab/controller';
import { ATM_PRESSURE, QUALITY_ORDER, QUALITY_PRESETS, SPEEDS, formatTime, type Quality } from './lab/shared';
import type { Tp1State } from './lab/tp1';
import { balanceReading, deltaI, deltaU, getProtocol as getTp2Protocol, type Tp2State } from './lab/tp2';
import { getProtocol as getTp1Protocol } from './lab/tp1';
import { HelpModal, MeasuresPanel, ProtocolPanel, QualityMenu } from './components/Panels';

interface Snapshot {
  tp1: Tp1State;
  tp2: Tp2State;
}

function cloneSnapshot(controller: LabController): Snapshot {
  return { tp1: { ...controller.tp1.state }, tp2: { ...controller.tp2.state } };
}

const QUALITY_STORAGE_KEY = 'thermolab.quality';

export default function App() {
  const controllerRef = useRef<LabController | null>(null);
  if (!controllerRef.current) {
    const stored = typeof window !== 'undefined' ? (window.localStorage.getItem(QUALITY_STORAGE_KEY) as Quality | null) : null;
    controllerRef.current = new LabController(stored && QUALITY_ORDER.includes(stored) ? stored : 'medium');
  }
  const controller = controllerRef.current;

  const [quality, setQuality] = useState<Quality>(controller.quality);
  const [speed, setSpeed] = useState<number>(controller.speed);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => cloneSnapshot(controller));
  const [bench, setBench] = useState<'tp1' | 'tp2'>('tp1');
  const [travel, setTravel] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [wireInHand, setWireInHand] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState<'protocol' | 'measures' | null>('protocol');
  const [help, setHelp] = useState(false);
  const [qualityMenu, setQualityMenu] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const [toastVisible, setToastVisible] = useState(true);
  const [perfHint, setPerfHint] = useState<number | null>(null);
  const [supported, setSupported] = useState(() => window.innerWidth >= 1024 && window.innerHeight >= 620);

  const { tp1, tp2 } = snapshot;
  const preset = QUALITY_PRESETS[quality];

  /* ---- rafraîchissement de l'interface : cadencé selon la qualité ---- */
  useEffect(() => {
    const interval = window.setInterval(() => setSnapshot(cloneSnapshot(controller)), 1000 / preset.hudHz);
    return () => window.clearInterval(interval);
  }, [controller, preset.hudHz]);

  useEffect(() => {
    const resize = () => setSupported(window.innerWidth >= 1024 && window.innerHeight >= 620);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  /* ---- dernier avis émis : le plus récent des deux journaux de paillasse ---- */
  const notice = useMemo(() => {
    const a = tp1.notice;
    const b = tp2.notice;
    const useTp1 = a.time === b.time ? a.id >= b.id : a.time > b.time;
    return useTp1 ? { ...a, source: 'TP1' as const } : { ...b, source: 'TP2' as const };
  }, [tp1.notice, tp2.notice]);

  useEffect(() => {
    setToastVisible(true);
    const timeout = window.setTimeout(() => setToastVisible(false), 5200);
    return () => window.clearTimeout(timeout);
  }, [notice.id, notice.source]);

  const applyQuality = useCallback(
    (next: Quality) => {
      setQuality(next);
      controller.setQuality(next);
      window.localStorage.setItem(QUALITY_STORAGE_KEY, next);
      setPerfHint(null);
    },
    [controller],
  );

  /** Facteur d'accélération du temps de séance (les deux paillasses suivent). */
  const applySpeed = useCallback(
    (value: number) => {
      setSpeed(controller.setSpeed(value));
    },
    [controller],
  );

  const goToBench = useCallback(
    (next: 'tp1' | 'tp2') => {
      setBench((current) => {
        if (current === next) return current;
        setTravel((value) => value + 1);
        return next;
      });
      controller.setBench(next);
    },
    [controller],
  );

  /* ---- raccourcis clavier globaux ---- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.code === 'Digit1') { event.preventDefault(); applyQuality('low'); }
        if (event.code === 'Digit2') { event.preventDefault(); applyQuality('medium'); }
        if (event.code === 'Digit3') { event.preventDefault(); applyQuality('high'); }
        return;
      }
      if (event.code === 'Digit1' && !event.repeat) goToBench('tp1');
      if (event.code === 'Digit2' && !event.repeat) goToBench('tp2');
      if (event.code === 'Digit3' && !event.repeat) setQualityMenu((open) => !open);
      if (event.code === 'KeyX' && !event.repeat) applySpeed(controller.cycleSpeed());
      if ((event.code === 'Minus' || event.code === 'NumpadSubtract') && !event.repeat) applySpeed(controller.cycleSpeed(true));
      if ((event.code === 'Equal' || event.code === 'NumpadAdd') && !event.repeat) applySpeed(controller.cycleSpeed(false));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyQuality, applySpeed, controller, goToBench]);

  const onHover = useCallback((value: HoverInfo | null) => setHover(value), []);
  const onLockChange = useCallback((value: boolean) => setLocked(value), []);
  const onZoomChange = useCallback((value: boolean) => setZoom(value), []);
  const onWireChange = useCallback((value: string | null) => setWireInHand(value), []);
  const onFps = useCallback((value: number) => {
    setFps(value);
    if (value < 26 && controller.quality !== 'low') setPerfHint((current) => current ?? value);
  }, [controller]);
  const onBenchArrived = useCallback(() => undefined, []);

  const enterLab = () => {
    setStarted(true);
    setPanel(null);
    setQualityMenu(false);
    const canvas = document.querySelector('canvas');
    canvas?.requestPointerLock();
  };

  const openPanel = (name: 'protocol' | 'measures') => {
    if (document.pointerLockElement) document.exitPointerLock();
    setPanel((current) => (current === name ? null : name));
  };

  const toggleHelp = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    setHelp((value) => !value);
  };

  const fullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  if (!supported) {
    return (
      <main className="unsupported-screen">
        <div className="unsupported-card">
          <FlaskConical size={34} />
          <span className="eyebrow">THERMO.lab · TP1 & TP2</span>
          <h1>Ordinateur portable requis</h1>
          <p>Cette simulation utilise une caméra à la souris, le clavier et des manipulations 3D de précision. Elle n’est pas destinée aux écrans de téléphone.</p>
          <div><strong>Configuration minimale</strong><span>Écran 1024 × 620 · clavier · souris avec clic droit et molette</span></div>
          <small>Agrandissez la fenêtre ou ouvrez ce laboratoire sur un ordinateur portable.</small>
        </div>
      </main>
    );
  }

  const relativePressure = tp1.pressureAbs - ATM_PRESSURE;
  const protocol1 = getTp1Protocol(tp1);
  const protocol2 = getTp2Protocol(tp2);
  const activeProtocol = bench === 'tp1' ? protocol1 : protocol2;
  const nextStep = activeProtocol.find((step) => !step.done);
  const heating = tp1.plugged && tp1.heaterLevel > 0;
  const unsafe = tp1.overheated || relativePressure > 1.23;
  const tp2Alarm = tp2.beakerHeater > 0 && tp2.beakerWater < 1;

  return (
    <main className={`app-shell ${zoom ? 'is-zoomed' : ''}`}>
      <div
        className="scene-shell"
        onClick={(event) => {
          if (started && !locked && (event.target as HTMLElement).tagName === 'CANVAS') enterLab();
        }}
      >
        <LabScene
          controller={controller}
          quality={quality}
          bench={bench}
          travel={travel}
          onHover={onHover}
          onLockChange={onLockChange}
          onZoomChange={onZoomChange}
          onWireChange={onWireChange}
          onFps={onFps}
          onBenchArrived={onBenchArrived}
        />
      </div>

      <div className="screen-texture" />
      <div className={`zoom-vignette ${zoom ? 'visible' : ''}`}>
        <span className="zoom-corner tl" /><span className="zoom-corner tr" /><span className="zoom-corner bl" /><span className="zoom-corner br" />
        <div><ScanLine size={14} /> FOCUS OPTIQUE · 1,9×</div>
      </div>

      {/* ------------------------------- barre haute ------------------------------- */}
      <header className="top-bar">
        <div className="brand-block">
          <div className="brand-mark"><FlaskConical size={20} /></div>
          <div><strong>THERMO<span>.lab</span></strong><small>SIMULATEUR DE THERMODYNAMIQUE</small></div>
        </div>

        <div className="bench-switch pointer-events-auto">
          <button className={bench === 'tp1' ? 'active' : ''} onClick={() => goToBench('tp1')}>
            <span>TP1</span><small>Liquide–vapeur</small>
          </button>
          <button className={bench === 'tp2' ? 'active' : ''} onClick={() => goToBench('tp2')}>
            <span>TP2</span><small>Calorimétrie</small>
          </button>
        </div>

        <div className="session-chip"><span className={locked ? 'live-dot' : 'idle-dot'} /> {locked ? 'EN DIRECT' : 'SOURIS LIBRE'}</div>

        <div className="top-readouts">
          <div><Thermometer size={15} /><span>TP1 · VAPEUR</span><strong>{tp1.temperature.toFixed(1)} <small>°C</small></strong></div>
          <div><Gauge size={15} /><span>TP1 · P REL.</span><strong className={relativePressure < 0 ? 'negative' : ''}>{relativePressure >= 0 ? '+' : ''}{relativePressure.toFixed(3)} <small>bar</small></strong></div>
          <div><Droplets size={15} /><span>TP1 · EAU CUVE</span><strong>{(tp1.water * 1000).toFixed(0)} <small>g</small></strong></div>
          <div><Zap size={15} /><span>TP2 · U / I</span><strong>{tp2.voltage.toFixed(1)}<small> V</small> · {tp2.current.toFixed(2)}<small> A</small></strong></div>
          <div><Thermometer size={15} /><span>TP2 · θ VASE</span><strong>{tp2.vesselTemp.toFixed(1)} <small>°C</small></strong></div>
          <div><Clock3 size={15} /><span>TP2 · CHRONO</span><strong>{formatTime(tp2.chrono).slice(0, 5)} <small>{tp2.chronoRunning ? 'marche' : 'arrêt'}</small></strong></div>
        </div>

        <nav className="top-actions pointer-events-auto">
          <button className={panel === 'protocol' ? 'active' : ''} onClick={() => openPanel('protocol')} title="Protocoles"><PanelLeft size={16} /><span>Protocole</span></button>
          <button className={panel === 'measures' ? 'active' : ''} onClick={() => openPanel('measures')} title="Mesures"><Activity size={16} /><span>Mesures</span></button>
          <button className={qualityMenu ? 'active' : ''} onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setQualityMenu((v) => !v); }} title="Qualité d'affichage">
            <Gauge size={16} /><span>{preset.short}</span>
          </button>
          <button onClick={toggleHelp} title="Aide"><CircleHelp size={17} /></button>
          <button onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setResetConfirm(true); }} title="Réinitialiser les deux paillasses"><RotateCcw size={16} /></button>
          <button onClick={fullScreen} title="Plein écran"><Expand size={16} /></button>
        </nav>
      </header>

      {qualityMenu && <QualityMenu quality={quality} fps={fps} onQuality={applyQuality} onClose={() => setQualityMenu(false)} />}

      {panel === 'protocol' && (
        <ProtocolPanel controller={controller} tp1={tp1} tp2={tp2} bench={bench} onBench={goToBench} onClose={() => setPanel(null)} />
      )}
      {panel === 'measures' && <MeasuresPanel controller={controller} tp1={tp1} tp2={tp2} onClose={() => setPanel(null)} />}

      {started && panel === null && nextStep && (
        <div className="objective-ribbon">
          <span>{String(activeProtocol.findIndex((step) => step.id === nextStep.id) + 1).padStart(2, '0')}</span>
          <div>
            <small>OBJECTIF · {bench.toUpperCase()}</small>
            <strong>{nextStep.label}</strong>
            <p>{nextStep.detail}</p>
          </div>
        </div>
      )}

      {/* ------------------------------ réticule & aides ------------------------------ */}
      <div className={`reticle-wrap ${hover ? 'has-target' : ''}`}>
        <div className="reticle-ring" /><div className="reticle-dot" />
        {zoom && <div className="reticle-ticks"><i /><i /><i /><i /></div>}
      </div>

      {hover && locked && (
        <div className="interaction-label">
          {hover.id.startsWith('terminal:') ? <Plug size={15} /> : <MousePointer2 size={15} />}
          <div>
            <strong>{hover.label}</strong>
            <span>
              {hover.id.startsWith('terminal:')
                ? wireInHand
                  ? 'CLIC : LE FIL SE CONNECTE AUTOMATIQUEMENT'
                  : 'CLIC : PRENDRE UN FIL EN MAIN'
                : 'CLIC GAUCHE / CLIC DROIT POUR ACTIONNER'}
              {` · ${hover.distance.toFixed(2)} m`}
            </span>
          </div>
        </div>
      )}

      {wireInHand && locked && (
        <div className="cable-instruction">
          <PlugZap size={16} />
          <div>
            <strong>Fil en main — aucune autre borne exposée</strong>
            <span>Visez la borne à raccorder : le fil se connecte automatiquement. Clic droit dans le vide ou Échap pour le reposer.</span>
          </div>
        </div>
      )}

      {tp1.cablePending && locked && (
        <div className="cable-instruction">
          <PlugZap size={16} />
          <div>
            <strong>Câble d’alimentation saisi</strong>
            <span>Visez la prise murale 230 V et cliquez pour le raccorder.</span>
          </div>
        </div>
      )}

      {unsafe && (
        <div className="safety-banner">
          <TriangleAlert size={17} />
          <strong>{tp1.overheated ? 'CHAUFFAGE À SEC' : 'SURPRESSION'}</strong>
          <span>Coupez la plaque et débranchez si nécessaire.</span>
        </div>
      )}
      {tp2Alarm && !unsafe && (
        <div className="safety-banner">
          <TriangleAlert size={17} />
          <strong>CHAUFFE-BÉCHER À VIDE</strong>
          <span>Remplissez le bécher d’eau ou coupez le chauffage.</span>
        </div>
      )}

      {perfHint && (
        <div className="perf-hint pointer-events-auto">
          <Gauge size={16} />
          <div>
            <strong>Ralentissements détectés ({perfHint.toFixed(0)} img/s)</strong>
            <span>Passez en qualité basse : ombres coupées, écrans et raycast cadencés.</span>
          </div>
          <button className="primary-small" onClick={() => applyQuality('low')}>Qualité basse</button>
          <button className="icon-button" onClick={() => setPerfHint(null)}><X size={14} /></button>
        </div>
      )}

      <div className={`notice-toast ${notice.tone} ${toastVisible && started ? 'visible' : ''}`}>
        {notice.tone === 'warning' ? <TriangleAlert size={17} /> : notice.tone === 'success' ? <Check size={17} /> : <BookOpen size={17} />}
        <b className="notice-source">{notice.source}</b>
        <span>{notice.text}</span>
      </div>

      {/* ---------------------------------- dock ---------------------------------- */}
      <footer className="control-dock">
        <div><span className="key">ZQSD</span><p>Déplacement</p></div>
        <div><MousePointer2 size={15} /><p>Viser / cliquer</p></div>
        <div><span className="key">1 · 2</span><p>Paillasse TP1 / TP2</p></div>
        <div><Plug size={15} /><p>Borne : fil en main</p></div>
        <div className={zoom ? 'highlight' : ''}><span className="key">F</span><p>Zoom optique</p></div>
        <div><span className="key wide">MAJ</span><p>Se pencher</p></div>
        <div><span className="key">N</span><p>Relever P & T</p></div>
        <div><span className="key">3</span><p>Qualité</p></div>
        <div><span className="key">X</span><p>Vitesse ×{speed}</p></div>
        <div><span className="key wide">ÉCHAP</span><p>Souris libre</p></div>
        <div className="dock-speed pointer-events-auto" title="Vitesse d’écoulement du temps de séance (X, − ou +)">
          <Clock3 size={14} />
          {SPEEDS.map((value) => (
            <button key={value} className={speed === value ? 'active' : ''} onClick={() => applySpeed(value)}>×{value}</button>
          ))}
        </div>
      </footer>

      {started && !locked && !help && !resetConfirm && (
        <button className="resume-button pointer-events-auto" onClick={enterLab}>
          <MousePointer2 size={16} /><span>Reprendre la manipulation</span><small>Capturer la souris</small>
        </button>
      )}

      {/* ------------------------------ écran d'accueil ------------------------------ */}
      {!started && (
        <div className="start-screen pointer-events-auto">
          <div className="start-card">
            <div className="start-brand">
              <div className="brand-mark large"><FlaskConical size={28} /></div>
              <div><strong>THERMO<span>.lab</span></strong><small>LABORATOIRE NUMÉRIQUE · SALLE 01</small></div>
            </div>
            <div className="start-title">
              <span className="eyebrow">DEUX TRAVAUX PRATIQUES · UNE SEULE SALLE</span>
              <h1>Thermodynamique<br /><em>expérimentale</em></h1>
              <p>Paillasse TP1 : équilibre liquide–vapeur sur autocuiseur instrumenté et scellé. Paillasse TP2 : calorimétrie — chaleur massique du cuivre et coefficient de Joule.</p>
            </div>

            <div className="start-benches">
              <button className={bench === 'tp1' ? 'active' : ''} onClick={() => goToBench('tp1')}>
                <span className="eyebrow">PAILLASSE 01</span>
                <strong>TP1 · Équilibre liquide–vapeur</strong>
                <small>Cocotte 8 L scellée, 1,00 L d’eau · plaque 1250 W · soupape 3 positions · écran d’acquisition</small>
                <em>{protocol1.filter((s) => s.done).length}/{protocol1.length} étapes</em>
              </button>
              <button className={bench === 'tp2' ? 'active' : ''} onClick={() => goToBench('tp2')}>
                <span className="eyebrow">PAILLASSE 02</span>
                <strong>TP2 · Calorimétrie</strong>
                <small>Calorimètre adiabatique μ₀ = 32,5 g · alimentation continue · ampèremètre · voltmètre · balance · béchers</small>
                <em>{protocol2.filter((s) => s.done).length}/{protocol2.length} étapes</em>
              </button>
            </div>

            <div className="start-quality">
              <span className="eyebrow">QUALITÉ D’AFFICHAGE</span>
              <div>
                {QUALITY_ORDER.map((id) => (
                  <button key={id} className={quality === id ? 'active' : ''} onClick={() => applyQuality(id)}>
                    <strong>{QUALITY_PRESETS[id].label}</strong>
                    <small>{id === 'low' ? 'fluidité maximale' : id === 'medium' ? 'recommandé' : 'rendu complet'}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="start-safety">
              <TriangleAlert size={17} />
              <p><strong>Avant de commencer</strong>TP1 : la cocotte est scellée et immobile, ne jamais tenter de l’ouvrir sous pression. TP2 : ne jamais alimenter la résistance hors d’eau et choisir des calibres adaptés.</p>
            </div>

            <div className="start-actions">
              <button className="enter-button" onClick={enterLab}>Entrer dans le laboratoire <ChevronRight size={18} /></button>
              <button className="start-help" onClick={() => setHelp(true)}><CircleHelp size={16} /> Voir les commandes</button>
            </div>
            <div className="start-foot">
              <span>Souris + clavier · ordinateur portable</span>
              <span>{protocol1.length + protocol2.length} étapes expérimentales au total</span>
            </div>
          </div>
          <div className="start-side-note">
            <span>{bench === 'tp1' ? 'TP1' : 'TP2'}</span>
            <p>
              {bench === 'tp1'
                ? <>Cocotte-minute 8 L<br />Plaque 1250 W<br />Pₐₜₘ = {ATM_PRESSURE.toFixed(3)} bar<br />Eau : 1,00 L (livre)</>
                : <>Calorimètre μ₀ = 32,5 g<br />R = 11,4 Ω<br />A & V : classe 1,5<br />c_cu (tables) = 0,100 cal/g·°C</>
              }
            </p>
          </div>
        </div>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
      {resetConfirm && (
        <div className="modal-backdrop pointer-events-auto">
          <div className="confirm-modal">
            <div className="warning-icon"><RotateCcw size={23} /></div>
            <span className="eyebrow">NOUVELLE SÉANCE</span>
            <h2>Réinitialiser les deux paillasses ?</h2>
            <p>TP1 repart avec 1,00 L d’eau, soupape 0 et plaque hors tension. TP2 : vase vidé, montage démonté, chronomètre à zéro, toutes les mesures effacées.</p>
            <div>
              <button className="secondary-small" onClick={() => setResetConfirm(false)}><X size={14} /> Annuler</button>
              <button className="danger-button" onClick={() => { controller.resetAll(); setResetConfirm(false); }}><RotateCcw size={14} /> Réinitialiser</button>
            </div>
          </div>
        </div>
      )}

      {/* Rappel discret : toutes les grandeurs sont sur l'écran d'ordinateur de la paillasse. */}
      {started && !panel && !help && (
        <div className="monitor-hint">
          <Gauge size={13} />
          <span>
            Toutes les grandeurs sont résumées sur l’écran d’ordinateur relié à la cocotte
            {bench === 'tp2' ? ` · balance ${balanceReading(tp2).toFixed(2)} g · ΔU ${deltaU(tp2).toFixed(2)} V · ΔI ${deltaI(tp2).toFixed(3)} A` : ''}
          </span>
        </div>
      )}
      {heating && <div className="heater-badge">PLAQUE {tp1.heaterLevel}/6</div>}
      {started && speed > 1 && <div className="speed-badge">TEMPS ×{speed} · séance TP1 {formatTime(tp1.time)} · TP2 {formatTime(tp2.time)}</div>}
    </main>
  );
}
