# 🧱 BLOCKS — Alle Block-Typen

> Vollständige Liste aller Blöcke im Spiel mit Eigenschaften, Spawn-Bedingungen und Grafik-Status.

---

## 📊 Block-Kategorien

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| Basis | 4 | Weich, häufig |
| Gestein | 5 | Normale Steine |
| Metall | 6 | Erze und Adern |
| Edelsteine | 4 | Wertvoll, glänzend |
| Magisch | 7 | Spezielle Effekte |
| Exotisch | 7 | Selten, besondere Mechaniken |
| Spezial | 4 | Einzigartig |
| **Gesamt** | **37** | |

---

## 🏜️ Kategorie: Basis (Weich)

| Block | Härte | Drops | Besonderheit | Spawn | Tile (48x48) |
|-------|-------|-------|--------------|-------|--------------|
| Erde | 1 Hit | — | Weich, schnell | Überall | ![Erde](../generated_assets/tiles/tile_dirt.png) |
| Sand | 1 Hit | Sand | **Fällt nach unten!** | Oberfläche | ![Sand](../generated_assets/tiles/tile_sand.png) |
| Kies | 2 Hits | Kies | 1% Metall-Chance | Oberfläche | ![Kies](../generated_assets/tiles/tile_gravel.png) |
| Lehm | 2 Hits | Lehm | Bröckelig | Oberfläche | ![Lehm](../generated_assets/tiles/tile_clay.png) |

---

## 🪨 Kategorie: Gestein (Normal)

| Block | Härte | Drops | Besonderheit | Spawn | Tile (48x48) |
|-------|-------|-------|--------------|-------|--------------|
| Stein | 3 Hits | Stein | Standard | Überall | ![Stein](../generated_assets/tiles/tile_stone.png) |
| Granit | 5 Hits | Granit | Hart | Mittlere Tiefe | ![Granit](../generated_assets/tiles/tile_granite.png) |
| Marmor | 4 Hits | Marmor | Weiß, dekorativ | Mittlere Tiefe | ![Marmor](../generated_assets/tiles/tile_marble_block.png) |
| Schiefer | 4 Hits | Schiefer | Blättrig | Mittlere Tiefe | ![Schiefer](../generated_assets/tiles/tile_slate.png) |
| Basalt | 6 Hits | Basalt | Dunkel, vulkanisch | Tiefe | ![Basalt](../generated_assets/tiles/tile_basalt.png) |

---

## ⚙️ Kategorie: Metall (Erze)

| Block | Härte | Drops | Wert | Spawn | Tile (48x48) |
|-------|-------|-------|------|-------|--------------|
| Eisen-Ader | 5 Hits | Eisen | 5 Cr | Flach-Mittel | ![Eisen](../generated_assets/tiles/tile_iron.png) |
| Kupfer-Ader | 4 Hits | Kupfer | 3 Cr | Flach-Mittel | ![Kupfer](../generated_assets/tiles/tile_copper.png) |
| Silber-Ader | 6 Hits | Silber | 15 Cr | Mittel | ![Silber](../generated_assets/tiles/tile_silver.png) |
| Gold-Ader | 5 Hits | Gold | 25 Cr | Mittel-Tief | ![Gold](../generated_assets/tiles/tile_gold.png) |
| Platin-Ader | 8 Hits | Platin | 50 Cr | Tief | ![Platin](../generated_assets/tiles/tile_platinum.png) |
| Metall-Ader | 8 Hits | Metall | 10 Cr | Mittel | ![Metall](../generated_assets/tiles/tile_metal_ore.png) |

---

## 💎 Kategorie: Edelsteine (Wertvoll)

