# 🚀 SHIPS — Raumschiff & Station

> Grafiken und Assets für das Raumschiff (Hub-Bereich)

---

## 📁 Verzeichnisstruktur

```
generated_assets/
├── ships/          # Außenansichten
├── interior/       # Innenausstattung
└── devices/        # Interaktive Geräte
```

---

## 🚀 Raumschiff Außen

| Asset | Größe | Beschreibung | Grafik |
|-------|-------|--------------|--------|
| ship_exterior | 128x96 | Raumschiff schaut nach links, Treppe rechts unten | ![Exterior](../generated_assets/ships/ship_exterior.png) |

---

## 🏠 Raumschiff Innen

### Grundstruktur

| Asset | Größe | Beschreibung | Grafik |
|-------|-------|--------------|--------|
| ship_interior_base | 96x96 | Metallboden-Paneele | ![Floor](../generated_assets/interior/ship_interior_base.png) |
| ship_wall | 48x48 | Wand-Bulkhead | ![Wall](../generated_assets/interior/ship_wall.png) |
| ship_door | 48x64 | Schiebetür, Airlock | ![Door](../generated_assets/interior/shop_door.png) |
| ship_window | 48x48 | Fenster mit Sternen | ![Window](../generated_assets/interior/ship_window.png) |

---

## 🔧 Geräte & Stationen

| Gerät | Funktion | Grafik |
|-------|----------|--------|
| Shop | Item-Verkauf | ![Shop](../generated_assets/devices/device_shop.png) |
| Crafting | Werkstatt, Herstellung | ![Crafting](../generated_assets/devices/device_crafting.png) |
| Storage | Lager, Kiste | ![Storage](../generated_assets/devices/device_storage.png) |
| Healing | Med-Station, Heilung | ![Healing](../generated_assets/devices/device_healing.png) |
| Generator | Energie-Erzeugung | ![Generator](../generated_assets/devices/device_generator.png) |
| Teleporter | Schnellreise | ![Teleporter](../generated_assets/devices/device_teleporter.png) |
| Upgrade | Ausrüstung verbessern | ![Upgrade](../generated_assets/devices/device_upgrade.png) |
| Fuel | Treibstoff auffüllen | ![Fuel](../generated_assets/devices/device_fuel.png) |
| Computer | Daten, Missionen | ![Computer](../generated_assets/devices/device_computer.png) |
| Bed | Schlafen, Speichern | ![Bed](../generated_assets/devices/device_bed.png) |
| Repair | Reparatur-Station | ![Repair](../generated_assets/devices/device_repair.png) |
| Analyzer | Erz-Analyse | ![Analyzer](../generated_assets/devices/device_analyzer.png) |

---

## 🎮 Layout-Vorschlag

```
┌─────────────────────────────────────────┐
│  [Storage]  [Crafting]  [Shop]         │
│                                         │
│  [Healing]   [FLOOR]    [Upgrade]      │
│                                         │
│  [Bed]      [Computer]  [Analyzer]     │
│                                         │
│  [Generator][Fuel][Teleporter]  [EXIT] │
└─────────────────────────────────────────┘
```

---

*Alle Geräte sind 64x64 Pixel*
