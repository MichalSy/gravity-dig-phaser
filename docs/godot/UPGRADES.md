# ⬆️ UPGRADES — Alle Upgrades & Verbesserungen

> Vollständige Liste aller Upgrades für Schiff, Anzug und Equipment.

**Implementierungsstand Phaser:** Upgrades sind datengetrieben in `src/player/catalogs/upgrades.ts` angelegt und wirken über generische `StatModifier` auf `EffectivePlayerStats`. Details siehe [PLAYER_MANAGEMENT.md](PLAYER_MANAGEMENT.md).

---

## 🚀 Schiff-Upgrades

### Triebwerke (Treibstoff-Effizienz)

| Upgrade | Effekt | Visuelle Änderung | Kosten | Grafik |
|---------|--------|-------------------|--------|--------|
| Rost-Entferner | — | Silber statt braun | 200 Cr | ⏳ |
| Triebwerke MK1 | -10% Treibstoff | Neue Düsen | 500 Cr | ⏳ |
| Triebwerke MK2 | -25% Treibstoff | Glühende Kerne | 1500 Cr | ⏳ |
| Triebwerke MK3 | -40% Treibstoff | Ionen-Antrieb | 4000 Cr | ⏳ |

### Laderaum

| Upgrade | Effekt | Visuell | Kosten | Grafik |
|---------|--------|---------|--------|--------|
| Erweiterter Laderaum I | +50% Inventar | 1 Container | 300 Cr | ⏳ |
| Erweiterter Laderaum II | +100% Inventar | 2 Container | 800 Cr | ⏳ |
| Erweiterter Laderaum III | +200% Inventar | 4 Container | 2000 Cr | ⏳ |

### Navigation

| Upgrade | Effekt | Visuell | Kosten | Grafik |
|---------|--------|---------|--------|--------|
| Nav-Upgrade I | Neue Planeten sichtbar | Antenne wächst | 800 Cr | ⏳ |
| Nav-Upgrade II | Weitere Planeten | Größere Antenne | 2000 Cr | ⏳ |
| Warp-Triebwerk | Schnell-Reise | Warp-Core sichtbar | 5000 Cr | ⏳ |

### Komfort

| Upgrade | Effekt | Visuell | Kosten | Grafik |
|---------|--------|---------|--------|--------|
| Luxus-Kabine | — | Fenster, Beleuchtung | 2000 Cr | ⏳ |
| Goldene Nase | — | "The Golden Bucket" | 5000 Cr | ⏳ |
| Droiden-Helfer | Auto-Sortieren | Kleiner Droide | 3000 Cr | ⏳ |

### Werkstatt-Erweiterungen

| Upgrade | Effekt | Kosten | Grafik |
|---------|--------|--------|--------|
| Basis-Werkstatt | Crafting Stufe 1 | — | ⏳ |
| Erweiterte Werkstatt | Crafting Stufe 2 | 1000 Cr | ⏳ |
| High-Tech Werkstatt | Crafting Stufe 3 | 3000 Cr | ⏳ |

---

## 👨‍🚀 Anzug-Upgrades

### Laser-Upgrades

| Upgrade | Effekt | Kosten | Verfügbar | Grafik |
|---------|--------|--------|-----------|--------|
| Laser MK2 | Reichweite +1 | 100 Cr | Start | ⏳ |
| Laser MK3 | Reichweite +2 | 300 Cr | Early | ⏳ |
| Laser MK4 | Reichweite +3 | 800 Cr | Mid | ⏳ |
| Durchschlags-Laser | 2 Blöcke auf einmal | 500 Cr | Mid | ⏳ |
| Schnell-Laser | -50% Cooldown | 600 Cr | Mid | ⏳ |
| Auto-Laser | Dauerfeuer | 1000 Cr | Late | ⏳ |
| Spektral-Laser | Ressourcen durch Wände | 1500 Cr | Late | ⏳ |

### Sicht-Upgrades

| Upgrade | Effekt | Kosten | Grafik |
|---------|--------|--------|--------|
| Visier MK1 | Sicht +1 | 150 Cr | ⏳ |
| Visier MK2 | Sicht +2 | 400 Cr | ⏳ |
| Radar-Visier | Sicht +3, Metall sichtbar | 900 Cr | ⏳ |
| Quantum-Visier | Sicht +4, seltene Erze | 2000 Cr | ⏳ |

### Batterie-Upgrades

| Upgrade | Kapazität | Kosten | Grafik |
|---------|-----------|--------|--------|
| Batterie MK1 | 150 Energie | 400 Cr | ⏳ |
| Batterie MK2 | 250 Energie | 900 Cr | ⏳ |
| Batterie MK3 | 400 Energie | 2000 Cr | ⏳ |
| Batterie Fusion | 700 Energie | 5000 Cr | ⏳ |

