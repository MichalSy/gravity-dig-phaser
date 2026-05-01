# 🧩 CHUNKING SYSTEM — Gravity Dig

> Effizientes Rendering durch Viewport-basiertes Chunk-Management

---

## 1. Problem

### 1.1 Ohne Chunking

```
Level: 600 × 600 Blöcke = 360.000 Tiles
Jedes Tile = Sprite2D Node
→ 360.000 Nodes im Szenen-Baum
→ FPS: 5-10 (unspielbar)
```

### 1.2 Mit Chunking

```
Nur sichtbare Chunks: ~9 Chunks (3×3)
Pro Chunk: 32×32 = 1.024 Tiles
→ ~9.000 Tiles aktiv
→ FPS: 60+ ✅
```

---

## 2. Chunking-Architektur

### 2.1 Komponenten

```
ChunkManager
├── Active Chunks (sichtbar)
├── Chunk Pool (vorgeneriert)
├── Load Queue (zu laden)
├── Unload Queue (zu entladen)
└── Visibility Checker

Chunk (32×32 Tiles)
├── Tile Sprites
├── Position
├── Loaded Status
└── Last Accessed Time
```

### 2.2 Chunk-Größe

| Parameter | Wert | Grund |
|-----------|------|-------|
| **Chunk Size** | 32×32 Tiles | Balance: Detail vs. Performance |
| **Total Chunks** | ~400 (600×600 Level) | 600/32 = ~19 Chunks pro Dimension |
| **Viewport Chunks** | 3×3 = 9 Chunks | Sichtbar + Puffer |
| **Puffer** | 1 Chunk Rand | Vorladen beim Bewegen |

---

## 3. Rendering-Logik

### 3.1 Sichtbarkeits-Check

```python
func update_chunks():
    player_chunk = get_chunk_at(player.position)
    
    # Bestimme sichtbare Chunks (3x3 um Spieler)
    visible_chunks = []
    for dx in [-1, 0, 1]:
        for dy in [-1, 0, 1]:
            chunk_pos = player_chunk + Vector2i(dx, dy)
            visible_chunks.append(chunk_pos)
    
    # Lade neue Chunks
    for chunk_pos in visible_chunks:
        if not is_loaded(chunk_pos):
            load_chunk(chunk_pos)
    
    # Entlade alte Chunks
    for chunk in active_chunks:
        if chunk.position not in visible_chunks:
            unload_chunk(chunk)
```

### 3.2 Chunk-Lebenszyklus

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   POOL      │────▶│  LOADING    │────▶│   ACTIVE    │
│ (vorbereit) │     │  (generiert)│     │  (sichtbar) │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                                ▼
                                        ┌─────────────┐
                                        │  UNLOADING  │
                                        │ (entlädt)   │
                                        └─────────────┘
```

---

## 4. Implementierung

### 4.1 ChunkManager

```gdscript
class_name ChunkManager
extends Node

const CHUNK_SIZE = 32
const VIEWPORT_RADIUS = 1  # 1 Chunk Puffer
const MAX_ACTIVE_CHUNKS = 16

var chunk_pool: Array[Chunk] = []
var active_chunks: Dictionary = {}  # Vector2i -> Chunk
var chunk_data: Dictionary = {}  # Vom LevelGenerator

@onready var tiles_container: Node2D
@onready var player: Node2D

var last_player_chunk: Vector2i = Vector2i(-999, -999)

func _ready():
    # Pool vorbereiten
    for i in range(MAX_ACTIVE_CHUNKS):
        var chunk = Chunk.new()
        chunk_pool.append(chunk)
    
    set_process(true)

func _process(delta):
    var player_chunk = world_to_chunk(player.position)
    
    if player_chunk != last_player_chunk:
        update_visible_chunks(player_chunk)
        last_player_chunk = player_chunk

