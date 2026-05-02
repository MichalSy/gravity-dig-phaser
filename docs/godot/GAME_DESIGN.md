# 🌍 GRAVITY DIG — Game Design Document

> *One ship. Infinite planets. Get rich or die trying.*

📋 **Dokumentation:** [Übersicht](OVERVIEW.md) | [Items](ITEMS.md) | [Blöcke](BLOCKS.md) | [Upgrades](UPGRADES.md) | [Player Management](PLAYER_MANAGEMENT.md) | [Planeten](PLANETS.md) | [Assets](ASSETS.md)

---

## 1. Die Story: Von Schrott zu Reichtum

Du bist **"Rusty"**, ein Weltraum-Prospector mit einem rostigen Schiff **"The Bucket"**. Dein Ziel: Reich werden durch Buddeln auf fremden Planeten!

**Das Schiff** ist dein Zuhause, Werkstatt und Laden. Mit jedem Run wird es weniger klapprig.

---

## 2. Core Gameplay

### Das Grundkonzept
1. Schiff bohrt in Planeten → Start in Kammer
2. Frei buddeln in alle Richtungen (außer links hinter Schiff)
3. Ressourcen sammeln
4. **Rechtzeitig zurück zum Schiff!**
5. Verkaufen → Upgrades kaufen → Tiefer graben

### Die 3 Säulen

🎲 **Exploration** — Fog of War, nie wissen was kommt  
⚡ **Ressourcen-Management** — Energie, Treibstoff, Gier vs. Vernunft  
📈 **Progression** — Upgrades, tiefer graben, reicher werden

---

## 3. Kern-Mechaniken

### 🔫 Laser-System
- Start: 1 Block Reichweite
- Upgradeable bis 4 Blöcke
- Details: [ITEMS.md](ITEMS.md)

### 🌫️ Fog of War
- Nur 3 Blöcke Sicht (Start)
- Upgradeable bis 7 Blöcke
- Blind graben = Risiko!

### 🔋 Raumanzug-Energie
- Jede Aktion kostet Energie
- Batterie leer = Tod!
- Upgradeable bis 700 Energie
- Technisch läuft Energie jetzt über `RunState.energy` und `EffectivePlayerStats.maxEnergy/energyCostPerSec/energyRegenPerSec`.

### 🥾 Magnet-Stiefel
- Core zieht dich an
- Stiefel = Überleben in der Tiefe
- Details: [UPGRADES.md](UPGRADES.md)

### 🪜 Leitern-System
- Platzierbare Leitern für Rückweg
- Ohne Leitern = Gefahr!
- Crafting: [ITEMS.md](ITEMS.md)

### 🧭 Core-Navigation
- Core ist zufällig platziert
- Ohne Detector = Blind graben
- Mit Mapper = Perfekte Navigation

---

## 4. Die Gefahren

### ☠️ Tod durch...
1. **Energie = 0** → Anzug fällt aus → HP-Verlust
2. **Zu tief buddeln** → Kein Rückweg → Gefangen
3. **Core-Berührung** → Sofort-Tod
4. **Kein Teleport** → Gestrandet

### ⚠️ "Zu-Tief"-Szenario
```
1. Gierig nach unten graben
2. "Oh, das ist tiefer als gedacht..."
3. Wände zu hoch zum Springen
4. Keine Leitern, kein Jump-Item
5. GEFANGEN!
6. Nur Teleport-Armband rettet dich
```

---

## 5. Inhalte

### Blöcke (37 Stück)
- 4 Basis (Erde, Sand...)
- 5 Gesteine (Stein, Granit...)
- 6 Metalle (Eisen, Gold, Platin...)
- 4 Edelsteine (Rubin, Diamant...)
- 7 Magische (Mondstein, Seelenstein...)
- 7 Exotische (Quantum, Void...)
- 4 Spezial (Spreng-Stein, Bedrock)

**Details:** [BLOCKS.md](BLOCKS.md)

### Player Management
- Dauerhafter Fortschritt: `PlayerProfile`
- Aktueller Run: `RunState`
- Cargo getrennt vom permanenten Lager
- Start-Cargo bewusst eng: 1 Slot, Stacklimit 3
- Upgrades/Perks berechnen `EffectivePlayerStats`
- Savegame: `localStorage['gravity-dig-save-v1']`

**Details:** [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md)

### Items (40+)
- 8 Laser-Varianten
- 5 Sicht-Stufen
- 4 Jump-Items
- 20+ Ressourcen
- 5 Artefakte

**Details:** [ITEMS.md](ITEMS.md)

### Upgrades (25+)
- Schiff-Upgrades (Triebwerke, Laderaum...)
- Anzug-Upgrades (Laser, Batterie, Stiefel...)

**Details:** [UPGRADES.md](UPGRADES.md)

### Planeten (8 Stück)
| Planet | Gravitation | Besonderheit |
|--------|-------------|--------------|
| Terra-Prime | Normal | Tutorial |
| Moon-4 | Leicht | Hohe Sprünge |
| Gravitas-9 | Schwer | Mehr Schaden |
| Float-7 | Schwerelos | Inertia |
| Invertia | Invertiert | Decke = Boden |
| Pulse-Core | Pulsierend | Timing |
| Chaos-Ring | Chaos | Unvorhersehbar |
| The Core | Extrem | Boss-Planet |

**Details:** [PLANETS.md](PLANETS.md)

---

## 6. Das Gier-Prinzip

**Das Herz des Spiels:**
```
WEITERGRABEN vs. ZURÜCKKEHREN
     ↓                ↓
Mehr Loot!        Sicherheit!
Aber Risiko!      Aber weniger!
```

**Perfekter Run:**
- Batterie bei 15%
- Inventar voll
- Teleport als Backup
- **Timing ist alles!**

---

## 7. Asset-Checkliste

**Benötigte Grafiken: ~150**
- 37 Blöcke
- 40+ Items
- 25 UI-Elemente
- 12 Charakter-Animationen
- 7 Schiff-Stufen
- 20+ Effekte
- 8 Planeten

**Details:** [ASSETS.md](ASSETS.md)

---

## 8. Nächste Schritte

- [ ] Alle Dokumente finalisieren
- [ ] Grafiken priorisieren (MVP zuerst)
- [ ] Godot-Prototyp starten
- [ ] Basis-Mechaniken testen

---

*"Plan your escape before you dig."*

📁 **Alle Details:** Siehe verlinkte Dokumente oben!
