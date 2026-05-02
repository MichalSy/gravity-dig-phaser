# 👨‍🚀 PLAYER MANAGEMENT — Profil, Run-State, Inventar & Perks

> Kanonische Architektur für alles, was Spielerfortschritt, Stats, Cargo, Upgrades, Perks und Savegames betrifft.

---

## 1. Ziel

Das Spiel trennt ab jetzt klar zwischen:

1. **PlayerProfile** — dauerhafter Fortschritt zwischen Runs
2. **RunState** — aktueller Planet-/Run-Zustand
3. **EffectivePlayerStats** — aus Profil, Upgrades und Perks berechnete Gameplay-Werte

Dadurch bleiben `GameScene` und spätere UI-/Schiffsmenüs dünn. Gameplay fragt nur noch nach berechneten Stats und mutiert den aktuellen Run-State.

---

## 2. Dateien

```text
src/player/
├── types.ts                    # zentrale Typen für Profile, Run, Items, Upgrades, Perks, Stats
├── PlayerProfile.ts            # Default-Profil
├── RunState.ts                 # Default-/Normalisierung für aktive Runs
├── inventory.ts                # Inventory-Helfer: add/remove/count/summary
├── stats.ts                    # computeEffectiveStats(profile)
├── saveGame.ts                 # localStorage Save/Load, Version v1
└── catalogs/
    ├── items.ts                # Ressourcen, Consumables, Artefakte
    ├── upgrades.ts             # datengetriebene Upgrade-Definitionen
    └── perks.ts                # passive Perk-/Artefakt-Effekte
```

---

## 3. PlayerProfile — dauerhaft

`PlayerProfile` wird im Savegame gespeichert und bleibt zwischen Runs erhalten.

Speichert:

- Credits
- permanentes Inventar/Lager
- Equipment-Auswahl
- gekaufte Upgrades
- freigeschaltete/equipte Perks
- freigeschaltete Planeten
- Lifetime-Stats

Beispiele:

```ts
type PlayerProfile = {
  version: 1;
  credits: number;
  inventory: InventoryState;
  equipment: EquipmentState;
  upgrades: UpgradeState;
  perks: PerkState;
  unlockedPlanets: string[];
  stats: LifetimeStats;
};
```

---

## 4. RunState — aktueller Run

`RunState` beschreibt den aktuellen Flug/Planetenlauf.

Speichert:

- Planet-ID
- Seed
- Health
- Energy
- Fuel
- Cargo
- temporäre Effekte
- später: Fog-of-War/discovered tiles

```ts
type RunState = {
  planetId: string;
  seed: string;
  health: number;
  energy: number;
  fuel: number;
  cargo: InventoryState;
  temporaryEffects: ActiveEffect[];
  discoveredTiles: string[];
};
```

**Wichtig:** `cargo` ist nicht dasselbe wie permanentes Inventar. Cargo ist der Loot des aktuellen Runs. Beim sicheren Zurückkehren zum Schiff wird Cargo verkauft oder ins Lager übertragen. Beim Tod kann Cargo ganz oder teilweise verloren gehen.

---

## 5. Inventar-Modell

Inventare sind generisch und werden für Lager, Cargo, Consumables und spätere Storage-Systeme genutzt.

```ts
type InventoryState = {
  capacity: number;
  items: Partial<Record<ItemId, number>>;
};
```

Aktuelle erste Items:

- Ressourcen: Erde, Sand, Lehm, Kies, Stein, Basalt, Kupfer, Eisen, Gold, Diamant
- Consumables: Energie-Zelle, Repair-Kit, Teleport-Armband

Die Hilfsfunktionen liegen in `src/player/inventory.ts`.

---

## 6. Upgrades & Perks

Upgrades und Perks sind datengetrieben. Sie bestehen aus Definitionen und generischen `StatModifier`s.

```ts
type StatModifier = {
  stat: PlayerStatKey;
  op: 'add' | 'multiply' | 'set';
  value: number;
};
```

Dadurch muss `GameScene` nicht wissen, welches Upgrade welche Werte ändert.

Beispiele:

```ts
{ stat: 'maxEnergy', op: 'set', value: 150 }
{ stat: 'miningRange', op: 'add', value: 96 }
{ stat: 'energyCostPerSec', op: 'multiply', value: 0.8 }
```

---

## 7. EffectivePlayerStats

`computeEffectiveStats(profile)` berechnet die aktuell wirksamen Gameplay-Werte:

- maxHealth
- maxEnergy
- energyRegenPerSec
- energyCostPerSec
- miningDamagePerSec
- miningRange
- moveSpeed
- jumpVelocity
- cargoCapacity
- sightRadius
- fuelEfficiency

Diese Werte ersetzen schrittweise direkte Konstanten im Gameplay.

Aktuell angeschlossen:

- Mining-Reichweite
- Mining-Schaden
- Energieverbrauch
- Energie-Regeneration
- Bewegungsgeschwindigkeit
- Sprungstärke
- Health/Energy-HUD
- Run-Cargo statt lokaler Scene-Map

---

## 8. Savegame

Persistence läuft vorerst lokal:

```text
localStorage['gravity-dig-save-v1']
```

Schema:

```ts
type SaveGame = {
  version: 1;
  profile: PlayerProfile;
  activeRun?: RunState;
};
```

Das Savegame ist versioniert. Künftige Schema-Änderungen sollen über Migrationen laufen.

Aktueller Stand:

- Profil wird geladen/erstellt.
- Aktiver Run wird gespeichert.
- Cargo, Energy, Health und Lifetime-Mining-Stats werden persistent gehalten.
- Vollständige Weltmutation-Persistenz ist noch offen; aktuell kann ein geladener Run State-Werte behalten, aber Tile-Zerstörung wird aus dem Seed neu generiert.

---

## 9. Nächste Schritte

1. **Schiff-Management UI**
   - Cargo verkaufen
   - Cargo ins Lager übertragen
   - Credits anzeigen

2. **Upgrade-Shop**
   - Upgrades kaufen
   - prerequisites prüfen
   - Stats sofort neu berechnen

3. **Consumables**
   - Energie-Zelle
   - Repair-Kit
   - Teleport-Armband

4. **Perks/Artefakte**
   - equip/unequip
   - passive Effekte
   - Phoenix-Feder / Glücks-Amulett / Magnet-Kern

5. **Run-Abschlussregeln**
   - Rückkehr zum Schiff
   - Tod
   - Cargo-Verlust
   - Lifetime-Stats sauber abschließen

6. **Welt-Persistenz**
   - abgebaute Tiles speichern
   - Fog-of-War/discovered tiles speichern
   - später Chunk-basierte Persistenz

---

*Letzte Aktualisierung: 2026-05-02*
