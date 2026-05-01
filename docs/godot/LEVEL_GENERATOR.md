# 🎮 LEVEL GENERATOR — Gravity Dig

> Konzept für prozedurale Level-Generierung basierend auf Planeten-Config + Schwierigkeit

---

## 1. Level Generator Architektur

### 1.1 Haupt-Komponenten

```
LevelGenerator
├── ConfigLoader (lädt Planet + Difficulty)
├── DifficultyScaler (berechnet Parameter)
├── CorePlacement (positioniert Core)
├── SpaceshipPlacement (positioniert Raumschiff)
├── TerrainGenerator (generiert Gelände)
├── ResourceSpawner (platziert Rohstoffe)
├── BoundaryGenerator (erstellt Grenzen)
└── PostProcessor (Finalisierung)
```

### 1.2 Generator-Fluss

```
1. Input: Planeten-Name + Schwierigkeits-Level (1-10)
   └── z.B. "terra_prime", difficulty=8

2. Planeten-Base-Config laden
   └── docs/planets/terra_prime.json

3. Difficulty-Scaler anwenden
   └── Parameter = Base * Difficulty-Multiplikator

4. Ranges auflösen
   └── "50-80" → Random zwischen 50 und 80

5. Level generieren
   └── Alle Komponenten mit finalen Werten

6. Speichern/Instanziieren
   └── Godot TileMap oder Node-Struktur
```

---

## 2. Konfigurations-Format

### 2.1 Planeten-Config (JSON)

```json
{
  "planet": {
    "id": "terra_prime",
    "name": "Terra-Prime",
    "description": "Der perfekte Startpunkt",
    
    "base_config": {
      "core_distance": {
        "min": 500,
        "max": 580
      },
      "core_y_range": [-100, 100],
      "core_radius": 15
    },
    
    "difficulty_scaling": {
      "core_distance": {
        "mode": "decrease",
        "min": 150,
        "max": 580,
        "formula": "linear"
      },
      "resource_richness": {
        "mode": "decrease", 
        "min": 0.5,
        "max": 1.5,
        "formula": "linear"
      },
      "hazard_multiplier": {
        "mode": "increase",
        "min": 0.3,
        "max": 3.0,
        "formula": "exponential"
      },
      "loot_multiplier": {
        "mode": "increase",
        "min": 0.5,
        "max": 3.0,
        "formula": "linear"
      }
    },
    
    "resources": {
      "common": ["dirt", "stone", "iron"],
      "uncommon": ["copper", "silver"],
      "rare": ["gold", "ruby"],
      "legendary": ["diamond"]
    },
    
    "excluded_blocks": ["void_fragment", "quantum_stone"],
    
    "special_features": {
      "gravity_type": "normal",
      "cave_density": "0.2-0.4",
      "crystal_formations": false,
      "lava_pockets": false
    }
  }
}
```

### 2.2 Range-Format (flexibel)

| Format | Beispiel | Bedeutung |
|--------|----------|-----------|
| **Fixed** | `50` | Genau 50 |
| **Range** | `"50-80"` | Random zwischen 50 und 80 |
| **Float Range** | `"0.5-1.5"` | Random zwischen 0.5 und 1.5 |
| **Array** | `[10, 20, 30]` | Einer dieser Werte |

**Anwendung:**
```json
{
  "cave_density": "0.2-0.4",
  "core_radius": "10-20",
  "loot_multiplier": 2.0
}
```

---

## 3. Difficulty-Scaler

### 3.1 Formeln

**Linear (gleichmäßig):**
```
value = min + (max - min) * ((difficulty - 1) / 9)
```

**Exponential (steiler bei höheren Levels):**
```
value = min + (max - min) * pow((difficulty - 1) / 9, 2)
```

**Logarithmisch (flacher bei höheren Levels):**
```
value = min + (max - min) * log(difficulty) / log(10)
```

### 3.2 Beispiel: Terra-Prime

| Difficulty | Core-Distanz | Resources | Gefahren | Loot |
|------------|--------------|-----------|----------|------|
| 1 | 580m | 150% | 0.3x | 50% |
| 3 | 478m | 130% | 0.6x | 83% |
| 5 | 376m | 100% | 1.0x | 117% |
| 8 | 242m | 70% | 1.9x | 172% |
| 10 | 150m | 50% | 3.0x | 200% |

