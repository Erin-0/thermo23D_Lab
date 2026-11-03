# Rapport — THERMO.lab v2 : TP1 refondu, TP2 calorimétrie ajouté

Date : 4 novembre 2026 · Dépôt : `Erin-0/thermo23D_Lab` · Branche : `main`
Base : version 1 (autocuiseur 3D + télémétrie HTML), fascicule `output.md`.

---

## 1. Demande traitée

### TP1 — équilibre liquide-vapeur

| # | Demande | Réalisation |
| --- | --- | --- |
| 1 | Remplir la cocotte automatiquement selon le manuel (≈ 1 L) | Cuve livrée avec **1,00 L** (`BOOK_WATER`), repère « 1 L (livre) » tracé sur le tube de niveau et sur l'écran ; aucune action de remplissage n'est demandée. |
| 2 | Supprimer le robinet | Robinet, évier et toute la plomberie **supprimés** ; l'eau reste présente (pré-remplie). Le vidage n'existe plus : seule la vaporisation fait baisser le niveau (336 g sur une séance complète). |
| 3 | Réduire la taille de la première table | Paillasse TP1 ramenée à **2,40 × 0,95 m** (plan de travail à 0,92 m). |
| 4 | Cocotte immobile, sans ouverture ni pilotage du couvercle | Autocuiseur **scellé et fixe** sur son foyer (`POT_ON_PLATE`, `isPotOnPlate() ≡ true`). Tout clic sur le corps ou le couvercle renvoie la consigne de sécurité du fascicule : « ne jamais essayer de bloquer ou de dévisser la soupape ». |
| 5 | Écran d'ordinateur sur la table, relié à la cocotte, affichant **toutes** les informations | Un poste d'acquisition unique (`drawAcquisitionScreen`) : colonne TP1 (T, Pᵣ, Pₛ, Antoine, Duperray, masse d'eau + jauge avec repère 1 L, vaporisé, soupape, plaque et sa température, jet de vapeur, chronomètre, points relevés, phase) et colonne TP2 (θ eau, θ paroi/μ₀, θ cuivre, masse d'eau, balance, montage 6 fils, U et calibres, I et calibres, ΔU/ΔI, puissance, générateur, chronomètre, durée de chauffage, agitateur/couvercle/thermomètre, bécher), pied de page rappelant les formules d'incertitude actives. La télémétrie HTML flottante de la v1 a été retirée. |
| 6 | Ralentissements en regardant les outils → 3 niveaux de qualité | Trois préréglages (`QUALITY_PRESETS`) : **basse** (dpr 0,60–0,85, ombres coupées, écrans 5 Hz, raycast 20 Hz), **moyenne** (dpr 0,85–1,35, PCF 1024, 8 Hz), **haute** (dpr 1–1,75, PCFSoft 2048, verre transmis, 12 Hz). Menu qualité (touche `3`), `Ctrl+1/2/3`, mémorisation `localStorage`, moniteur de cadence avec suggestion automatique sous 26 img/s. |

### TP2 — calorimétrie (ajout complet)

Même salle, **seconde paillasse** (`TP2_ORIGIN = [-2,65 ; 0 ; 1,3]`, table 2,00 × 1,15 m), atteinte
par la touche `2` ou le commutateur de la barre haute (trajet de caméra ~1,05 s). Un **seul panneau
« Mesures »** à trois onglets : TP1 · P & T, TP2 · A — c_cu, TP2 · B — Joule. Le panneau
« Protocole » affiche les deux TP (9 + 22 étapes) avec l'objectif courant en bandeau.

Matériel modélisé, conforme au fascicule et aux observations de la salle réelle :

- **calorimètre adiabatique** avec vase calorimétrique, couvercle, thermomètre 0–110 °C au 1/10,
  agitateur, résistance chauffante immergée R = 11,4 Ω ; valeur en eau **μ₀ = 32,5 g** (Δμ₀ = 0,01 g)
  affichée sur le panneau mural de la salle ;
