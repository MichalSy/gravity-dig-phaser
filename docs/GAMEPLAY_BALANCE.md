# Gameplay-Balancing und Sichtfeld

Stand: 2026-07-15

Dieses Dokument beschreibt das aktive Phaser/TypeScript-Verhalten. Verbindliche Datenquellen sind:

- `apps/game/public/scripts/PlayerState/catalogs/items.ts`
- `apps/game/public/scripts/PlayerState/catalogs/upgrades.ts`
- `apps/game/src/game/nodes/VisibilityFieldNode.ts`

Die Dokumente unter `docs/godot/` bleiben ergänzende Designhistorie und sind nicht die technische Source of Truth.

## Balancing-Ziele

Die erste Upgradeentscheidung soll nach wenigen erfolgreichen Cargo-Fahrten möglich sein. Weitere Stufen sollen merklich länger dauern, ohne dass frühe Standardressourcen wertlos werden.

Ausgangslage:

- 2 Cargo-Slots
- 3 Items pro Slot
- 6 Items pro voller Starter-Fahrt
- erwarteter Early-Game-Mix: ungefähr 24 Credits pro voller Fahrt

Zielwerte für die erste Stufe:

| Upgrade | Kosten | Fahrten bei 24 Cr/Fahrt |
|---|---:|---:|
| Tempo I | 60 Cr | 2,5 |
| Cargo-Slots I | 75 Cr | 3,1 |
| Cargo-Slot-Größe I | 90 Cr | 3,8 |

Die Fahrtenwerte sind Orientierungswerte. Erzvorkommen, Weglänge und nicht vollständig gefüllte Cargo-Slots verändern die reale Dauer.

## Ressourcenwerte

Jeder zerstörte, droppende Block erzeugt weiterhin genau ein sammelbares Item. Das neue Balancing erhöht deshalb den Creditwert statt die Itemmenge und hält Cargo- sowie Pickup-Logik übersichtlich.

| Ressource | Wert |
|---|---:|
| Erde | 0 Cr; kein Weltdrop |
| Sand | 2 Cr |
| Lehm | 2 Cr |
| Kies | 2 Cr |
| Stein | 2 Cr |
| Basalt | 4 Cr |
| Kupfer | 6 Cr |
| Eisen | 10 Cr |
| Gold | 30 Cr |
| Diamant | 100 Cr |

## Aktive Upgrade-Kurven

### Tempo

Basistempo: `470` interne Einheiten. In der UI werden ausschließlich verständliche Prozentboni angezeigt.

| Stufe | Internes Tempo | Bonus zum Start | Kosten |
|---|---:|---:|---:|
| Start | 470 | +0 % | — |
| Servo-Antrieb I | 489 | +4 % | 60 Cr |
| Servo-Antrieb II | 508 | +8 % | 180 Cr |
| Servo-Antrieb III | 526 | +12 % | 420 Cr |

Die Stufen sind kumulative Zielwerte und keine jeweils erneut addierten 4 Prozent. Die erste Stufe wurde bewusst von etwa +11 Prozent auf +4 Prozent reduziert.

### Anzahl Cargo-Slots

| Stufe | Slots | Kosten |
|---|---:|---:|
| Start | 2 | — |
| Erweiterter Laderaum I | 3 | 75 Cr |
| Erweiterter Laderaum II | 4 | 225 Cr |
| Erweiterter Laderaum III | 5 | 525 Cr |

### Cargo-Slot-Größe

| Stufe | Items pro Slot | Kosten |
|---|---:|---:|
| Start | 3 | — |
| Cargo-Slot-Größe I | 5 | 90 Cr |
| Cargo-Slot-Größe II | 8 | 260 Cr |
| Cargo-Slot-Größe III | 12 | 600 Cr |

## Sichtfeld und Shadow

Das aktive Sichtfeld wird durch den hierarchischen `VisibilityFieldNode` erzeugt:

```text
Gameplay
├── GameRoot
│   ├── Level
│   ├── World
│   │   └── LootLayer
│   └── VisibilityField
└── UIRoot
```

Es werden keine statischen Depth-/Z-Index-Werte für diese Reihenfolge verwendet. Der Shadow liegt als eigenes Scene-Node-Overlay hinter dem `UIRoot`; HUD und Touchcontrols bleiben dadurch lesbar.

### Darstellung

- außerhalb des Sichtfelds: nahezu vollständig dunkler Shadow (`98,5 %`)
- Startsichtweite: `3 Tiles` beziehungsweise `288 px`
- voller, klarer Innenbereich bis etwa `42 %` des Radius
- weicher radialer Übergang bis zum Außenradius
- Visier-Upgrades verwenden den bestehenden `sightRadius`-Stat und vergrößern den Radius auf 4–7 Tiles

### Bewegungstrail und Fade

Während der Bewegung werden Sichtpunkte entlang des gelaufenen Weges gesammelt:

- neuer Punkt nach ungefähr `0,3 Tiles` Bewegung
- Trailradius: `82 %` des aktuellen Sichtfeldradius
- Lebensdauer: `2,2 Sekunden`
- nichtlinearer Alpha-Fade für ein weiches Ausblenden
- Maskenrefresh alle `80 ms`
- Canvas-Maske intern mit `50 %` Auflösung und bilinear auf die Spielfläche skaliert

Der aktuelle Spielerradius bleibt vollständig sichtbar. Zurückliegende Bereiche werden schrittweise wieder vom Shadow verdeckt, statt hart an einer Tilekante zu verschwinden.

### Performance

Das Overlay verwendet eine einzelne CanvasTexture und ein einzelnes Phaser-Image. Die CanvasTexture wird gedrosselt aktualisiert; es werden keine Shadow-Objekte pro Tile angelegt. Dadurch bleiben Objektanzahl und Draw-Calls auch auf Smartphones stabil.

## Weiteres Tuning

Bei neuen Upgrades oder Ressourcen gelten folgende Leitlinien:

1. Die erste relevante Verbesserung einer Familie kostet ungefähr 3–4 sinnvolle Early-Game-Fahrten.
2. Eine Folgestufe kostet ungefähr das 2,5- bis 3-Fache der vorherigen Stufe.
3. Tempoänderungen werden in kleinen, kontrollierbaren Schritten von ungefähr 4 Prozent vorgenommen.
4. Ressourcenwert, Cargo-Kapazität und Upgradepreis werden gemeinsam betrachtet; einzelne Werte dürfen nicht isoliert hochskaliert werden.
5. Sichtweite wird in Tiles dokumentiert und nicht über feste Render-Depths umgesetzt.
