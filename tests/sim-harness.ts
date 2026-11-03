/* --------------------------------------------------------------------------- *
 *  Harnais de validation des deux TP — rejoue les protocoles sans rendu 3D.     *
 *                                                                              *
 *  Lancement : npm run test:sim   (esbuild + node, aucun navigateur requis)     *
 *  Ce fichier ne fait pas partie de l'application : il n'est jamais importé     *
 *  par index.html, il sert à vérifier la physique et l'enchaînement des gestes. *
 * --------------------------------------------------------------------------- */

import { LabController } from '../src/lab/controller';
import {
  CAL_TO_JOULE,
  C_CU_TABLE,
  MU0,
  balanceReading,
  computeCopper,
  computeJoule,
  deltaI,
  deltaU,
  getProtocol as protocol2,
} from '../src/lab/tp2';
import { clapeyronLatentHeat, duperrayDeviation, getProtocol as protocol1 } from '../src/lab/tp1';

const controller = new LabController('low');
const { tp1, tp2 } = controller;
let speed = 1;
let failures = 0;

/* ------------------------------ utilitaires ------------------------------ */

/** Avance les deux simulations de `seconds` secondes de temps laboratoire. */
function run(seconds: number): void {
  const dt = 0.05 / speed;
  const steps = Math.ceil(seconds / 0.05);
  for (let i = 0; i < steps; i += 1) {
    tp1.step(dt);
    tp2.step(dt);
  }
}

function setSpeed(value: number): void {
  speed = value;
  controller.setSpeed(value);
}

/** Avance par tranches jusqu'à ce que `test()` soit vrai. Retourne le temps écoulé. */
function waitUntil(test: () => boolean, max: number, slice = 15): number {
  let elapsed = 0;
  while (!test() && elapsed < max) {
    run(slice);
    elapsed += slice;
  }
  return elapsed;
}

/** Vérification horodatée : affiche ✓ ou ✗ et compte les échecs. */
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const pr = () => tp1.state.pressureAbs - 1.025;

console.log('\n=== TP1 · équilibre liquide-vapeur (autocuiseur scellé, 1,00 L) ===');

/* --------------------------------- TP1 ---------------------------------- */

controller.interact('plateConnector', 0);
controller.interact('outlet', 0);
for (let i = 0; i < 6; i += 1) controller.interact('heaterKnob', 0);
setSpeed(12);
const tEbullition = waitUntil(() => tp1.state.atmosphericPlateau, 1800);
check('palier atmosphérique atteint en moins de 20 min', tEbullition > 0 && tEbullition < 1200, `${tEbullition} s`);
check(
  'palier à ≈ 100 °C avec légère surpression',
  tp1.state.temperature > 99.5 && tp1.state.temperature < 103.5 && pr() > 0 && pr() < 0.02,
  `T = ${tp1.state.temperature.toFixed(1)} °C, Pᵣ = +${pr().toFixed(3)} bar`,
);
run(180); // 3 min de relevés au palier, comme le demande le manuel
controller.interact('valve', 0); // soupape 1
const tSoupape1 = waitUntil(() => tp1.state.valve1Plateau, 1200);
check(
  'soupape 1 : palier de fonctionnement et rotation de la soupape',
  tSoupape1 > 0 && tp1.state.temperature > 111 && pr() > 0.5 && tp1.state.valveSpin > 0,
  `T = ${tp1.state.temperature.toFixed(1)} °C, Pᵣ = +${pr().toFixed(3)} bar, ${tp1.state.valveSpin.toFixed(0)} rad, ${tSoupape1} s`,
);
controller.interact('valve', 0); // soupape 2
const tSoupape2 = waitUntil(() => tp1.state.valve2Plateau, 1800);
check(
  'soupape 2 : palier de sécurité ≈ +1,20 bar',
  tSoupape2 > 0 && pr() > 1.1 && tp1.state.temperature > 122,
  `T = ${tp1.state.temperature.toFixed(1)} °C, Pᵣ = +${pr().toFixed(3)} bar, ${tSoupape2} s`,
);
run(180); // 3 min après le dernier palier avant de couper le chauffage
for (let i = 0; i < 6; i += 1) controller.interact('heaterKnob', 2);
check('refroidissement engagé (chauffage 0, soupape 2)', tp1.state.coolingStarted);
const tDepression = waitUntil(() => tp1.state.depressionReached, 1800);
check(
  'dépression obtenue en moins de 25 min de refroidissement',
  tDepression > 0 && tDepression < 1500,
  `Pᵣ = ${pr().toFixed(3)} bar à T = ${tp1.state.temperature.toFixed(1)} °C après ${tDepression} s`,
);
run(900);
const protocole1 = protocol1(tp1.state);
check('protocole TP1 complet', protocole1.every((step) => step.done), `${protocole1.filter((s) => s.done).length}/${protocole1.length} étapes`);
check(
  'bilan d’eau cohérent (vaporisation sans vidange)',
  tp1.state.water > 0.3 && tp1.state.waterLoss > 0.05,
  `${(tp1.state.water * 1000).toFixed(0)} g restants, ${(tp1.state.waterLoss * 1000).toFixed(0)} g vaporisés`,
);
const ecartDuperray = duperrayDeviation(tp1.state.measurements);
const clapeyron = clapeyronLatentHeat(110);
check(
  'Duperray : écart moyen < 10 % sur les points > 60 °C',
  Math.abs(ecartDuperray.mean) < 0.1,
  `moyenne ${(ecartDuperray.mean * 100).toFixed(1)} %, RMS ${(ecartDuperray.rms * 100).toFixed(1)} %`,
);
check(
  'Clapeyron : L_v(110 °C) ≈ 2230 kJ/kg',
  clapeyron.latentKJkg > 2100 && clapeyron.latentKJkg < 2400,
  `${clapeyron.latentKJkg.toFixed(0)} kJ/kg, dP/dT = ${(clapeyron.dPdT * 1000).toFixed(1)} mbar/K`,
);

