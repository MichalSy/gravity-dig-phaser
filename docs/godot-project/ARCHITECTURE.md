# Gravity Dig - Architektur-Dokumentation

## Letzte Aktualisierung: 2024

**Godot Version:** 4.6.1 (upgraded from 4.2)

---

## Systemanforderungen

### Godot Engine
- **Minimum:** Godot 4.6.1
- **Empfohlen:** Godot 4.6.1 stable
- **Download:** [godotengine.org](https://godotengine.org/download)

### Warum 4.6.1?
- Stabilität gegenüber 4.2
- Bessere Performance
- Verbesserter Web Export
- Mehr Features

---

## Grundprinzipien

### 1. Keine Autoloads (Singletons)

**Warum?**
- Nicht sichtbar im Scene-Tree
- Schwerer zu debuggen (keine Live-Inspect im Editor)
- Für unser Projekt nicht nötig (keine komplexen Scene-Wechsel)

**Alternative:**
Manager als normale Nodes unter `/root/Main/Managers/`
- Sichtbar in Hierarchie
- Live editierbar im Inspector
- Einfacher zu debuggen

### 2. Kein z_index - Nur Hierarchie für Rendering

**Warum kein z_index?**
- `z_index` ist ein "magischer" Wert (z.B. `z_index = 1000`)
- Schwer zu warten (welcher Node hat welchen z_index?)
- Konflikte möglich (zwei Nodes mit gleichem z_index)
- Nicht offensichtlich im Scene-Tree

**Unsere Regel:**
```
Hierarchie bestimmt Rendering-Order:
→ Node, der später in der Hierarchie kommt, wird über früheren gerendert

GameScene
├── World
│   ├── TileMap           ← Rendert zuerst (unten)
│   └── WorldDebugLayer   ← Rendert danach (darüber) ✅
├── Player
│   ├── AnimatedSprite2D  ← Rendert zuerst
│   └── PlayerDebugLayer  ← Rendert danach (darüber) ✅
└── UI (CanvasLayer)      ← Immer über Node2D
    └── UIDebugLayer      ← Ganz oben ✅
```

**Vorteile:**
- Sichtbar im Scene-Tree
- Keine versteckten "magischen" Zahlen
- Einfacher zu verstehen
- Weniger Bugs

---

## Node-Hierarchie

```
/root (Viewport)
└── Main (Node)                        ← Neue Root-Scene
    ├── Managers (Node)                ← Überlebt GameScene-Reloads
    │   └── DebugManager (Node)
    │
    └── GameScene (Node2D)             ← Kann neu geladen werden
        ├── World (Node2D)
        │   ├── TileMap
        │   └── WorldDebugLayer
        ├── Player
        │   └── PlayerDebugLayer
        └── UI (CanvasLayer)
            ├── HUD
            └── UIDebugLayer
```

---

## Manager-Pattern

### Referenz-Ansatz

Jedes Layer holt sich **einmal** in `_ready()` den Manager:

```gdscript
# Beispiel: WorldDebugLayer.gd
var debug_manager: Node = null

func _ready():
    # Einmalig Referenz holen (Manager ist außerhalb GameScene)
    debug_manager = get_node("/root/Main/Managers/DebugManager")
    
    # Optional: Sich selbst beim Manager registrieren
    debug_manager.world_debug_layer = self
```

**Wichtig:** Manager ist jetzt unter `/root/Main/Managers/`, nicht mehr unter GameScene!
Das bedeutet:
- Manager überlebt Scene-Reloads von GameScene
- Klare Trennung zwischen "System" (Main) und "Content" (GameScene)

### Vorteile
- Klare Abhängigkeiten
- Keine "magischen" globalen Variablen
- Sichtbar im Scene-Tree
- Einfach zu testen
- **Manager überlebt GameScene-Reloads** (weil außerhalb)
- **GameScene kann ausgetauscht werden** (z.B. für verschiedene Levels)

---

## Debug-System

### DebugManager
Zentrale Steuerung aller Debug-Features:

```gdscript
# Flags
var god_mode_enabled: bool = false
var show_collision_debug: bool = false
var show_hitbox_debug: bool = false
var show_sprite_boundary: bool = false
var show_raycast_debug: bool = false
```

### Debug-Layer

| Layer | Aufgabe | Parent |
|-------|---------|--------|
| **WorldDebugLayer** | Zeigt Tile-Kollisionen als Linien | World (bewegt sich mit Welt) |
| **PlayerDebugLayer** | Zeigt Raycast, Hitbox, Sprite-Boundary | Player (bewegt sich mit Player) |
| **UIDebugLayer** | Panel mit Toggle-Buttons | UI (CanvasLayer, immer sichtbar) |

### God Mode (G-Taste)
- Schaltet alle Debug-Features an
- Zeigt UIDebugLayer
- Deaktiviert Gravitation

---

## CanvasLayer vs Node2D

### Wann CanvasLayer?
- UI-Elemente die **unabhängig** von Kamera sein sollen
- HUD, Menüs, Debug-Panels
- Immer im Screen-Space

### Wann Node2D?
- Elemente die sich mit der **Welt bewegen**
- Debug-Linien um Player/Tiles
- World-Space

### Unsere Regel
- **UI/** → CanvasLayer (Screen-Space)
- **World/** → Node2D (World-Space)
- **Player/** → Node2D (folgt Player)

---

## Best Practices

### 1. Keine festen Pfade in `_process()`
```gdscript
# ❌ Schlecht:
get_node("/root/GameScene/Managers/DebugManager").show_debug

# ✅ Gut:
# In _ready(): var dm = get_node("/root/GameScene/Managers/DebugManager")
# In _process(): if dm.show_debug:
```

### 2. Kein z_index verwenden
```gdscript
# ❌ Schlecht:
z_index = 1000  # Warum 1000? Konflikt mit anderen?

# ✅ Gut:
# Einfach Node später in Hierarchie platzieren
# Scene-Tree zeigt die Reihenfolge
```

### 3. Sichtbarkeit managen
```gdscript
# Layer löscht eigene Children wenn ausgeschaltet
func _process():
    if not debug_manager.show_feature:
        for child in get_children():
            child.queue_free()
        return
```

### 4. Getter für Debug-Informationen
Player stellt Methoden bereit:
```gdscript
func get_laser_hit_position() -> Vector2:
    return laser_hit_position
```

---

## Zukünftige Erweiterungen

### Wenn wir mehr Scenes brauchen
Optionen:
1. **Scene-Wechsel mit State-Speicherung**
   - `GameState` Node als Child von GameScene
   - Speichert/restore Position, Inventar etc.

2. **Viewport (Bild-im-Bild)**
   - Für Raumschiff-Innenansicht
   - SubViewport Node

3. **Node-Hierarchie innerhalb GameScene**
   - `World.visible = false`
   - `ShipInterior.visible = true`
   - Kein Scene-Wechsel nötig

---

## Physik-Layer

| Layer | Was | Nutzung |
|-------|-----|---------|
| **1** | World (Tiles) | TileMap Kollision |
| **2** | Player | Player Kollision |

Raycast prüft nur Layer 1:
```gdscript
query.collision_mask = 1  # Ignoriert Player
```

---

## Datei-Struktur

```
scripts/
├── GameScene.gd           ← Haupt-Scene
├── DebugManager.gd        ← Manager
├── WorldDebugLayer.gd     ← World Debug
├── PlayerDebugLayer.gd    ← Player Debug
├── UIDebugLayer.gd        ← UI Debug Panel
├── Player.gd              ← Player Logik
└── LevelGenerator.gd      ← Welt-Generierung

scenes/
├── GameScene.tscn         ← Haupt-Scene
├── Player.tscn            ← Player Scene
└── HUD.tscn               ← HUD Scene
```

---

## Entscheidungs-Logbuch

| Datum | Entscheidung | Begründung |
|-------|--------------|------------|
| 2024 | Keine Autoloads | Sichtbarkeit im Editor, einfacheres Debugging |
| 2024 | Manager als Node | Klare Hierarchie, Live-Inspect |
| 2024 | Layer pro Debug-Typ | Trennung der Verantwortlichkeiten |
| 2024 | CanvasLayer für UI | Unabhängig von Kamera |
| 2024 | Node2D für World/Player Debug | Bewegt sich mit Welt/Player |
| 2024 | **Kein z_index** | Hierarchie zeigt Rendering-Order, keine magischen Zahlen |
| 2024 | **Upgrade Godot 4.2 → 4.6.1** | Stabilität, Performance, neue Features |

---

## Kontakt

Bei Fragen zur Architektur: Siehe `AGENTS.md` für aktuelle Projektkontexte.
