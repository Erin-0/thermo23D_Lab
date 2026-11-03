# THERMO.lab — TP1 Équilibre liquide-vapeur & TP2 Calorimétrie

Laboratoire de thermodynamique en 3D à la première personne (React + Three.js / @react-three/fiber),
construit à partir du fascicule de TP `output.md`. Deux travaux pratiques se partagent **une seule
salle** : la paillasse TP1 (autocuiseur instrumenté) et la paillasse TP2 (calorimétrie).

Toutes les grandeurs sont résumées sur **l'écran d'ordinateur relié à la cocotte** (poste
d'acquisition unique) : il n'y a plus de télémétrie flottante en HTML.

## Lancer

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run test:sim     # rejoue les deux protocoles sans rendu 3D (40 vérifications)
npm run build        # build Vite monofichier (dist/index.html)
```

> Le build monofichier charge Three.js + drei en une seule page : prévoir ≥ 3 Go de mémoire
> disponible pour `npm run build`. Le développement (`npm run dev`) n'a pas cette contrainte.

## Commandes

| Entrée | Action |
| --- | --- |
| ZQSD / WASD, souris | Se déplacer, regarder (clic pour capturer la souris) |
| `1` / `2` | Marcher jusqu'à la paillasse TP1 / TP2 |
| Clic gauche | Actionner l'élément visé (soupape, bouton, appareil, balance, bécher, éprouvette, borne) |
| Clic droit | Action inverse ou complémentaire (verrou précédent, retirer un fil, tare, vider, sortir le vase) |
| `E` | Actionner l'élément visé sans clic |
| Borne + clic | Un clic met **le fil en main** ; le clic suivant le **connecte automatiquement** à la borne visée |
| `Échap` / clic droit dans le vide | Reposer le fil en main |
| `N` | Relever P & T (tableau TP1) · `T` : pause/reprise du chronomètre TP1 |
| `F` ou clic central | Zoom optique stabilisé · `Maj` : se pencher |
| `3` | Menu qualité · `Ctrl + 1/2/3` : qualité basse / moyenne / haute |
| `X`, `−`, `+` | Vitesse du temps de séance : ×1, ×4, ×12, ×30 (les deux TP suivent) |

Les paliers du TP1 et les équilibres du TP2 demandent plusieurs dizaines de minutes de temps
laboratoire : accélérez pendant les chauffes, revenez à ×1 pour les relevés.

## Contenu du dépôt

```
index.html            page unique (Vite)
output.md             fascicule de TP source (TP1, TP2, TP3)
rapport/RAPPORT.md    rapport détaillé de la version 2 (modèles, choix, validation)
rapport/CHANGELOG.md  historique des versions
src/
  main.tsx            point d'entrée React
  App.tsx             coquille : barre haute, dock, panneaux, écrans d'accueil/aide
  index.css           feuille de style complète (pas de framework CSS)
  components/Panels.tsx  Protocole (TP1 + TP2), Mesures (3 onglets), Aide, menu Qualité
  lab/shared.ts       constantes, préréglages de qualité, vitesses, incertitudes
  lab/tp1.ts          simulation TP1 (physique + protocole + relevés + CSV)
  lab/tp2.ts          simulation TP2 (physique + protocole + exploitation + CSV)
  lab/controller.ts   aiguillage des interactions, qualité, cadence, vitesse
  lab/screens.ts      textures canvas : écran d'acquisition, afficheurs, cadrans
  lab/room.tsx        salle, sol, murs, éclairage, panneau mural μ₀
  lab/tp1Models.tsx   autocuiseur, plaque, soupape, manomètres, table TP1
  lab/tp2Models.tsx   calorimètre, alimentation, ampèremètre, voltmètre, balance,
                      bécher + chauffe-bécher, éprouvettes, cuivre, fils
  lab/LabScene.tsx    Canvas R3F, caméra première personne, raycast décimé, HUD FPS
tests/
  sim-harness.ts      harnais headless : rejoue TP1 + TP2 A + TP2 B et vérifie les résultats
  run-tests.mjs       socle DOM minimal pour exécuter le harnais dans Node
```

## Les deux TP

**TP1 — équilibre liquide-vapeur.** Autocuiseur 8 L scellé et immobile sur sa plaque, rempli
d'avance avec 1,00 L d'eau comme l'impose la consigne de sécurité. Soupape à trois positions
(0 : atmosphère ; 1 : régulation ≈ +0,55 bar, la soupape tourne ; 2 : cuve fermée, sécurité
≈ +1,20 bar). Chauffage, paliers, coupure du chauffage puis refroidissement et dépression.
Exploitation : Pₛ = Pᵣ + Pₐₜₘ, formule de Duperray (T/100)⁴, relation de Clapeyron et L_v.

**TP2 — calorimétrie.** Calorimètre adiabatique de valeur en eau μ₀ = 32,5 g (affichée sur le
panneau mural), balance électronique ±0,01 g avec tare, thermomètre 0–110 °C au 1/10,
agitateur, chronomètre, bécher + chauffe-bécher, éprouvettes 50/100/150/200 mL, masse de cuivre
121,3 g, alimentation continue, interrupteur, ampèremètre et voltmètre analogiques (30 divisions,
classe 1,5), résistance chauffante R = 11,4 Ω.

- **Partie A** — méthode des mélanges : c_cu = [m₁c₀(θ₁−θf) − (m₀+μ₀)c₀(θf−θ₀)] / [m_cu(θf−θ₀)],
  Δc_cu = Σ |∂c_cu/∂xᵢ| Δxᵢ, comparaison aux tables (0,100 cal·g⁻¹·°C⁻¹).
- **Partie B** — coefficient de Joule : Wₑ = U·I·t, Q = (m₀+μ₀)c₀(θf−θ₀), J = Wₑ/Q ≈ 4,18 J/cal,
  incertitudes en composition quadratique ; les incertitudes analogiques sont commutables entre la
  formule de l'énoncé (classe × calibre²/100) et la forme normalisée (classe × calibre/100).