console.log('\n=== TP2 · A — chaleur massique du cuivre (méthode des mélanges) ===');

/* ------------------------------- TP2 · A -------------------------------- */

setSpeed(4);
controller.interact('balance', 0); // poser le vase sur la balance
controller.interact('balanceRecord', 0); // consigner mᵥ
check('mᵥ pesé', tp1 && tp2.state.partA.mv === 96.4, `${tp2.state.partA.mv?.toFixed(2)} g`);
tp2.setSelectedVolume(150);
controller.interact('vesselFill', 0); // 150 g d'eau froide
controller.interact('balanceRecord', 0); // m₀ = m(eau+vase) − mᵥ
check('m₀ déduit par double pesée', tp2.state.partA.m0 === 150, `${tp2.state.partA.m0?.toFixed(2)} g`);
controller.interact('balance', 0); // retirer le vase
controller.interact('copper', 0); // poser le cuivre sur la balance
controller.interact('balanceRecord', 0); // consigner m_cu
check(
  'm_cu pesé sur la balance',
  tp2.state.partA.mCu === 121.3 && tp2.state.balanceLoad === 'copper',
  `${tp2.state.partA.mCu?.toFixed(2)} g, afficheur ${balanceReading(tp2.state).toFixed(2)} g`,
);
controller.interact('vessel', 2); // vase → calorimètre
controller.interact('copper', 2); // cuivre → vase (manuel : « l'introduire ensuite dans le calorimètre »)
check('cuivre introduit dans le vase', tp2.state.copperPlace === 'vessel' && tp2.state.balanceLoad === 'none');
controller.interact('calorimeterLid', 2);
controller.interact('thermometer', 2);
controller.interact('stirrer', 0);
run(300); // ≈ 5 min d'agitation (manuel)
controller.interact('thermometer', 0); // θ₀
check('θ₀ relevé après agitation', tp2.state.partA.theta0 != null && tp2.state.stirSeconds >= 120, `θ₀ = ${tp2.state.partA.theta0?.toFixed(2)} °C`);
tp2.setSelectedVolume(200);
controller.interact('beaker', 2); // remplir le bécher
for (let i = 0; i < 3; i += 1) controller.interact('beakerHeater', 0);
setSpeed(12);
waitUntil(() => tp2.state.beakerTemp >= 86, 1800);
for (let i = 0; i < 3; i += 1) controller.interact('beakerHeater', 2);
setSpeed(4);
tp2.setSelectedVolume(100);
controller.interact('beaker', 0); // verser m₁
check('m₁ versé à θ₁ ≥ 75 °C', tp2.state.pouredHot === 100 && (tp2.state.theta1AtPour ?? 0) >= 75, `${tp2.state.pouredHot} g à ${(tp2.state.theta1AtPour ?? 0).toFixed(1)} °C`);
run(70); // 1 min d'agitation (manuel)
controller.interact('thermometer', 0); // θf
controller.interact('thermometer', 2);
controller.interact('calorimeterLid', 0);
controller.interact('vessel', 2); // sortir le vase
controller.interact('balance', 0);
controller.interact('balanceRecord', 0); // m_total → m₁
check('m₁ déduit de la pesée finale', Math.abs((tp2.state.partA.m1 ?? 0) - 100) < 0.5, `m_total = ${tp2.state.partA.mTotal?.toFixed(2)} g → m₁ = ${tp2.state.partA.m1?.toFixed(2)} g`);
const cuivre = computeCopper(tp2.state);
check(
  'c_cu compatible avec les tables (0,100 cal·g⁻¹·°C⁻¹)',
  cuivre != null && Math.abs(cuivre.value - C_CU_TABLE) <= cuivre.delta,
  cuivre ? `c_cu = ${cuivre.value.toFixed(4)} ± ${cuivre.delta.toFixed(4)} (écart ${(cuivre.deviation * 100).toFixed(1)} %)` : 'calcul impossible',
);
check(
  'θf cohérent avec le bilan adiabatique',
  tp2.state.partA.thetaF != null && tp2.state.partA.thetaF > 38 && tp2.state.partA.thetaF < 44,
  `θf = ${tp2.state.partA.thetaF?.toFixed(2)} °C`,
);
tp2.validateA();
check('partie A validée', tp2.state.partADone);