func update_visible_chunks(center_chunk: Vector2i):
    var needed_chunks: Array[Vector2i] = []
    
    # Sammle benötigte Chunks
    for x in range(-VIEWPORT_RADIUS, VIEWPORT_RADIUS + 1):
        for y in range(-VIEWPORT_RADIUS, VIEWPORT_RADIUS + 1):
            var chunk_pos = center_chunk + Vector2i(x, y)
            needed_chunks.append(chunk_pos)
    
    # Lade fehlende Chunks
    for chunk_pos in needed_chunks:
        if not active_chunks.has(chunk_pos):
            load_chunk(chunk_pos)
    
    # Entlade nicht mehr sichtbare Chunks
    var to_unload = []
    for pos in active_chunks.keys():
        if pos not in needed_chunks:
            to_unload.append(pos)
    
    for pos in to_unload:
        unload_chunk(pos)

func load_chunk(pos: Vector2i):
    if chunk_pool.is_empty():
        return
    
    var chunk = chunk_pool.pop_back()
    chunk.position = pos
    
    # Generiere Chunk-Daten
    var tiles = generate_chunk_tiles(pos)
    chunk.create_tiles(tiles, tiles_container)
    
    active_chunks[pos] = chunk

func unload_chunk(pos: Vector2i):
    if not active_chunks.has(pos):
        return
    
    var chunk = active_chunks[pos]
    chunk.destroy_tiles()
    
    active_chunks.erase(pos)
    chunk_pool.append(chunk)

func world_to_chunk(world_pos: Vector2) -> Vector2i:
    var x = floor(world_pos.x / (CHUNK_SIZE * TILE_SIZE))
    var y = floor(world_pos.y / (CHUNK_SIZE * TILE_SIZE))
    return Vector2i(x, y)
```

### 4.2 Chunk-Klasse

```gdscript
class_name Chunk
extends RefCounted

var position: Vector2i
var tiles: Array[Sprite2D] = []
var is_loaded: bool = false

func create_tiles(tile_data: Dictionary, parent: Node2D):
    for pos in tile_data.keys():
        var block_type = tile_data[pos]
        var sprite = Sprite2D.new()
        sprite.texture = get_texture(block_type)
        sprite.position = Vector2(pos.x * TILE_SIZE, pos.y * TILE_SIZE)
        parent.add_child(sprite)
        tiles.append(sprite)
    
    is_loaded = true

func destroy_tiles():
    for tile in tiles:
        tile.queue_free()
    tiles.clear()
    is_loaded = false
```

---

## 5. Performance-Optimierungen

### 5.1 Async Loading

```python
func load_chunk_async(pos: Vector2i):
    # Lade in Hintergrund-Thread
    Thread.new().start(func():
        var data = generate_chunk_tiles(pos)
        call_deferred("finalize_chunk", pos, data)
    )
```

### 5.2 LOD (Level of Detail)

| Distanz | Detail | Effekt |
|---------|--------|--------|
| 0-1 Chunks | Volle Qualität | Alle Details |
| 2-3 Chunks | Reduziert | Keine Partikel |
| 4+ Chunks | Nicht sichtbar | Entladen |

### 5.3 Object Pooling

```
Statt: create() / destroy()
Lieber:  pool.pop() / pool.push()

Vorteile:
- Keine Garbage Collection
- Keine Ladezeiten
- Konstante FPS
```

---

## 6. Konfigurierbare Parameter

```json
{
  "chunking": {
    "chunk_size": 32,
    "viewport_radius": 1,
    "max_active_chunks": 16,
    "async_loading": true,
    "preload_radius": 2,
    "unload_delay_ms": 500
  }
}
```

---

## 7. Debug-Visualisierung

```
[F3] Chunk Debug Overlay:

┌─────────────────────────────┐
│ 🧩 CHUNK DEBUG              │
│ Active: 9/16               │
│ Pool: 7                    │
│ Player Chunk: (12, -5)     │
│ Loaded: 45ms ago           │
│ [■■■■■■■■■□□□□□□□□□□□□□□□] │
└─────────────────────────────┘

Grün = Geladen
Rot = Nicht geladen
```

---

## 8. Zusammenfassung

| Ohne Chunking | Mit Chunking |
|---------------|--------------|
| 360.000 Tiles | ~9.000 Tiles |
| 5-10 FPS | 60 FPS |
| 2GB RAM | 200MB RAM |
| Ladezeit: 10s | Ladezeit: Instant |
| Unspielbar | ✅ Perfekt |

---

*Implementierung folgt...* 🚀