- **alimentation continue** (bouton marche/arrêt, molette de consigne, ≈ 15 V, résistance interne
  0,6 Ω, limitation 2,4 A) + **interrupteur** de circuit ;
- **ampèremètre** et **voltmètre** analogiques : aiguille réelle, 30 divisions, classe 1,5,
  sélecteurs de calibres (0,3 / 0,6 / 1,2 / 2,4 A et 3 / 7,5 / 15 / 30 V), alerte « aiguille hors
  échelle » ;
- **balance électronique** ±0,01 g (afficheur, touche TARE, plateau) ;
- **chronomètre** (démarrage simultané à l'interrupteur exigé) ;
- **bécher + chauffe-bécher** (3 niveaux, 220 / 420 / 600 W) ;
- **éprouvettes** 50 / 100 / 150 / 200 mL : le clic choisit le volume qui sera versé ;
- **masse de cuivre** 121,3 g sur sa coupelle.

---

## 2. Architecture

```
src/lab/shared.ts     constantes physiques, préréglages de qualité, SPEEDS, BENCHES,
                      helpers d'incertitude (lecture / instrument / normalisée / quadrature)
src/lab/tp1.ts        Tp1Simulation : physique, protocole, relevés, CSV, Duperray, Clapeyron
src/lab/tp2.ts        Tp2Simulation : physique, protocole, balance, câblage, exploitation, CSV
src/lab/controller.ts LabController : aiguillage interact(id, button), qualité, FPS, vitesse
src/lab/screens.ts    textures canvas (écrans, afficheurs, cadrans, aiguilles)
src/lab/room.tsx      salle 8 × 5,8 m, éclairage, panneau mural μ₀
src/lab/tp1Models.tsx / tp2Models.tsx   géométries et zones cliquables (ActionGroup)
src/lab/LabScene.tsx  Canvas R3F, caméra première personne, collisions, raycast décimé
src/components/Panels.tsx  ProtocolPanel, MeasuresPanel, HelpModal, QualityMenu
src/App.tsx           coquille HTML : barre haute, dock, bandeaux, écran d'accueil
```

Principe retenu : **la physique vit hors de React** (classes `Tp1Simulation` / `Tp2Simulation`
mutant un état), l'interface prélève un instantané à `preset.hudHz` et le rendu 3D à
`preset.screenHz` / `preset.rayHz`. Cela découple la cadence d'affichage de la stabilité numérique
et permet de tout rejouer sans navigateur (`tests/sim-harness.ts`).

Chaque pas de temps est subdivisé (`scaled = min(0,12 ; dt) × vitesse`, sous-pas ≤ 0,04–0,05 s),
ce qui rend l'accélération ×30 stable : les constantes de temps (plaque, paroi, cuivre, filtres
d'aiguille) restent résolues.

---

## 3. TP1 — modèle et réglages

**Chaîne plaque → cuve.** La plaque de fonte (capacité 1400 J/K, ≈ 3 kg) reçoit
`HEATER_POWER[niveau]` (0…1250 W), perd `2,0 W/K` vers la salle et cède à la cuve
`40 W/K × (T_plaque − T_cuve)`, plafonné à ±1400 W. La cuve (1650 J/K d'acier + 4180 J/K par litre
d'eau + 230 J/K de couvercle) perd `1,35 W/K` (+ 1,05 W/K d'ouverture en soupape 0).

Ce réglage a été repris après mesure : la conductance de perte de la v1 (4,4 W/K) et le contact
trop faible (16 W/K) bloquaient la cuve à ≈ 88 °C — **la cocotte n'atteignait jamais l'ébullition**.
Avec les valeurs ci-dessus, le palier atmosphérique est atteint en **13 min** à 6/6.

**Équilibre liquide-vapeur.** Pression d'équilibre = pression partielle d'air + Pₛ(Antoine,
coefficients eau 99–180 °C) ; la pression affichée relaxe vers `min(équilibre ; seuil de soupape)`
(τ = 0,32 s en soupape 0, 0,85 s en 1, 1,2 s en 2). Seuils : atmosphère + 0,009 bar (légère
surpression du fascicule), +0,55 bar, +1,20 bar. Au-delà du seuil, la vapeur s'échappe
(`ventRate`), l'air résiduel est entraîné et **la soupape tourne** dès l'approche du seuil de
régulation — c'est l'observation demandée par le manuel. Tant que la cuve est au palier, 99,2 % de
la puissance nette part en chaleur latente (2500,8 − 2,36 T kJ/kg) : la température reste au point
d'ébullition correspondant à la pression, ce qui produit les paliers T/P.

**Refroidissement.** Chauffage coupé, soupape 2 (cuve fermée) : la vapeur se condense, la pression
suit Pₛ(T) et passe sous la pression atmosphérique — la dépression apparaît et le couvercle est
plaqué, exactement comme le demande la partie 2.2.1 du manuel.

**Relevés.** Automatiques toutes les 60 s dès 80 °C ou manuels (`N`), horodatés, avec la phase
(Chauffage / Refroidissement / Manuel), export CSV (`temps_s;T_C;Pr_bar;Ps_bar;Ps_Duperray_bar;phase`).
Le panneau affiche l'écart moyen et RMS à Duperray, la pente dP/dT et L_v déduit de Clapeyron.

### Résultats mesurés (harnais, niveau 6, 1,00 L)

| Grandeur | Valeur obtenue | Attendu / référence |
| --- | --- | --- |
| Palier atmosphérique | 100,1 °C · Pᵣ = +0,003 → +0,009 bar, atteint en 780 s | ébullition à ≈ 100 °C avec légère surpression |
| Soupape 1 | 112,5 °C · Pᵣ = +0,538 bar · soupape tournante (465 s) | T_sat(1,575 bar) = 112,5 °C |
| Soupape 2 | 123,1 °C · Pᵣ = +1,155 → +1,200 bar (390 s) | T_sat(2,225 bar) ≈ 123,4 °C |
| Dépression | Pᵣ < 0 après 555 s de refroidissement, à 99,6 °C | passage sous Pₐₜₘ sous ≈ 100 °C |
| Fin de refroidissement | 69,2 °C · Pᵣ = −0,72 bar | Pₛ(69 °C) ≈ 0,30 bar absolu |
| Bilan d'eau | 664 g restants · 336 g vaporisés | séance ≈ 45 min de chauffe |
| Duperray | écart moyen +3,6 %, RMS 13,3 % (points > 60 °C) | formule empirique, dérive attendue aux basses T |
| Clapeyron à 110 °C | dP/dT = 47,6 mbar/K · **L_v = 2248 kJ/kg** | tables : ≈ 2230 kJ/kg |

---

## 4. TP2 — modèle et réglages

### 4.1 Nœuds thermiques

- **eau du vase** `waterC = m × 4,184 J/K`, chauffée par la résistance immergée (`electrical`) et
  par le mélange d'eau chaude ;
- **paroi / accessoires** = valeur en eau μ₀ (`WALL_C = 32,5 × 4,184 = 136 J/K`), couplée à l'eau
  avec τ = 9 s (agitateur en marche) ou 150 s (à l'arrêt) — d'où l'exigence d'agiter ;
- **masse de cuivre** (46,7 J/K) couplée à l'eau avec τ = 16 s (agité) ; sur la paillasse elle suit
  la température de la salle (τ = 55 s) ;
- **pertes** : 0,008 W/K couvercle fermé (enceinte adiabatique), 0,55 W/K couvercle retiré,
  1,1 W/K vase nu sur la paillasse.
- **bécher** : 200 g d'eau + 62 J/K de verre, chauffé par contact avec la plaque
  (`2,4 W/K × (T_plaque − T_bain)`, plaque pilotée à 220/420/600 W), pertes 0,42 W/K + terme
  convectif au-delà de 60 °C, ébullition plafonnée à 99,4 °C.

Le réglage des pertes a été repris : à 0,09 W/K (valeur initiale de la v2 en cours de mise au
point), la fuite thermique (≈ 1 K sur la durée de la partie A) était du même ordre que **le signal
recherché** — l'écart de température dû au cuivre n'est que de 0,84 K. À 0,008 W/K, la perte tombe
à ≈ 0,07 K et c_cu retrouve la valeur des tables.

### 4.2 Partie A — méthode des mélanges

Ordre strictement conforme au mode opératoire du fascicule :

1. mᵥ par pesée du vase vide ; 2. m₀ = m(eau+vase) − mᵥ après remplissage à l'éprouvette ;
3. **m_cu pesé sur la balance** (le cuivre se pose sur le plateau, l'afficheur donne 121,30 g) puis
   **introduit dans le calorimètre** ; 4. couvercle, thermomètre, agitateur ≈ 5 min, θ₀ ;
5. m₁ d'eau chauffée au bécher à θ₁ versée dans le calorimètre, 1 min d'agitation, θf ;
6. thermomètre et couvercle retirés, pesée finale, m₁ = m_total − mᵥ − m₀ − m_cu.

Le cuivre fait donc partie du **mélange initial** (il est à θ₀), comme l'écrit l'énoncé : il n'est
jamais plongé dans le bécher. Un mode « cuivre dans le bain » existait dans une étape intermédiaire
du développement ; il contredisait le fascicule et a été supprimé (le cuivre n'a plus que trois
places : coupelle, plateau de la balance, vase).

```
c_cu = [ m₁·c₀·(θ₁ − θf) − (m₀ + μ₀)·c₀·(θf − θ₀) ] / [ m_cu·(θf − θ₀) ]
Δc_cu = Σᵢ |∂c_cu/∂xᵢ| · Δxᵢ        (somme arithmétique, méthode de l'énoncé)
```

Incertitudes retenues : Δm = 0,01 g (balance, une seule pesée), Δμ₀ = 0,01 g (panneau mural),
**Δθ = 0,1 °C** (thermomètre gradué au 1/10), Δc₀/c₀ = 5 %. Le Δθ = 1 °C utilisé en cours de
développement rendait Δc_cu supérieur à c_cu et l'exploitation illisible ; le gradué au 1/10 du
fascicule impose 0,1 °C.

### 4.3 Partie B — coefficient de Joule

Vase vidé et essuyé, cuivre sorti, m₀ ≈ 150 g d'eau froide, pesée, calorimètre refermé.
Montage : alimentation → ampèremètre → résistance → interrupteur → retour, voltmètre en
dérivation aux bornes de la résistance (6 fils). I = E/(R + r) avec E = 15 V, R = 11,4 Ω,
r = 0,6 Ω, limitation 2,4 A ; U est la tension aux bornes de R.

```
Wₑ = U·I·t        Q = (m₀ + μ₀)·c₀·(θf − θ₀)        J = Wₑ / Q
ΔWₑ/Wₑ = √[(ΔU/U)² + (ΔI/I)² + (Δt/t)²]        ΔJ/J = √[(ΔWₑ/Wₑ)² + (ΔQ/Q)²]
ΔX = (ΔX)lecture + (ΔX)instrument ;  lecture = calibre / 30 ;  Δt = 0,2 s
```

**Deux formes d'incertitude instrumentale**, commutables dans « Mesures → TP2 · B » :

- `énoncé` : instrument = classe × calibre² / 100 → ΔU = 14,50 V au calibre 30 V, soit
  ΔWₑ/Wₑ ≈ 103 %. Cette forme, écrite telle quelle dans le fascicule, est très majorante ;
- `normalisée` : instrument = classe × calibre / 100 → ΔU = 1,45 V, ΔWₑ/Wₑ ≈ 13,8 %.

Les deux colonnes restent affichées côte à côte dans le tableau d'incertitudes, ΔWₑ, ΔQ et ΔJ sont
recalculés selon la formule active, et l'écran d'acquisition rappelle laquelle est choisie.

Un relevé de θ₀ n'est accepté que si l'agitate­ur tourne, que l'eau et la paroi sont homogènes
(|θ − θ_paroi| < 0,15 °C) et que la **dérive** est inférieure à 0,3 °C/min (suivi `driftPerMinute()`
sur fenêtres de 0,25 s) — le critère « θ proche de la température ambiante » utilisé au départ
échouait dès que la salle avait été réchauffée par la partie A.

### 4.4 Résultats mesurés (harnais)

| Grandeur | Valeur | Référence |
| --- | --- | --- |
| mᵥ / m₀ / m_cu / m₁ | 96,40 / 150,00 / 121,30 / 100,00 g | valeurs de la salle |
| θ₀ / θ₁ / θf (A) | 19,96 / 86,47 / 42,61 °C | θf adiabatique théorique 42,7 °C |
| **c_cu** | **0,0919 ± 0,0197 cal·g⁻¹·°C⁻¹** (écart 8,1 %) | tables : 0,100 — compatible à 0,4 σ |
| Termes dominants de Δc_cu | θf 0,0107 · c₀ 0,0046 · θ₁ 0,0036 | sensibilité en (θf − θ₀)⁻¹ |
| U / I / t (B) | 14,25 V / 1,250 A / 185 s | E = 15 V, R+r = 12 Ω → 1,25 A |
| Wₑ / Q | 3294 J / 785,5 cal | — |
| **J** | **4,193 J/cal** (écart 0,2 %) | 4,184 J/cal |
| ΔJ | ± 4,31 (énoncé) · **± 0,63 (normalisée)** | ΔWₑ/Wₑ = 102,6 % / 13,8 %, ΔQ/Q = 6,0 % |

---

## 5. Interactions et garde-fous

**Câblage sans fuite.** Un clic sur une borne met le fil en main (une seule extrémité visible,
aucune seconde prise exposée) ; le clic suivant, **même imprécis**, connecte automatiquement le fil
si la paire fait partie du montage attendu, sinon le fil est repris en main sur la nouvelle borne et
un avis liste les raccordements manquants. `Échap` ou un clic droit dans le vide repose le fil ; un
clic droit sur un fil posé retire le dernier fil. Le montage complet ferme le circuit et allume un
badge (qualité ≥ moyenne).

**Balance.** Clic = poser/retirer le vase (ou le cuivre), clic sur l'afficheur = consigner la masse
utile selon l'avancement (mᵥ → m₀ → m_total/m₁ → m₀ partie B), clic droit sur l'afficheur = tare,
touche TARE dédiée. La pesée est refusée sous tare avec l'explication.

**Garde-fous pédagogiques vérifiés** : résistance alimentée hors d'eau, chauffe-bécher à vide,
aiguille hors échelle (calibre trop petit), interrupteur fermé sans chronomètre simultané,
versement d'eau chaude pendant la partie B (refusé), ajout d'eau après consignation de m₀
(m₀ annulé, repesée demandée), θ₀/θf relevés avant équilibre (refusés avec la raison), couvercle
requis pour l'agitateur et le thermomètre, vase à sortir du calorimètre avant vidage/pesée.

Le protocole est **mémorisé** (`state.achieved`) : une étape accomplie reste cochée même si l'on
revient en arrière ensuite (soupape repassée en 0, bécher refroidi, cuivre retiré pour la partie B…).

---

## 6. Performance

Trois préréglages de qualité agissent sur : `dpr` du Canvas, type/taille de la carte d'ombres,
transmission du verre, densité de segments des cylindres, nombre de particules de vapeur, cadence
de rafraîchissement des textures d'écrans (`screenHz`), du survol par rayon (`rayHz`) et de
l'interface HTML (`hudHz`). Le Canvas est remonté (`key={quality}`) à chaque changement pour que
`dpr`/`shadows` soient réellement appliqués. Un moniteur de cadence mesure la moyenne sur 90 images
et propose la qualité basse sous 26 img/s (une seule fois, bandeau `perf-hint`).

Le survol par rayon est décimé (20 Hz en basse qualité) et les câbles sont recalculés uniquement
lorsque leurs extrémités changent : regarder les appareils de près ne coûte plus un rayon par objet
et par image.

---

## 7. Validation

`npm run test:sim` regroupe `tests/sim-harness.ts` avec esbuild et le rejoue dans Node (socle DOM
minimal, aucun WebGL). Le harnais rejoue **les deux protocoles complets** par les mêmes gestes que
l'utilisateur (`controller.interact(id, button)`), accélère le temps comme le ferait l'élève, puis
vérifie 40 points :

- TP1 : durée et valeur du palier atmosphérique, palier et rotation en soupape 1, palier de
  sécurité en soupape 2, refroidissement, délai de dépression, protocole 9/9, bilan d'eau, écart à
  Duperray, L_v de Clapeyron ;
- TP2 A : mᵥ, m₀, m_cu (avec l'afficheur de la balance), introduction du cuivre, θ₀ après agitation,
  θ₁ ≥ 75 °C, m₁ par pesée finale, θf dans la fenêtre adiabatique, c_cu compatible avec les tables ;
- TP2 B : préparation (eau seule, cuivre sorti), 6 fils en un clic par borne, annulation du fil,
  calibres, θ₀ stabilisé, courant établi, J à moins de 5 % de 4,184, ΔJ cohérent avec la forme
  normalisée, formule de l'énoncé plus majorante, protocole 22/22 ;
- garde-fous : les refus et alertes listés en §5, plus le retrait/repose d'un fil et la vitesse
  commune aux deux TP.

État au 4 novembre 2026 : **40/40 vérifications passent**, `tsc --noEmit` sans erreur
(configuration `strict` + `noUnusedLocals`), et le serveur de développement transforme les
14 modules sans erreur.

Le harnais avait aussi pour effet de bord de révéler les défauts corrigés pendant la mise au point :
cuve bloquée à 88 °C (pertes trop fortes), cuivre jamais couplé à l'eau, remplissage du bécher
ignorant le volume d'éprouvette choisi, m₀ de la partie B jamais atteint, θ₀ refusé dès que la salle
avait été réchauffée, m₁ faux lorsque le cuivre restait dans le vase lors de la pesée finale
(121,3 g comptés dans l'eau chaude), étapes de protocole qui se décochaient en refroidissant.

---

## 8. Limites et pistes

- **Incertitude de l'énoncé.** La forme `classe × calibre²/100` donne ΔU ≈ U : ΔWₑ/Wₑ ≈ 100 %. Le
  commutateur permet de travailler avec les deux lectures, mais le fascicule lui-même gagnerait à
  être corrigé.
- **Sensibilité de la partie A.** c_cu est la différence de deux grands nombres : avec θ₁ proche de
  l'ébullition, (θ₁ − θf) s'effondre et Δc_cu explose. L'application conseille 75–90 °C et explique
  la raison dans le panneau ; un élève pressé obtiendra quand même une valeur hors tables.
- **TP3 (pompe à chaleur)** du fascicule n'est pas implémenté : hors périmètre de la demande.
- **Build monofichier** : Three.js + drei inlinés dépassent la mémoire disponible dans
  l'environnement de développement sandbox (1 Go) ; la vérification passe par le serveur de dev et
  par `tsc`. Sur une machine normale, `npm run build` produit un `dist/index.html` autonome.
- **Rendu** : la vérification automatique porte sur la physique et la logique d'interaction, pas sur
  l'image produite (pas de navigateur dans l'environnement de mise au point). Le positionnement des
  objets et des étiquettes reste à valider visuellement.
