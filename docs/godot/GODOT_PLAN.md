# 🎮 GODOT PROJEKT — Setup & Szenen-Plan

## 📋 Benötigte Szenen

### 1. **TitleScreen** (Start)
- Hintergrund: `bg/bg_menu.png` (320x180)
- Logo: `ui/title_logo.png` (320x120)
- Buttons: Start, Load, Options, Quit (200x50)
- Animationen: Sternen-Funkeln, Logo-Einblenden

### 2. **MainMenu** (Hauptmenü nach Start)
- Hintergrund: `bg/bg_menu.png`
- Player-Statistiken
- Planeten-Auswahl
- Shop-Zugang
- Equipment-Management

### 3. **GameScene** (Hauptspiel)
- Hintergrund: `bg/bg_game.png`
- Spieler-Sprite
- Block-Grid (Tiles 48x48)
- HUD (Health, Energy, Fuel bars)
- Minimap (optional)

### 4. **ShipInterior** (Raumschiff-Innen)
- Boden: `interior/ship_interior_base.png` (96x96)
- Wände: `interior/ship_wall.png` (48x48)
- Geräte: Alle `devices/*.png` (64x64)
- Türen: `interior/ship_door.png` (48x64)

### 5. **ShopScene** (Verkaufsautomat)
- UI für Item-Kauf/Verkauf
- Inventar-Grid
- Credits-Anzeige

### 6. **PauseMenu**
- Semi-transparentes Overlay
- Resume, Settings, Quit Buttons

### 7. **GameOver** (Optional)
- Score-Anzeige
- Restart/Quit Buttons

---

## 🗂️ Godot-Projektstruktur

```
godot-project/
├── project.godot
├── assets/
│   ├── sprites/
│   │   ├── tiles/          # 48x48
│   │   ├── icons/          # 64x64
│   │   ├── devices/        # 64x64
│   │   ├── ships/          # 128x96
│   │   ├── interior/       # 48-96px
│   │   ├── ui/             # Verschieden
│   │   ├── bg/             # 320x180
│   │   └── env/            # Verschieden
│   ├── fonts/
│   └── audio/
├── scenes/
│   ├── TitleScreen.tscn
│   ├── MainMenu.tscn
│   ├── GameScene.tscn
│   ├── ShipInterior.tscn
│   ├── ShopScene.tscn
│   └── PauseMenu.tscn
├── scripts/
│   ├── TitleScreen.gd
│   ├── MainMenu.gd
│   ├── GameScene.gd
│   ├── Player.gd
│   ├── Block.gd
│   └── HUD.gd
└── resources/
    ├── BlockData.tres
    └── ItemData.tres
```

---

## 🎯 Nächste Schritte

1. **Godot 4.x installieren** (falls nicht vorhanden)
2. **Projekt erstellen** (2D, 640x360 Auflösung)
3. **Assets importieren** (aus generated_assets/)
4. **TitleScreen implementieren**
   - Szene erstellen
   - Hintergrund + Logo + Buttons
   - Button-Logik (Start → MainMenu)
5. **MainMenu implementieren**
6. **ShipInterior implementieren** (erstes spielbares Level)

---

## 📐 Design-Entscheidungen

- **Auflösung:** 640x360 (16:9, 2x Scale der Assets)
- **Tile-Größe:** 48x48
- **Art-Stil:** Pixel-Art, Sci-Fi
- **Farbpalette:** Dunkle Blau/Lila für Space, Warme Farben für Core

---

*Erstellt: 2026-02-23*
