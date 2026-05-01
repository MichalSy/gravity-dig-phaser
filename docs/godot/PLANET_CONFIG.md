# 🌍 PLANET CONFIG — Gravity Dig

> Planeten-spezifische Konfiguration, Schwierigkeiten und Besonderheiten

---

## 1. Planeten-System Übersicht

### 1.1 Alle Planeten

| # | Planet | Schwierigkeit | Core-Distanz | Gravitation | Besonderheit |
|---|--------|---------------|--------------|-------------|--------------|
| 1 | Terra-Prime | ⭐ | 500-580m | 1.0x | Tutorial |
| 2 | Moon-4 | ⭐ | 500-550m | 0.3x | Hohe Sprünge |
| 3 | Gravitas-9 | ⭐⭐ | 400-480m | 2.0x | Mehr Schaden |
| 4 | Float-7 | ⭐⭐ | 380-450m | 0.0x | Schwerelos |
| 5 | Invertia | ⭐⭐⭐ | 300-380m | -1.0x | Invertiert |
| 6 | Pulse-Core | ⭐⭐⭐ | 280-350m | Pulsierend | Timing |
| 7 | Chaos-Ring | ⭐⭐⭐⭐ | 200-280m | Chaos | Unvorhersehbar |
| 8 | The Core | ⭐⭐⭐⭐⭐ | 150-220m | Extrem | Boss-Planet |

---

## 2. Planeten-Details

### 2.1 Terra-Prime (Tutorial)

