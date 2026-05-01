# 💎 RESOURCE SPAWN — Gravity Dig

> Rohstoff-Verteilung basierend auf Core-Distanz und Planeten-Typ

---

## 1. Spawn-System Übersicht

### 1.1 Core-Distanz-basierte Zonen

```
                    CORE
                      ●
                      │
        ┌─────────────┼─────────────┐
        │   ZONE 1    │   0-100m    │  ← Extrem selten
        ├─────────────┼─────────────┤
        │   ZONE 2    │  100-200m   │  ← Selten
        ├─────────────┼─────────────┤
        │   ZONE 3    │  200-300m   │  ← Mittel
        ├─────────────┼─────────────┤
        │   ZONE 4    │  300-400m   │  ← Häufig
        ├─────────────┼─────────────┤
        │   ZONE 5    │   400m+     │  ← Standard
        └─────────────┼─────────────┘
                      │
                   (0,0)
                STARTPUNKT
```

### 1.2 Zonen-Definition

| Zone | Distanz | Seltenheit | Haupt-Rohstoffe |
|------|---------|------------|-----------------|
| **Zone 1** | 0-100m | Extrem | Void, Quantum, Sternenstaub |
| **Zone 2** | 100-200m | Selten | Obsidian, Platin, Diamant |
| **Zone 3** | 200-300m | Mittel | Gold, Silber, Edelsteine |
| **Zone 4** | 300-400m | Häufig | Eisen, Kupfer, Stein |
| **Zone 5** | 400m+ | Standard | Erde, Sand, Kies |

---

## 2. Rohstoff-Kategorien

### 2.1 Kategorie: Basis (Weich)

| Block | Härte | Spawn-Zonen | Drop-Wert |
|-------|-------|-------------|-----------|
| Erde | 1 Hit | Zone 5 (80%) | — |
| Sand | 1 Hit | Zone 5 (15%) | Sand |
| Kies | 2 Hits | Zone 4-5 (10%) | Kies |
| Lehm | 2 Hits | Zone 4-5 (5%) | Lehm |

### 2.2 Kategorie: Gestein (Normal)

| Block | Härte | Spawn-Zonen | Drop-Wert |
|-------|-------|-------------|-----------|
| Stein | 3 Hits | Alle (20-40%) | Stein |
| Granit | 5 Hits | Zone 3-4 (10%) | Granit |
| Marmor | 4 Hits | Zone 3-4 (8%) | Marmor |
| Schiefer | 4 Hits | Zone 3-4 (6%) | Schiefer |
| Basalt | 6 Hits | Zone 2-3 (5%) | Basalt |

### 2.3 Kategorie: Metalle

| Block | Härte | Spawn-Zonen | Wert |
|-------|-------|-------------|------|
| Eisen-Ader | 5 Hits | Zone 4-5 (8%) | 5 Cr |
| Kupfer-Ader | 4 Hits | Zone 4-5 (6%) | 3 Cr |
| Silber-Ader | 6 Hits | Zone 3-4 (4%) | 15 Cr |
| Gold-Ader | 5 Hits | Zone 3 (3%) | 25 Cr |
| Platin-Ader | 8 Hits | Zone 2 (2%) | 50 Cr |
| Metall-Ader | 8 Hits | Zone 3-4 (5%) | 10 Cr |

### 2.4 Kategorie: Edelsteine

| Block | Härte | Spawn-Zonen | Wert |
|-------|-------|-------------|------|
| Rubin | 4 Hits | Zone 3 (2%) | 30 Cr |
| Saphir | 4 Hits | Zone 3 (2%) | 30 Cr |
| Smaragd | 4 Hits | Zone 2-3 (1.5%) | 35 Cr |
| Diamant | 6 Hits | Zone 2 (1%) | 100 Cr |

### 2.5 Kategorie: Magisch

| Block | Härte | Spawn-Zonen | Effekt |
|-------|-------|-------------|--------|
| Mondstein | 3 Hits | Zone 4-5 (3%) | Leuchtet |
| Sonnenstein | 4 Hits | Zone 3-4 (2%) | +5 Energie |
| Seelenstein | 5 Hits | Zone 3 (2%) | Heilt 10 HP |
| Schatten-Erz | 7 Hits | Zone 2-3 (1%) | Dunkelheit |
| Licht-Kristall | 3 Hits | Zone 3-4 (2%) | +Sicht |
| Echo-Stein | 6 Hits | Zone 2-3 (1%) | Zeigt Kisten |
| Zeit-Sand | 2 Hits | Zone 3 (1.5%) | -50% Cooldown |

### 2.6 Kategorie: Exotisch

| Block | Härte | Spawn-Zonen | Wert |
|-------|-------|-------------|------|
| Meteorit | 12 Hits | Zone 2 (0.5%) | 80 Cr |
| Obsidian | 15 Hits | Zone 2 (1%) | 20 Cr |
| Prisma-Stein | 8 Hits | Zone 2 (0.3%) | 70 Cr |
| Lebendes Gestein | 10 Hits | Zone 2 (0.3%) | 90 Cr |
| Spiegel-Block | 5 Hits | Zone 3 (1%) | 15 Cr |
| Eis-Kristall | 4 Hits | Zone 3 (1.5%) | 25 Cr |
| Magma-Block | 8 Hits | Zone 2 (1%) | 30 Cr |

### 2.7 Kategorie: Core-Nähe (Extrem selten)

