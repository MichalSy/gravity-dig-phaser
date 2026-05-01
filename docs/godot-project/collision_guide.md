# Pixel-Perfekte Kollision in Godot

## Optionen (von schnell zu präzise):

### 1. RectangleShape2D (aktuell) ✅
```gdscript
# Gut für: Platformer, schnelle Berechnung
shape = RectangleShape2D.new()
shape.size = Vector2(32, 48)
```
- ✅ Sehr schnell
- ✅ Stabile Physik
- ❌ Keine exakte Form

### 2. CollisionPolygon2D (Pixel-Umriss)
```gdscript
# Manuell Punkte definieren oder aus Sprite generieren
var polygon = CollisionPolygon2D.new()
polygon.polygon = PackedVector2Array([
    Vector2(-16, -48),  # Schulter links
    Vector2(16, -48),   # Schulter rechts
    Vector2(16, 0),     # Fuß rechts
    Vector2(-16, 0),    # Fuß links
])
```
- ✅ Exakte Form
- ❌ Teurer (mehr CPU)
- ❌ Kann bei komplexen Formen "haken"

### 3. Bitmask Collision (aus Sprite generieren)
```gdscript
# Sprite2D mit Alpha-Channel → CollisionPolygon2D
var bitmap = BitMap.new()
bitmap.create_from_image_alpha(texture.get_image())
var polygons = bitmap.opaque_to_polygons(Rect2(0, 0, 64, 64))
```
- ✅ Automatisch aus Grafik
- ❌ Noch teurer
- ❌ Muss bei jedem Frame-Wechsel neu berechnet werden

## Empfehlung für Gravity Dig:

**Bei RectangleShape2D bleiben!** 

Warum:
- 2D Platformer brauchen stabile, vorhersehbare Physik
- Pixel-perfekte Collision führt zu:
  - Hängenbleiben an Kanten
  - Ruckeln bei Animationen
  - Komplexere Berechnungen

## Fix für dein Problem:

```gdscript
# Aktuell:
# Sprite position: (0, -8)   ← Oben versetzt
# Collision position: (0, 0) ← Unten

# Fix:
# Sprite position: (0, -24)   ← Beide zentriert
# Collision position: (0, -24) ← Beide zentriert
```

Jetzt sind Sprite und Collision auf gleicher Höhe! 🎮
