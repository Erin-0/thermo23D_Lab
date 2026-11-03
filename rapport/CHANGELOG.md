# Historique des versions

## v2.0.0 — 4 novembre 2026

Refonte complète à partir de la v1 : le TP1 est repris point par point selon les demandes, le
TP2 « Calorimétrie » du fascicule est ajouté dans la même salle, et toutes les grandeurs passent sur
l'écran d'ordinateur de la paillasse.

### Ajouté

- **TP2 · Calorimétrie** (seconde paillasse, même salle) :
  - calorimètre adiabatique avec vase, couvercle, thermomètre 0–110 °C au 1/10, agitateur et
    résistance chauffante R = 11,4 Ω immergée ; valeur en eau μ₀ = 32,5 g affichée sur le panneau
    mural de la salle ;
  - alimentation continue (bouton marche/arrêt, molette de consigne 15 V, résistance interne 0,6 Ω,
    limitation 2,4 A) et interrupteur de circuit ;
  - ampèremètre et voltmètre analogiques à aiguille : 30 divisions, classe 1,5, sélecteurs de
    calibres (0,3 / 0,6 / 1,2 / 2,4 A ; 3 / 7,5 / 15 / 30 V) et alerte « aiguille hors échelle » ;
  - balance électronique ±0,01 g : pose/retrait du vase ou du cuivre, afficheur cliquable pour
    consigner, tare (afficheur et touche dédiées) ;
  - chronomètre exigeant le démarrage simultané avec l'interrupteur ;
  - bécher + chauffe-bécher 3 niveaux (220 / 420 / 600 W), éprouvettes 50 / 100 / 150 / 200 mL
    (le clic choisit le volume versé), masse de cuivre 121,3 g sur sa coupelle ;
  - câblage à 6 fils : un clic met le fil en main, le clic suivant le connecte automatiquement ;
    `Échap` ou clic droit dans le vide pour le reposer, clic droit sur un fil pour retirer le dernier
    posé ;
  - exploitation : partie A (c_cu et Δc_cu par Σ|∂c/∂xᵢ|Δxᵢ, comparaison aux tables) et partie B
    (Wₑ, Q, J = Wₑ/Q et incertitudes en composition quadratique), tableaux, formules et export CSV.
- **Poste d'acquisition unique** sur la table TP1 : écran d'ordinateur relié à la cocotte qui résume
  les deux TP (températures, pressions, eau, soupape, plaque, montage électrique, calibres,
  incertitudes actives, chronomètres, agitation, bécher, phase).
- **Trois niveaux de qualité** (basse / moyenne / haute) : dpr, ombres, transmission du verre,
  densité géométrique, vapeur, cadence des écrans, du survol par rayon et de l'interface ; menu
  qualité (touche `3`), `Ctrl+1/2/3`, mémorisation locale, moniteur de cadence avec suggestion
  automatique sous 26 img/s.
- **Accélération du temps de séance** ×1 / ×4 / ×12 / ×30, commune aux deux paillasses (boutons du
  dock, touches `X`, `−`, `+`), avec badge rappelant le facteur et l'heure de séance.
- **Protocole mémorisé** : les 9 étapes du TP1 et les 22 étapes du TP2 restent cochées une fois
  accomplies, même si l'installation revient en arrière ensuite.
- Commutateur de **formule d'incertitude analogique** (énoncé `classe × calibre²/100` ↔ normalisée
  `classe × calibre/100`) dans Mesures → TP2 · B, les deux colonnes restant affichées.
- Panneau d'aide enrichi (commandes, appareils, formules des deux TP, consignes de sécurité).
- `tests/sim-harness.ts` + `npm run test:sim` : rejeu headless des deux protocoles, 40 vérifications
  chiffrées (paliers, dépression, Duperray, Clapeyron, c_cu, J, garde-fous).
- `.gitignore`, `README.md`, `rapport/RAPPORT.md`.

### Modifié

- TP1 : cuve livrée remplie avec **1,00 L** (consigne du livre), repère « 1 L » sur le tube de
  niveau et sur l'écran.
- TP1 : autocuiseur **scellé et immobile** sur son foyer ; les clics sur le corps ou le couvercle
  rappellent la consigne de sécurité au lieu d'ouvrir quoi que ce soit.