### 3.3 Schwierigkeits-Stufen

| Level | Name | Beschreibung |
|-------|------|--------------|
| 1-2 | Leicht | Tutorial, entspannt |
| 3-4 | Mittel | Standard-Challenge |
| 5-6 | Schwer | Für erfahrene Spieler |
| 7-8 | Extrem | Hardcore-Modus |
| 9-10 | Insane | Nur für Experten |

---

## 4. API-Interface

### 4.1 Generator-Aufruf

```gdscript
# Einfacher Aufruf
var generator = LevelGenerator.new()
var level = generator.generate("terra_prime", 8)

# Mit Callbacks
var config = {
    "planet_id": "moon_4",
    "difficulty": 5,
    "seed": 12345  # Optional für reproduzierbare Level
}
generator.generate_async(config)
generator.connect("progress_changed", self, "_on_progress")
generator.connect("completed", self, "_on_level_ready")
```

### 4.2 Rückgabe-Werte

```gdscript
{
    "tiles": TileMap,           # Alle Blöcke
    "core_position": Vector2,   # Core-Koordinaten
    "spaceship_rect": Rect2,    # Schiff-Bereich
    "spawn_point": Vector2,     # (0, 0)
    "resource_count": Dictionary, # {"iron": 150, ...}
    "seed_used": 12345          # Für Reproduktion
}
```

---

## 5. Konfigurierbare Parameter

### 5.1 Basis (immer vorhanden)

| Parameter | Typ | Schwierigkeits-Einfluss |
|-----------|-----|------------------------|
| `core_distance` | Range | ↓ Abnehmend |
| `resource_richness` | Range | ↓ Abnehmend |
| `hazard_multiplier` | Range | ↑ Zunehmend |
| `loot_multiplier` | Range | ↑ Zunehmend |
| `cave_density` | Range | ↑ Zunehmend |

### 5.2 Optional (pro Planet)

| Parameter | Typ | Effekt |
|-----------|-----|--------|
| `crystal_formations` | Bool | Kristall-Höhlen |
| `lava_pockets` | Bool | Lava-Taschen |
| `ice_caves` | Bool | Eis-Höhlen |
| `ancient_ruins` | Bool | Alte Ruinen |
| `meteor_craters` | Bool | Meteoriten-Krater |

### 5.3 Atmosphäre (Visuals)

| Parameter | Typ | Beispiel-Werte |
|-----------|-----|----------------|
| `background_tint` | Color | `#1a1a2e`, `#0f3460` |
| `fog_density` | Range | `0.0-0.5` |
| `particle_effects` | Array | `["dust", "sparks"]` |
| `lighting_ambient` | Range | `0.3-0.8` |

---

## 6. Level-Editor Integration

### 6.1 In-Game Konfiguration

```
[LEVEL ERSTELLEN]

Planet:      [Terra-Prime ▼]
             [Moon-4     ]
             [Gravitas-9 ]

Schwierigkeit: [1]──●────[10]
              Leicht   Extrem

Seed: [12345] 🎲 (Random)

[Vorschau]  [Generieren]  [Spielen]
```

### 6.2 Debug-Info

```
Generierte Parameter:
- Core-Distanz: 342m (Range: 150-580)
- Ressourcen: 85% (Range: 50-150%)
- Gefahren: 1.4x (Range: 0.3-3.0x)
- Loot: 133% (Range: 50-200%)
- Höhlen-Dichte: 0.35 (Range: 0.2-0.5)
```

---

## 7. Zusammenfassung

### 7.1 Input (MVP)

```json
{
  "planet_id": "terra_prime",
  "difficulty": 5,
  "seed": 12345  // Optional
}
```

### 7.2 Processing

1. Planeten-Base-Config laden
2. Difficulty-Scaler anwenden
3. Ranges in konkrete Werte umwandeln
4. Level prozedural generieren

### 7.3 Output

- Vollständiges Godot-Level
- Alle Parameter dokumentiert
- Reproduzierbar mit gleichem Seed

---

**Kein Zeit-Limit!** ⏱️❌  
Nur **Energie** als limitierender Faktor! 🔋

---

*Soll ich mit der Implementierung beginnen?* 🚀