### Core-Equipment

| Upgrade | Effekt | Kosten | Verfügbar | Grafik |
|---------|--------|--------|-----------|--------|
| Core-Compass | Richtung zum Core | 800 Cr | Early-Mid | ⏳ |
| Core-Scanner | Distanz in Metern | 2000 Cr | Mid | ⏳ |
| Advanced-Mapper | Minimap | 5000 Cr | Late | ⏳ |

### Magnet-Stiefel

| Upgrade | Core-Distanz | Kraft | Kosten | Grafik |
|---------|--------------|-------|--------|--------|
| Stiefel MK1 | 75m | Gering | 500 Cr | ⏳ |
| Stiefel MK2 | 50m | Mittel | 1200 Cr | ⏳ |
| Stiefel MK3 | 30m | Stark | 3000 Cr | ⏳ |
| Stiefel MK4 | 15m | Extrem | 6000 Cr | ⏳ |

### Leiter-Verbesserungen

| Upgrade | Effekt | Herstellung | Kosten | Grafik |
|---------|--------|-------------|--------|--------|
| Leiter-Blaupause | Kann Leitern craften | — | — | ⏳ |
| Schnelle Leiter | 2x Klettergeschwindigkeit | 5x Eisen, 1x Kristall | — | ⏳ |
| Energie-Leiter | Auto-hoch | 10x Eisen, 3x Kristall | — | ⏳ |

---

## 📊 Upgrade-Bäume

### Anzug-Upgrade-Baum

```
Start
├── Laser
│   ├── MK2 (100 Cr)
│   ├── MK3 (300 Cr)
│   ├── MK4 (800 Cr)
│   ├── Durchschlag (500 Cr)
│   ├── Schnell (600 Cr)
│   ├── Auto (1000 Cr)
│   └── Spektral (1500 Cr)
├── Sicht
│   ├── MK1 (150 Cr)
│   ├── MK2 (400 Cr)
│   ├── Radar (900 Cr)
│   └── Quantum (2000 Cr)
├── Batterie
│   ├── MK1 (400 Cr)
│   ├── MK2 (900 Cr)
│   ├── MK3 (2000 Cr)
│   └── Fusion (5000 Cr)
└── Core-Equipment
    ├── Compass (800 Cr)
    ├── Scanner (2000 Cr)
    └── Mapper (5000 Cr)
```

### Schiff-Upgrade-Baum

```
Start
├── Triebwerke
│   ├── Rost-Entferner (200 Cr)
│   ├── MK1 (-10%, 500 Cr)
│   ├── MK2 (-25%, 1500 Cr)
│   └── MK3 (-40%, 4000 Cr)
├── Laderaum
│   ├── I (+50%, 300 Cr)
│   ├── II (+100%, 800 Cr)
│   └── III (+200%, 2000 Cr)
├── Navigation
│   ├── I (800 Cr)
│   ├── II (2000 Cr)
│   └── Warp (5000 Cr)
└── Komfort
    ├── Luxus (2000 Cr)
    ├── Goldene Nase (5000 Cr)
    └── Droide (3000 Cr)
```

---

## 💰 Gesamtkosten für Max-Upgrades

| Kategorie | Summe |
|-----------|-------|
| Alle Laser | 4.800 Cr |
| Alle Sicht | 3.450 Cr |
| Alle Batterien | 8.300 Cr |
| Alle Core-Equip | 7.800 Cr |
| Alle Stiefel | 10.700 Cr |
| Alle Schiff-Upgrades | 19.300 Cr |
| **GESAMT** | **54.350 Cr** |

---

## 🎨 Grafik-Anforderungen

### Schiff-Upgrades (Visuelle Stufen)
- [ ] Stufe 0: Rost-Bucket (Start)
- [ ] Stufe 1: Silber, kleine Änderungen
- [ ] Stufe 2: Neue Düsen, weniger Rost
- [ ] Stufe 3: Glühende Triebwerke
- [ ] Stufe 4: Warp-Antrieb, High-Tech
- [ ] Stufe 5: Goldene Nase

### Anzug-Upgrades
- [ ] Laser-Varianten (8 verschiedene)
- [ ] Visier-Varianten (5 Stufen)
- [ ] Batterie-Backpacks (5 Stufen)
- [ ] Stiefel (4 Stufen)
- [ ] Core-Detector (3 Varianten)

---

**Legende:**
- ⏳ = Noch nicht erstellt
- ✅ = Fertig
- 🔄 = In Arbeit

*Letzte Aktualisierung: 2026-02-22*