| Block | Härte | Spawn-Zonen | Wert |
|-------|-------|-------------|------|
| Quantum-Stein | 12 Hits | Zone 1 (2%) | 150 Cr |
| Void-Fragment | 20 Hits | Zone 1 (0.5%) | 500 Cr |
| Sternen-Staub | 6 Hits | Zone 1 (1%) | 200 Cr |
| Anti-Materie | 10 Hits | Zone 1-2 (0.8%) | 300 Cr |

### 2.8 Kategorie: Nutzbar

| Block | Härte | Spawn-Zonen | Verwendung |
|-------|-------|-------------|------------|
| Energie-Kristall | 3 Hits | Alle (3%) | Treibstoff (+5) |

### 2.9 Kategorie: Gefährlich

| Block | Härte | Spawn-Zonen | Effekt |
|-------|-------|-------------|--------|
| Spreng-Stein | 3 Hits | Zone 3-4 (2%) | Explodiert |

### 2.10 Kategorie: Unzerstörbar

| Block | Härte | Spawn-Position |
|-------|-------|----------------|
| Bedrock | ∞ | Grenzen, Raumschiff-Schutz |

---

## 3. Spawn-Wahrscheinlichkeiten pro Zone

### 3.1 Zone 1: Core-Nähe (0-100m)

```
30%  Void-Fragment (0.5%)
30%  Quantum-Stein (2%)
20%  Sternen-Staub (1%)
10%  Anti-Materie (0.8%)
5%   Obsidian (1%)
3%   Magma-Block (1%)
2%   Bedrock (Grenzen)
```

### 3.2 Zone 2: Tiefe (100-200m)

```
25%  Obsidian (1%)
20%  Platin-Ader (2%)
15%  Diamant (1%)
15%  Basalt (5%)
10%  Exotische Blöcke (0.5-1%)
10%  Magische (1-2%)
5%   Edelsteine (1-2%)
```

### 3.3 Zone 3: Mittlere Tiefe (200-300m)

```
30%  Stein (20%)
20%  Granit/Marmor/Schiefer (6-10%)
15%  Metalle (3-5%)
15%  Edelsteine (1.5-2%)
10%  Magische (1.5-2%)
5%   Eis/Spiegel (1-1.5%)
5%   Basis (Erde, Sand)
```

### 3.4 Zone 4: Flach-Mittel (300-400m)

```
40%  Stein (30%)
25%  Eisen/Kupfer (6-8%)
20%  Granit (10%)
10%  Magische (2-3%)
5%   Basis (Erde, Kies, Lehm)
```

### 3.5 Zone 5: Oberfläche (400m+)

```
50%  Erde (40%)
20%  Sand (15%)
15%  Kies (10%)
10%  Lehm (5%)
5%   Stein (20%)
```

---

## 4. Konfiguration pro Planet

### 4.1 Planeten-Typen

| Typ | Core-Distanz | Rohstoff-Fokus | Besonderheit |
|-----|--------------|----------------|--------------|
| **Standard** | 500m | Alle | Balance |
| **Metallreich** | 450m | Eisen, Kupfer, Gold | +50% Metall |
| **Kristall** | 400m | Edelsteine | +100% Edelsteine |
| **Vulkanisch** | 350m | Magma, Obsidian | Kein Eis |
| **Magisch** | 380m | Magische Blöcke | +100% Magisch |
| **Exotisch** | 300m | Exotische Blöcke | +50% Exotisch |
| **Core-Nah** | 200m | Void, Quantum | Extreme Gefahr |

### 4.2 Konfigurations-Beispiel

```json
{
  "planet_type": "metallreich",
  "core_distance": 450,
  "resource_modifiers": {
    "iron": 1.5,
    "copper": 1.5,
    "gold": 1.5,
    "gems": 0.5,
    "magic": 0.5
  },
  "excluded_blocks": [],
  "special_blocks": ["meteorit"]
}
```

---

## 5. Konfigurierbare Parameter

### 5.1 Resource-Spawn-Config

```json
{
  "spawn_system": {
    "zones": [
      {"name": "zone_1", "min_distance": 0, "max_distance": 100},
      {"name": "zone_2", "min_distance": 100, "max_distance": 200},
      {"name": "zone_3", "min_distance": 200, "max_distance": 300},
      {"name": "zone_4", "min_distance": 300, "max_distance": 400},
      {"name": "zone_5", "min_distance": 400, "max_distance": 9999}
    ],
    "blocks": {
      "dirt": {"zones": ["zone_5"], "chance": 0.40, "hardness": 1},
      "sand": {"zones": ["zone_5"], "chance": 0.15, "hardness": 1},
      "iron": {"zones": ["zone_4", "zone_5"], "chance": 0.08, "hardness": 5},
      "void_fragment": {"zones": ["zone_1"], "chance": 0.005, "hardness": 20}
    }
  }
}
```

---

## 6. Debug-Modus

### 6.1 Visualisierung

| Debug-Feature | Beschreibung |
|---------------|--------------|
| **Zonen-Grenzen** | Zeigt Zonen-Farben |
| **Spawn-Chancen** | Zeigt % pro Block |
| **Core-Distanz** | Zeigt Distanz-Werte |
| **Ressourcen-Map** | Zeigt alle Rohstoffe |

### 6.2 Debug-Config

```json
{
  "debug": {
    "show_zones": true,
    "show_spawn_chances": true,
    "show_core_distance": true,
    "highlight_resources": ["void_fragment", "quantum"]
  }
}
```

---

*Letzte Aktualisierung: 2026-02-23*
