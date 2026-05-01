# 🗺️ LEVEL DESIGN — Gravity Dig

> Level-Struktur, Raumschiff-Position, Core-Platzierung und Grenzen

---

## 1. Level-Grundstruktur

### 1.1 Dimensionen

| Parameter | Wert | Beschreibung |
|-----------|------|--------------|
| **Breite** | 600 Blöcke | -10 bis +600 (links nach rechts) |
| **Höhe** | 600 Blöcke | -300 bis +300 (unten nach oben) |
| **Gesamtfläche** | 360.000 Blöcke | Maximal mögliche Blocks |
| **Blockgröße** | 48×48 Pixel | Godot-Tile-Size |

### 1.2 Koordinatensystem

```
                    ↑ +300 (Oben)
                    │
                    │
    -10 ────────────┼──────────────── +600 (Rechts)
      ↑             │                  ↑
   Links            │               Rechts
   (Raumschiff)     │              (Core)
                    │
                    ↓ -300 (Unten)
                    
    (0, 0) = Startpunkt (Spieler)
```

---

## 2. Raumschiff ("The Bucket")

### 2.1 Position & Ausrichtung

```
         ═══════════════════  BEDROCK (y = +2)
         ║
         ║    ← FRONT (nach links)
    ▓▓▓▓▓▓▓▓▓  
    ▓▓▓▓▓▓▓▓▓  Raumschiff (4 Blöcke hoch)
    ▓▓▓▓▓▓▓▓▓  "hat sich rückwärts reingebohrt"
    ▓▓▓▓▓▓▓▓▓
         ║
    ═════╩═══════════════════  Landefüße (y = 0)
         ║
         ║   👤 SPIELER (0, 0)
         ║
         ║   3 Blöcke frei
         ║
    ══════════════════════════  BEDROCK (y = -2)

    x:  -4  -3  -2  -1   0   +1  +2
         └──┬──┘       ↑
       Raumschiff   Spieler
```

### 2.2 Raumschiff-Koordinaten

| Teil | X-Bereich | Y-Bereich | Größe |
|------|-----------|-----------|-------|
| **Rumpf** | -4 bis -1 | -4 bis -1 | 4×4 Blöcke |
| **Front** | x = -4 | -4 bis -1 | Links |
| **Heck** | x = -1 | -4 bis -1 | Rechts (zum Spieler) |
| **Landefüße** | -4 bis -1 | y = 0 | Bodenebene |

### 2.3 Startbereich

| Parameter | Wert |
|-----------|------|
| **Spieler-Start** | (0, 0) |
| **Freier Bereich** | x: 0 bis +2, y: -1 bis +1 |
| **Breite** | 3 Blöcke |
| **Höhe** | 3 Blöcke |

---

## 3. Core-Platzierung

### 3.1 Grundregeln

- Core ist **immer rechts** vom Startpunkt
- Core-Minimaldistanz hängt von **Planetenschwierigkeit** ab
- Core-Y-Position ist **randomisiert** (oben/mittig/unten)

### 3.2 Core-Position nach Schwierigkeit

| Schwierigkeit | Core-X | Core-Y | Distanz | Planeten |
|---------------|--------|--------|---------|----------|
| **Einfach** | +500 bis +580 | -100 bis +100 | ~500-580 | Terra-Prime, Moon-4 |
| **Mittel** | +350 bis +450 | -150 bis +150 | ~350-450 | Gravitas-9, Float-7 |
| **Schwer** | +250 bis +350 | -200 bis +200 | ~250-350 | Invertia, Pulse-Core |
| **Extrem** | +150 bis +250 | -250 bis +250 | ~150-250 | Chaos-Ring, The Core |

### 3.3 Core-Radius

| Parameter | Wert |
|-----------|------|
| **Core-Radius** | 10-20 Blöcke |
| **Tödliche Zone** | Bei Berührung = Sofort-Tod |
| **Sichtbar** | Abhängig von Detector-Upgrade |

---

## 4. Grenzen (Bedrock)

### 4.1 Unzerstörbare Bereiche

| Seite | Position | Dicke | Grund |
|-------|----------|-------|-------|
| **Oben** | y = +300 bis +301 | 1-2 Blöcke | Level-Grenze |
| **Unten** | y = -300 bis -301 | 1-2 Blöcke | Level-Grenze |
| **Links** | x = -10 bis -9 | 1-2 Blöcke | Schiff-Schutz |
| **Rechts** | x = +600 bis +601 | 1-2 Blöcke | Core-Grenze |

### 4.2 Raumschiff-Schutz

| Bereich | Position | Dicke | Grund |
|---------|----------|-------|-------|
| **Über Schiff** | y = +1 bis +2 | 1-2 Blöcke | Schutz |
| **Unter Schiff** | y = -1 bis -2 | 1-2 Blöcke | Fundament |

---

## 5. Block-Füllung

### 5.1 Gefüllte Bereiche

| Bereich | Status | Block-Typ |
|---------|--------|-----------|
| **Startbereich** | LEER | — (x: 0 bis +2) |
| **Unter Raumschiff** | GEFÜLLT | Bedrock |
| **Rest des Levels** | GEFÜLLT | Je nach Distanz zum Core |

### 5.2 Leere Bereiche

| Bereich | Größe | Grund |
|---------|-------|-------|
| **Startbereich** | 3×3 Blöcke | Spieler-Platz |
| **Höhlen** | Prozedural | Exploration |

---

## 6. Konfigurierbare Parameter

### 6.1 Level-Generation-Config

```json
{
  "level": {
    "width": 600,
    "height": 600,
    "block_size": 48,
    "start_position": [0, 0]
  },
  "spaceship": {
    "x_range": [-4, -1],
    "y_range": [-4, -1],
    "facing": "left",
    "landing_gear_y": 0
  },
  "core": {
    "min_distance": 500,
    "max_distance": 580,
    "y_variance": [-100, 100],
    "radius": 15
  },
  "boundaries": {
    "top_bedrock_y": 300,
    "bottom_bedrock_y": -300,
    "left_bedrock_x": -10,
    "right_bedrock_x": 600,
    "ship_protection_y_top": 2,
    "ship_protection_y_bottom": -2
  }
}
```

---

## 7. Visuelle Darstellung

### 7.1 Gesamtübersicht

```
    ╔══════════════════════════════════════════════════════════════╗
    ║ BEDROCK (y = +300)                                           ║
    ╠══════════════════════════════════════════════════════════════╣
    ║                                                              ║
    ║                                                    ┌─────┐  ║
    ║                                                    │CORE │  ║
    ║                                                    │     │  ║
    ║                                                    └─────┘  ║
    ║                                                              ║
    ║                                                              ║
    ║                                                              ║
    ║                                                              ║
BED ║   [RAUMSCHIFF]  👤                                          ║ BED
    ║    ← links      (0,0)                                       ║
    ║                ───→                                         ║
    ║                                                              ║
    ║                                                              ║
    ║                                                              ║
    ╠══════════════════════════════════════════════════════════════╣
    ║ BEDROCK (y = -300)                                           ║
    ╚══════════════════════════════════════════════════════════════╝
    
    x=-10         x=0                              x=+600
```

---

*Letzte Aktualisierung: 2026-02-23*