console.log('\n=== TP2 · B — coefficient de Joule J = Wₑ / Q ===');

/* ------------------------------- TP2 · B -------------------------------- */

controller.interact('copper', 2); // sortir le cuivre
controller.interact('balance', 0); // retirer le vase du plateau
controller.interact('vesselFill', 2); // vider et essuyer
tp2.setSelectedVolume(150);
controller.interact('vesselFill', 0);
controller.interact('balance', 0);
controller.interact('balanceRecord', 0); // m₀ partie B
controller.interact('balance', 0);
check('préparation B : eau seule, cuivre sorti', tp2.state.partB.m0 === 150 && tp2.state.copperPlace !== 'vessel', `m₀ = ${tp2.state.partB.m0} g`);
controller.interact('vessel', 2);
controller.interact('calorimeterLid', 2);
controller.interact('thermometer', 2);
controller.interact('stirrer', 0);

const cablage: [string, string][] = [
  ['terminal:genP', 'terminal:ammA'],
  ['terminal:ammB', 'terminal:coilA'],
  ['terminal:coilA', 'terminal:voltP'],
  ['terminal:coilB', 'terminal:voltN'],
  ['terminal:coilB', 'terminal:swA'],
  ['terminal:swB', 'terminal:genN'],
];
cablage.forEach(([from, to]) => {
  controller.interact(from, 0); // fil en main
  controller.interact(to, 0); // raccordement automatique
});
check('montage à 6 fils réalisé en un clic par borne', tp2.state.connections.length === 6 && tp2.state.circuitClosed && tp2.state.wireInHand == null);
controller.interact('terminal:voltN', 0);
tp2.cancelWire();
check('Échap / clic droit dans le vide repose le fil', tp2.state.wireInHand == null && tp2.state.connections.length === 6);

for (let i = 0; i < 4; i += 1) controller.interact('ammeterCalibre', 0); // → 2,4 A
for (let i = 0; i < 4; i += 1) controller.interact('voltmeterCalibre', 2); // → 30 V
check('calibres choisis', tp2.state.ammeterCalibre === 2.4 && tp2.state.voltmeterCalibre === 30, `A ${tp2.state.ammeterCalibre} A · V ${tp2.state.voltmeterCalibre} V`);