- TP1 : paillasse réduite à 2,40 × 0,95 m ; salle réorganisée pour accueillir la seconde paillasse
  (8 × 5,8 m), caméra bornée, collisions avec clearance 0,2 m.
- TP1 : physique reprise — plaque de fonte 1400 J/K, contact plaque/cuve 40 W/K, pertes cuve
  1,35 W/K (+ 1,05 W/K en soupape 0), seuils de soupape 0 / +0,55 / +1,20 bar, rotation de la
  soupape dès l'approche du seuil de régulation. Le palier atmosphérique est atteint en ≈ 13 min à
  6/6 (la cuve restait bloquée à 88 °C auparavant), la soupape 1 donne 112,5 °C / +0,54 bar, la
  soupape 2 123 °C / +1,20 bar, la dépression apparaît après ≈ 9 min de refroidissement.
- TP2 : pertes du calorimètre fermé ramenées à 0,008 W/K — la fuite thermique était du même ordre
  que le signal cherché (l'effet du cuivre ne déplace θf que de 0,84 K).
- TP2 : stabilisation jugée sur la **dérive** (|dθ/dt| < 0,3 °C/min, agitation en marche, eau et
  paroi homogènes) et non plus sur la proximité de la température ambiante.
- TP2 : le remplissage du bécher et du vase utilise le **volume d'éprouvette sélectionné** ;
  le versement d'eau chaude est refusé pendant la partie B ; l'ajout d'eau après consignation de m₀
  annule m₀ et demande une repesée.
- TP2 : m₁ = m_total − mᵥ − m₀ − m_cu — le cuivre resté dans le vase lors de la pesée finale était
  compté dans l'eau chaude (121,3 g d'erreur).
- TP2 : Δθ = 0,1 °C (thermomètre gradué au 1/10) au lieu de 1 °C, qui rendait Δc_cu supérieur à
  c_cu ; agitation minimale de 120 s avant θ₀ (manuel : ≈ 5 min).
- Interface : télémétrie HTML flottante, lignes d'appareils et mini-chronomètre de la v1 supprimés
  au profit de l'écran d'acquisition et des panneaux ; feuille de style étendue (commutateur de
  paillasse, menu qualité, onglets de mesures, tableaux d'incertitudes, bandeaux).
- `package.json` v2.0.0, `index.html` (langue, titre, description).

### Supprimé

- **Robinet et évier** du TP1 (source de complications sans intérêt pour le TP) ; l'eau reste
  présente, pré-remplie, et seule la vaporisation fait baisser le niveau.
- Ouverture/pilotage du couvercle de l'autocuiseur.
- `src/lab/simulation.ts`, `src/lab/models.tsx`, `src/lab/textures.ts` (v1), remplacés par
  `shared.ts`, `tp1.ts`, `tp2.ts`, `controller.ts`, `screens.ts`, `room.tsx`, `tp1Models.tsx`,
  `tp2Models.tsx`.
- Mode « cuivre plongé dans le bécher » ajouté en cours de développement : le fascicule demande de
  peser le cuivre puis de l'introduire dans le calorimètre, il fait donc partie du mélange initial.

### Corrigé

- Cuve du TP1 incapable d'atteindre l'ébullition (bilan plaque/pertes déséquilibré).
- Température du cuivre figée lorsqu'il était censé être dans l'eau (branche de couplage jamais
  exécutée) → θf faux et c_cu négatif.
- Étapes de protocole qui se décochaient seules (soupape repassée à 0, bécher refroidi, cuivre
  retiré pour la partie B).
- Retrait du vase de la balance qui laissait l'afficheur chargé (`balanceLoad` remis à `none`).
- Avis de câblage invalide muet : il liste désormais les raccordements attendus.
- `θ₁` proche de l'ébullition : un avis explique pourquoi (θ₁ − θf) s'effondre et conseille
  75 à 90 °C.

## v1.0.0 — dépôt initial

Autocuiseur 3D (TP1) avec remplissage au robinet, couvercle ouvrable, soupape, plaque chauffante,
manomètres, télémétrie HTML flottante, tableau de mesures et export CSV.
