# 🌍 GRAVITY DIG — Spiel-Inhalte Übersicht

> Dieses Dokument gibt einen globalen Überblick über alle Spiel-Inhalte und verlinkt zu den Detail-Dokumenten.

---

## 📁 Dokumenten-Struktur

| Datei | Inhalt | Status |
|-------|--------|--------|
| [GAME_DESIGN.md](GAME_DESIGN.md) | Hauptdesign, Vision, Core-Mechaniken | ✅ |
| [ITEMS.md](ITEMS.md) | Alle Items (Werkzeuge, Verbrauchsgüter, Artefakte) | ✅ |
| [BLOCKS.md](BLOCKS.md) | Alle Blocktypen (20+ mit Magie) | ✅ |
| [UPGRADES.md](UPGRADES.md) | Alle Upgrades (Schiff, Anzug, Equipment) | ✅ |
| [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md) | Profil, Run-State, Inventar, Perks, Savegame | ✅ |
| [ASSETS.md](ASSETS.md) | Grafik-Checkliste für alle Sprites | 🔄 |
| [PLANETS.md](PLANETS.md) | Alle Planeten mit Eigenschaften | 🔄 |

---

## 📊 Inhalts-Statistik

| Kategorie | Anzahl | Dokument |
|-----------|--------|----------|
| **Blöcke** | 30+ | [BLOCKS.md](BLOCKS.md) |
| **Items** | 40+ | [ITEMS.md](ITEMS.md) |
| **Upgrades** | 25+ | [UPGRADES.md](UPGRADES.md) |
| **Planeten** | 8 | [PLANETS.md](PLANETS.md) |
| **Artefakte** | 5 | [ITEMS.md](ITEMS.md) |
| **Schiff-Upgrades** | 7 | [UPGRADES.md](UPGRADES.md) |
| **Player-State-System** | 1 | [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md) |

---

## 🎮 Core-Gameplay-Loop

```
Schiff → Planet wählen → Graben → Ressourcen sammeln → Zurück zum Schiff
    ↑                                                              ↓
    └────── Verkaufen ──── Upgrades kaufen ──── Craften ───────────┘
```

### Die 3 Säulen

1. **Exploration** (Fog of War, neues entdecken)
2. **Ressourcen-Management** (Energie, Treibstoff, Gier vs. Vernunft)
3. **Progression** (Upgrades, bessere Ausrüstung, tiefer graben)

### Technischer Progression-Stand

Der Phaser-Port besitzt jetzt eine zentrale Player-State-Schicht: `PlayerProfile` für dauerhaften Fortschritt, `RunState` für den aktuellen Run und datengetriebene Kataloge für Items, Upgrades und Perks. Details: [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md).

---

## 🎨 Asset-Übersicht (Grafiken)

### Sprites benötigt: ~100+

| Kategorie | Anzahl | Status | Checkliste |
|-----------|--------|--------|------------|
| Blöcke | 30+ | 🔄 | [ASSETS.md#blocks](ASSETS.md) |
| Items | 40+ | 🔄 | [ASSETS.md#items](ASSETS.md) |
| UI-Elemente | 20+ | 🔄 | [ASSETS.md#ui](ASSETS.md) |
| Charakter | 10+ | 🔄 | [ASSETS.md#character](ASSETS.md) |
| Schiff | 7+ | 🔄 | [ASSETS.md#ship](ASSETS.md) |
| Effekte | 15+ | 🔄 | [ASSETS.md#effects](ASSETS.md) |
| Planeten | 8 | 🔄 | [ASSETS.md#planets](ASSETS.md) |

**Legende:**
- ✅ = Fertig
- 🔄 = In Arbeit / Geplant
- ⏳ = Noch nicht begonnen

---

## 🔑 Kern-Konzepte

### 1. Gier-Mechanik
Der Spieler muss entscheiden:
- **Weitergraben** für mehr Loot (Riskant!)
- **Zurückkehren** um Gewinne zu sichern (Sicher!)

### 2. "Zu-Tief"-Gefahr
- Ohne Leitern/Jump-Items kann man gefangen sein
- Energie-Leer = Tod
- Planung ist essenziell!

### 3. Core-Anziehung
- Je näher am Planeten-Core, desto wertvoller
- Aber: Stärkere Anziehung, mehr Gefahr
- Magnet-Stiefel nötig für tiefe Bereiche

### 4. Fog of War
- Nur begrenzte Sichtweite
- Nie wissen was kommt
- Exploration ist riskant aber lohnenswert

---

## 📋 Nächste Schritte

- [ ] Alle Dokumente finalisieren
- [ ] Grafik-Checkliste in ASSETS.md erstellen
- [ ] Erste Prototypen starten
- [ ] Block-Sprites priorisieren (Basics zuerst)

---

*Letzte Aktualisierung: 2026-05-02*