waitUntil(() => {
  controller.interact('thermometer', 0);
  return tp2.state.partB.theta0 != null;
}, 900);
check('θ₀ relevé après stabilisation', tp2.state.partB.theta0 != null, `θ₀ = ${tp2.state.partB.theta0?.toFixed(2)} °C`);
controller.interact('genDisplay', 0); // alimentation en marche
run(5);
controller.interact('chrono', 0); // chronomètre
controller.interact('switch', 0); // interrupteur (gestes simultanés)
run(5);
check('courant établi', tp2.state.heatingStarted && tp2.state.current > 1 && tp2.state.voltage > 10, `I = ${tp2.state.current.toFixed(3)} A, U = ${tp2.state.voltage.toFixed(2)} V, P = ${tp2.state.resistorPower.toFixed(1)} W`);
tp2.recordUI();
waitUntil(() => tp2.state.heatingTime >= 180, 600, 10);
controller.interact('switch', 0); // couper le courant
run(60);
controller.interact('thermometer', 0); // θf
const joule = computeJoule(tp2.state);
check(
  'J proche de 4,18 J/cal',
  joule != null && Math.abs(joule.j - CAL_TO_JOULE) / CAL_TO_JOULE < 0.05,
  joule ? `Wₑ = ${joule.we.toFixed(0)} J, Q = ${joule.q.toFixed(1)} cal, J = ${joule.j.toFixed(3)} J/cal (écart ${(joule.deviation * 100).toFixed(1)} %)` : 'calcul impossible',
);
tp2.setAnalogFormula('normalized');
const jouleNormalise = computeJoule(tp2.state);
check(
  'ΔJ cohérent avec la forme normalisée (classe × calibre / 100)',
  jouleNormalise != null && Math.abs(jouleNormalise.j - CAL_TO_JOULE) <= jouleNormalise.dJ,
  jouleNormalise ? `J = ${jouleNormalise.j.toFixed(3)} ± ${jouleNormalise.dJ.toFixed(3)} (ΔWₑ/Wₑ = ${(jouleNormalise.relWe * 100).toFixed(1)} %, ΔQ/Q = ${(jouleNormalise.relQ * 100).toFixed(1)} %)` : '—',
);
check(
  'formule de l’énoncé plus majorante que la forme normalisée',
  joule != null && jouleNormalise != null && joule.dJ > jouleNormalise.dJ,
  `ΔU énoncé ${deltaU({ ...tp2.state, analogFormula: 'manual' }).toFixed(2)} V vs normalisée ${deltaU(tp2.state).toFixed(2)} V · ΔI ${deltaI({ ...tp2.state, analogFormula: 'manual' }).toFixed(3)} A vs ${deltaI(tp2.state).toFixed(3)} A`,
);
tp2.setAnalogFormula('manual');
tp2.validateB();
check('partie B validée', tp2.state.partBDone);
const protocole2 = protocol2(tp2.state);
check('protocole TP2 complet', protocole2.every((step) => step.done), `${protocole2.filter((s) => s.done).length}/${protocole2.length} étapes · μ₀ = ${MU0} g`);

console.log('\n=== Garde-fous pédagogiques ===');

const avis = () => tp2.state.notice.text;
controller.interact('thermometer', 2);
controller.interact('thermometer', 0);
check('lecture refusée thermomètre retiré', avis().includes('pas dans le calorimètre'), avis());
controller.interact('beaker', 0);
check("versement d'eau chaude refusé pendant la partie B", avis().includes('Partie B en cours'), avis());
controller.interact('calorimeterLid', 0);
controller.interact('vessel', 2);
controller.interact('balance', 0);
controller.interact('balanceRecord', 2); // tare
check('tare de la balance', avis().startsWith('Tare effectuée') && balanceReading(tp2.state) < 0.01, avis());
controller.interact('balanceRecord', 0);
check('consigne refusée sous tare', avis().includes('à zéro'), avis());
controller.interact('balanceRecord', 2); // annuler la tare
tp2.setSelectedVolume(50);
controller.interact('vesselFill', 0);
check('ajout d’eau après m₀ : m₀ annulé et repesée demandée', tp2.state.partB.m0 == null && avis().includes('repesez'), avis());
controller.interact('balance', 0);
controller.interact('ammeterCalibre', 2); // calibre trop petit
if (!tp2.state.generatorOn) controller.interact('genDisplay', 0);
if (tp2.state.switchClosed) controller.interact('switch', 0);
controller.interact('switch', 0);
run(30);
check('alerte aiguille hors échelle', avis().includes('hors échelle'), `${avis()} (I = ${tp2.state.current.toFixed(2)} A, calibre ${tp2.state.ammeterCalibre} A)`);
controller.interact('switch', 0);
controller.interact('genDisplay', 0);
controller.interact('ammeterCalibre', 0);
const avant = tp2.state.connections.length;
controller.interact('wire', 2); // clic droit sur un fil : retire le dernier posé
check('retrait du dernier fil posé', tp2.state.connections.length === avant - 1 && !tp2.state.circuitClosed, `${avant} → ${tp2.state.connections.length} fils`);
controller.interact('terminal:swB', 0);
controller.interact('terminal:genN', 0);
check('remise en place du fil', tp2.state.connections.length === 6 && tp2.state.circuitClosed);
check('accélération du temps commune aux deux TP', controller.setSpeed(30) === 30 && controller.cycleSpeed() === 1 && controller.cycleSpeed(true) === 30, `×${controller.speed}`);

/* -------------------------------- bilan --------------------------------- */

console.log(`\n=== Bilan : ${failures === 0 ? 'toutes les vérifications passent' : `${failures} vérification(s) en échec`} ===`);
console.log(`TP1 : ${protocole1.filter((s) => s.done).length}/${protocole1.length} étapes · TP2 : ${protocole2.filter((s) => s.done).length}/${protocole2.length} étapes`);
if (typeof document !== 'undefined' && document.getElementById('root')) {
  document.getElementById('root')!.innerHTML = `<pre>${failures} échec(s)</pre>`;
}
if (failures > 0 && typeof process !== 'undefined') process.exitCode = 1;