```json
{
  "planet": {
    "name": "Terra-Prime",
    "difficulty": 1,
    "description": "Der perfekte Startpunkt für neue Prospektoren.",
    
    "core": {
      "min_distance": 500,
      "max_distance": 580,
      "y_range": [-100, 100]
    },
    
    "gravity": {
      "type": "normal",
      "value": 1.0
    },
    
    "resources": {
      "modifiers": {
        "all": 1.0
      },
      "excluded": ["void_fragment", "quantum_stone", "antimatter"],
      "guaranteed": ["iron", "copper"]
    },
    
    "special": {
      "tutorial_mode": true,
      "hints_enabled": true,
      "safe_start": true
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Eisen, Kupfer, Stein
**Gefahren-Multiplikator:** 0.5x

---

### 2.2 Moon-4 (Leicht)

```json
{
  "planet": {
    "name": "Moon-4",
    "difficulty": 1,
    "description": "Niedrige Gravitation ermöglicht riesige Sprünge.",
    
    "core": {
      "min_distance": 500,
      "max_distance": 550,
      "y_range": [-120, 120]
    },
    
    "gravity": {
      "type": "low",
      "value": 0.3
    },
    
    "resources": {
      "modifiers": {
        "moonstone": 2.0,
        "gems": 1.5,
        "metals": 0.8
      },
      "excluded": ["magma", "obsidian"],
      "guaranteed": ["moonstone"]
    },
    
    "special": {
      "high_jumps": true,
      "oxygen_drain": 0.5
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Mondstein, Edelsteine
**Gefahren-Multiplikator:** 0.7x

---

### 2.3 Gravitas-9 (Mittel)

```json
{
  "planet": {
    "name": "Gravitas-9",
    "difficulty": 2,
    "description": "Extreme Gravitation - jeder Fall tut weh.",
    
    "core": {
      "min_distance": 400,
      "max_distance": 480,
      "y_range": [-150, 150]
    },
    
    "gravity": {
      "type": "high",
      "value": 2.0
    },
    
    "resources": {
      "modifiers": {
        "basalt": 2.0,
        "granite": 1.5,
        "platinum": 1.3,
        "dirt": 0.5
      },
      "excluded": [],
      "guaranteed": ["basalt", "granite"]
    },
    
    "special": {
      "fall_damage_multiplier": 2.0,
      "jump_height_reduction": 0.5
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Basalt, Granit, Platin
**Gefahren-Multiplikator:** 1.5x

---

### 2.4 Float-7 (Schwerelos)

```json
{
  "planet": {
    "name": "Float-7",
    "difficulty": 2,
    "description": "Keine Gravitation - du schwebst.",
    
    "core": {
      "min_distance": 380,
      "max_distance": 450,
      "y_range": [-180, 180]
    },
    
    "gravity": {
      "type": "zero",
      "value": 0.0
    },
    
    "resources": {
      "modifiers": {
        "ice_crystal": 2.5,
        "antimatter": 1.5,
        "exotic": 1.3
      },
      "excluded": ["sand", "gravel"],
      "guaranteed": ["ice_crystal"]
    },
    
    "special": {
      "inertia_movement": true,
      "no_fall_damage": true,
      "fuel_drain_multiplier": 1.5
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Eis-Kristall, Anti-Materie
**Gefahren-Multiplikator:** 1.3x

---

### 2.5 Invertia (Invertiert)

```json
{
  "planet": {
    "name": "Invertia",
    "difficulty": 3,
    "description": "Die Decke ist der Boden - Gravitation invertiert!",
    
    "core": {
      "min_distance": 300,
      "max_distance": 380,
      "y_range": [-200, 200]
    },
    
    "gravity": {
      "type": "inverted",
      "value": -1.0
    },
    
    "resources": {
      "modifiers": {
        "shadow_ore": 2.0,
        "mirror_block": 2.0,
        "echo_stone": 1.5
      },
      "excluded": ["sunstone", "light_crystal"],
      "guaranteed": ["shadow_ore"]
    },
    
    "special": {
      "inverted_controls": false,
      "ceiling_walk": true
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Schatten-Erz, Spiegel-Block
**Gefahren-Multiplikator:** 2.0x

---

### 2.6 Pulse-Core (Pulsierend)

```json
{
  "planet": {
    "name": "Pulse-Core",
    "difficulty": 3,
    "description": "Die Gravitation pulsiert - Timing ist alles!",
    
    "core": {
      "min_distance": 280,
      "max_distance": 350,
      "y_range": [-220, 220]
    },
    
    "gravity": {
      "type": "pulsing",
      "value": 1.0,
      "pulse_min": 0.5,
      "pulse_max": 1.5,
      "pulse_period": 5.0
    },
    
    "resources": {
      "modifiers": {
        "time_sand": 3.0,
        "echo_stone": 2.0,
        "quantum_stone": 1.0
      },
      "excluded": [],
      "guaranteed": ["time_sand"]
    },
    
    "special": {
      "gravity_visualization": true,
      "pulse_warning": true
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Zeit-Sand, Echo-Stein
**Gefahren-Multiplikator:** 2.2x

---

### 2.7 Chaos-Ring (Chaos)

```json
{
  "planet": {
    "name": "Chaos-Ring",
    "difficulty": 4,
    "description": "Völlig unvorhersehbare Gravitation!",
    
    "core": {
      "min_distance": 200,
      "max_distance": 280,
      "y_range": [-250, 250]
    },
    
    "gravity": {
      "type": "chaos",
      "value": 1.0,
      "chaos_min": -2.0,
      "chaos_max": 2.0,
      "chaos_interval": [2.0, 8.0]
    },
    
    "resources": {
      "modifiers": {
        "prisma_stone": 3.0,
        "quantum_stone": 2.0,
        "exotic": 1.5
      },
      "excluded": ["dirt", "sand"],
      "guaranteed": ["prisma_stone"]
    },
    
    "special": {
      "random_events": true,
      "gravity_prediction": false
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Prisma-Stein, Quantum-Stein
**Gefahren-Multiplikator:** 3.0x

---

### 2.8 The Core (Boss)

```json
{
  "planet": {
    "name": "The Core",
    "difficulty": 5,
    "description": "Der finale Planet. Nur für die Besten.",
    
    "core": {
      "min_distance": 150,
      "max_distance": 220,
      "y_range": [-280, 280]
    },
    
    "gravity": {
      "type": "extreme",
      "value": 3.0,
      "variance": 1.0
    },
    
    "resources": {
      "modifiers": {
        "void_fragment": 3.0,
        "quantum_stone": 3.0,
        "stardust": 2.5,
        "antimatter": 2.0
      },
      "excluded": ["dirt", "sand", "gravel", "clay"],
      "guaranteed": ["void_fragment", "quantum_stone"]
    },
    
    "special": {
      "boss_encounter": true,
      "no_escape_teleport": true,
      "hardcore_mode": true
    }
  }
}
```

**Ressourcen-Schwerpunkt:** Void-Fragment, Quantum-Stein, Sternenstaub
**Gefahren-Multiplikator:** 5.0x

---

## 3. Konfigurations-Struktur

### 3.1 Vollständige Planet-Config

```json
{
  "planet": {
    "id": "terra_prime",
    "name": "Terra-Prime",
    "difficulty": 1,
    "description": "...",
    
    "level": {
      "width": 600,
      "height": 600,
      "block_size": 48
    },
    
    "core": {
      "min_distance": 500,
      "max_distance": 580,
      "y_range": [-100, 100],
      "radius": 15
    },
    
    "spaceship": {
      "x_range": [-4, -1],
      "y_range": [-4, -1],
      "facing": "left"
    },
    
    "gravity": {
      "type": "normal",
      "value": 1.0,
      "pulse_min": null,
      "pulse_max": null,
      "pulse_period": null
    },
    
    "resources": {
      "modifiers": {
        "iron": 1.0,
        "copper": 1.0
      },
      "excluded": ["void_fragment"],
      "guaranteed": ["iron"]
    },
    
    "special": {
      "tutorial_mode": true
    }
  }
}
```

---

## 4. Schwierigkeits-Matrix

### 4.1 Faktoren

| Faktor | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
|--------|---|-----|-------|---------|----------|
| **Core-Distanz** | 500+ | 350-450 | 250-350 | 180-280 | 150-220 |
| **Gravitation** | Normal | ±1.0x | ±1.5x | Pulsierend | Chaos |
| **Ressourcen** | Häufig | Mittel | Selten | Extrem | Boss |
| **Gefahren** | 0.5x | 1.0x | 2.0x | 3.0x | 5.0x |
| **Sichtweite** | 5 | 4 | 3 | 2 | 1 |

---

## 5. Freischalt-System

### 5.1 Planeten-Freischaltung

| Planet | Voraussetzung |
|--------|---------------|
| Terra-Prime | Keine |
| Moon-4 | Terra-Prime abgeschlossen |
| Gravitas-9 | 2 Planeten abgeschlossen |
| Float-7 | 3 Planeten abgeschlossen |
| Invertia | 4 Planeten abgeschlossen |
| Pulse-Core | 5 Planeten abgeschlossen |
| Chaos-Ring | 6 Planeten abgeschlossen |
| The Core | Alle anderen abgeschlossen |

---

*Letzte Aktualisierung: 2026-02-23*
