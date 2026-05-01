# 🎮 UI — Benutzeroberfläche

> Grafiken für das User Interface (HUD, Menüs, Buttons)

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

## 📐 HUD-Layout-Vorschlag

```
┌────────────────────────────────────────┐
│  ❤️ [Health]   ⚡ [Energy]  ⛽ [Fuel]   │  ← Top-Left
│                                        │
│         [    SPIELWELT    ]           │
│                                        │
│  💰 1234 Cr              [Inv][Map]   │  ← Bottom
└────────────────────────────────────────┘
```

---

*Alle UI-Elemente haben transparenten Hintergrund*
