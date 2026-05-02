# 🎮 UI — Benutzeroberfläche

> Grafiken für das User Interface (HUD, Menüs, Buttons)

**Implementierungsstand Phaser:** Das HUD ist als robustes Mining-Console-Overlay umgesetzt: HP + Ship Fuel kompakt oben links, Suit Energy unten zentral, Cargo-Slot-Rail direkt rechts daneben. Cargo ist slot-basiert: Start mit 1 aktivem Slot, 3 sichtbaren Locked Slots und Stacklimit 3. Künftige Menüs sollen `PlayerProfile`, `RunState` und `EffectivePlayerStats` aus [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md) verwenden.

---

## 📁 Verzeichnisstruktur

```
generated_assets/ui/
├── title_logo.png       # Spiel-Logo
├── button_*.png         # Menü-Buttons
├── hud_*.png            # HUD-Balken
├── inventory_slot.png   # Inventar-Feld
└── currency_icon.png    # Credits-Symbol
```

---

## 🚀 Start-Menü

| Element | Größe | Beschreibung | Grafik |
|---------|-------|--------------|--------|
| title_logo | 320x120 | GRAVITY DIG Logo | ![Logo](../generated_assets/ui/title_logo.png) |
| button_start | 200x50 | NEW GAME Button | ![Start](../generated_assets/ui/button_start.png) |
| button_load | 200x50 | LOAD GAME Button | ![Load](../generated_assets/ui/button_load.png) |
| button_options | 200x50 | OPTIONS Button | ![Options](../generated_assets/ui/button_options.png) |
| button_quit | 200x50 | QUIT Button | ![Quit](../generated_assets/ui/button_quit.png) |

---

## 🎮 HUD (Heads-Up Display)

| Element | Größe | Beschreibung | Grafik |
|---------|-------|--------------|--------|
| hud_health | 128x32 | Lebensbalken (grün) | ![Health](../generated_assets/ui/hud_health.png) |
| hud_energy | 128x32 | Energiebalken (blau) | ![Energy](../generated_assets/ui/hud_energy.png) |
| hud_fuel | 128x32 | Treibstoffbalken (orange) | ![Fuel](../generated_assets/ui/hud_fuel.png) |

---

## 🎒 Inventar

| Element | Größe | Beschreibung | Grafik |
|---------|-------|--------------|--------|
| inventory_slot | 64x64 | Leeres Item-Feld | ![Slot](../generated_assets/ui/inventory_slot.png) |
| currency_icon | 32x32 | Credits/Münze | ![Currency](../generated_assets/ui/currency_icon.png) |

---

## 📐 HUD-Layout

```
┌ HP ♥ ███ 100/100 ┐
│ FUEL ⛽ ███ 100/100 │   ← oben links, kompakt


        ┌──── SUIT ENERGY ────┬──── CARGO ─────────────┐
        │ ███████████ 100/100 │ [Item x3] [🔒] [🔒] [🔒] │ ← unten zentral
        └─────────────────────┴────────────────────────┘
```

Start-Cargo: 1 aktiver Slot, Stacklimit 3. Weitere Slots werden über Cargo-Upgrades freigeschaltet.

---

*Alle UI-Elemente haben transparenten Hintergrund*