| Block | Härte | Drops | Wert | Effekt | Spawn | Tile (48x48) |
|-------|-------|-------|------|--------|-------|--------------|
| Rubin | 4 Hits | Rubin | 30 Cr | Rot glühend | Mittel | ![Rubin](../generated_assets/tiles/tile_ruby.png) |
| Saphir | 4 Hits | Saphir | 30 Cr | Blau glühend | Mittel | ![Saphir](../generated_assets/tiles/tile_sapphire.png) |
| Smaragd | 4 Hits | Smaragd | 35 Cr | Grün glühend | Mittel-Tief | ![Smaragd](../generated_assets/tiles/tile_emerald.png) |
| Diamant | 6 Hits | Diamant | 100 Cr | Funkelnd | Tief | ![Diamant](../generated_assets/tiles/tile_diamond.png) |

---

## ✨ Kategorie: Magisch (Spezialeffekte)

| Block | Härte | Drops | Besonderheit | Effekt beim Abbau | Spawn | Grafik |
|-------|-------|-------|--------------|-------------------|-------|--------|
| Mondstein | 3 Hits | Mondstein | Silbern | Leuchtet im Dunkeln | Flach | ![Mondstein](../generated_assets/tiles/tile_moonstone.png) |
| Sonnenstein | 4 Hits | Sonnenstein | Goldgelb warm | **+5 Energie** | Mittel | ![Sonnenstein](../generated_assets/tiles/tile_sunstone_ore.png) |
| Seelenstein | 5 Hits | Seelenstein | Lila nebelig | **Heilt 10 HP** | Mittel | ![Seelenstein](../generated_assets/tiles/tile_soulstone.png) |
| Schatten-Erz | 7 Hits | Schatten-Erz | Licht absorbierend | Erzeugt Dunkelheit | Mittel-Tief | ![Schatten](../generated_assets/tiles/tile_shadow_ore.png) |
| Licht-Kristall | 3 Hits | Licht-Kristall | Strahlend hell | **+Sichtweite 5s** | Mittel | ![Licht](../generated_assets/tiles/tile_light.png) |
| Echo-Stein | 6 Hits | Echo-Stein | Resonierend | Zeigt Kisten an | Mittel-Tief | ![Echo](../generated_assets/tiles/tile_echo_ore.png) |
| Zeit-Sand | 2 Hits | Zeit-Sand | Golden fließend | **Cooldown -50% 10s** | Mittel | ![Zeit](../generated_assets/tiles/tile_time.png) |

---

## 🌌 Kategorie: Exotisch (Sehr selten)

| Block | Härte | Drops | Wert | Besonderheit | Spawn | Grafik |
|-------|-------|-------|------|--------------|-------|--------|
| Meteorit | 12 Hits | Meteorit | 80 Cr | Außerirdisch | Tief | ![Meteorit](../generated_assets/tiles/tile_meteorite.png) |
| Obsidian | 15 Hits | Obsidian | 20 Cr | Extrem hart | Tief | ![Obsidian](../generated_assets/tiles/tile_obsidian.png) |
| Prisma-Stein | 8 Hits | Prisma | 70 Cr | Regenbogen | **Zufälliger Effekt!** | Tief | ![Prisma](../generated_assets/tiles/tile_prisma.png) |
| Lebendes Gestein | 10 Hits | Bio-Masse | 90 Cr | Organisch | **Heilt sich selbst nach 30s** | Tief | ![Lebendes Gestein](../generated_assets/tiles/tile_living.png) |
| Spiegel-Block | 5 Hits | Spiegel-Scherben | 15 Cr | Reflektierend | **Laser reflektieren** | Mittel | ![Spiegel](../generated_assets/tiles/tile_mirror.png) |
| Eis-Kristall | 4 Hits | Eis-Kristall | 25 Cr | Eisig | **Verlangsamt Bewegung** | Mittel-Tief | ![Eis](../generated_assets/tiles/tile_ice.png) |
| Magma-Block | 8 Hits | Magma | 30 Cr | Flüssig, heiß | **Schaden beim Berühren** | Tief | ![Magma](../generated_assets/tiles/tile_magma.png) |

---

## ⚠️ Kategorie: Gefährlich

| Block | Härte | Drops | Effekt | Spawn | Grafik |
|-------|-------|-------|--------|-------|--------|
| Spreng-Stein | 3 Hits | — | **EXPLODIERT beim Abbau!** | Mittel | ![Sprengstein](../generated_assets/tiles/tile_explosive.png) |
| Quantum-Stein | 12 Hits | Quantum-Erz | **Teleportiert Spieler 1-3 Blöcke** | Core-Nähe | ![Quantum](../generated_assets/tiles/tile_quantum.png) |
| Void-Fragment | 20 Hits | Void-Splitter | Extrem selten, extrem wertvoll | Core-Rand | ![Void](../generated_assets/tiles/tile_void.png) |

---

## 🔋 Kategorie: Nutzbar

| Block | Härte | Drops | Verwendung | Spawn | Tile (48x48) |
|-------|-------|-------|------------|-------|--------------|
| Energie-Kristall | 3 Hits | Kristall | Treibstoff (+5) | Überall | ![Kristall](../generated_assets/tiles/tile_crystal.png) |
| Anti-Materie | 10 Hits | Anti-Materie | Crafting | Tief | ![Antimaterie](../generated_assets/tiles/tile_antimatter.png) |
| Sternen-Staub-Ader | 6 Hits | Sternen-Staub | Legendär | Core-Nähe | ![Sternenstaub](../generated_assets/tiles/tile_stardust.png) |

---

## 🚫 Kategorie: Unzerstörbar

| Block | Härte | Drops | Verwendung | Tile (48x48) |
|-------|-------|-------|------------|--------------|
| Bedrock | ∞ | — | Level-Grenze | ![Bedrock](../generated_assets/tiles/tile_bedrock.png) |

---

## 🌍 Spawn-Verteilung nach Tiefe

### Oberfläche (0-50m)
```
40% Erde
20% Sand
15% Kies
10% Lehm
10% Stein
4% Eisen/Kupfer
1% Mondstein
```

### Mittlere Tiefe (50-200m)
```
20% Stein
15% Granit/Marmor/Schiefer
15% Metalle (Eisen, Kupfer, Silber)
10% Gold
8% Edelsteine (Rubin, Saphir)
10% Magische (Sonnenstein, Seelenstein, Licht)
8% Basis (Erde, Sand)
4% Spiegel, Eis
5% Kristalle
5% Sonstiges
```

### Tiefe (200-400m)
```
15% Basalt
15% Obsidian
20% Metalle (Gold, Platin, Metall)
10% Diamant
10% Magische (Schatten, Echo, Zeit)
15% Exotisch (Meteorit, Prisma, Lebendig)
8% Magma, Eis
5% Kristalle
2% Anti-Materie
```

### Core-Nähe (400m+)
```
10% Obsidian
10% Anti-Materie
20% Sternen-Staub
15% Void-Fragment
15% Quantum-Stein
10% Magma
10% Diamant/Platin
5% Kristalle
5% Legendäres
```

---

## 🎨 Grafik-Anforderungen

### Priorität 1 (MVP)
- [ ] Erde
- [ ] Stein
- [ ] Eisen-Ader
- [ ] Kristall
- [ ] Bedrock

### Priorität 2 (Early Game)
- [ ] Sand
- [ ] Kies
- [ ] Granit
- [ ] Kupfer-Ader
- [ ] Gold-Ader
- [ ] Rubin
- [ ] Spreng-Stein

### Priorität 3 (Mid Game)
- [ ] Alle übrigen Metalle
- [ ] Alle Edelsteine
- [ ] Magische Blöcke
- [ ] Exotische Blöcke

### Priorität 4 (Polish)
- [ ] Animationen (glühen, pulsieren)
- [ ] Partikeleffekte
- [ ] Zerstörungs-Animationen

---

**Legende:**
- ⏳ = Noch nicht erstellt
- ✅ = Fertig
- 🔄 = In Arbeit

*Letzte Aktualisierung: 2026-02-22*
