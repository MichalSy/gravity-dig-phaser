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
- empirisch erwarteter Early-Game-Mix: ungefähr 18 Credits pro voller Fahrt

Zielwerte für die erste Stufe:

| Upgrade | Kosten | Fahrten bei 18 Cr/Fahrt |
|---|---:|---:|
| Tempo I | 60 Cr | 3,3 |
| Cargo-Slots I | 75 Cr | 4,2 |
| Cargo-Slot-Größe I | 90 Cr | 5,0 |

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

## Sternenkarte (Skillbaum)

Die Schiffsoberfläche zeigt eine bildschirmfüllende, frei navigierbare Weltraumkarte mit **53 Skills**: dem `Prospektor-Kern` sowie vier farbigen Konstellationen mit je 13 Stufen. Jeder Stern ist nur aktivierbar, wenn sein direkter Vorgänger installiert wurde. Käufe und Voraussetzungen werden dauerhaft im Profil gespeichert.

Alle 53 Sterne liegen gleichzeitig in einem großen zusammenhängenden Forschungsraum. Die Karte lässt sich mit Maus oder Touch ziehen, per Mausrad beziehungsweise Zwei-Finger-Geste zoomen und jederzeit auf die Gesamtansicht zurücksetzen. Größere Knoten markieren Meilensteine. Aktive Verbindungen leuchten in der Farbe ihres Forschungszweigs. Ein Stern wird zuerst ausgewählt; Name, Beschreibung, Voraussetzung und Kosten erscheinen anschließend im Detailpanel. Erst der separate Aktivieren-Button kauft den Skill. Die Zustände sind zusätzlich zur Farbe geometrisch erkennbar: aktivierte Sterne besitzen einen hellen Kern, kaufbare Sterne einen zusätzlichen Außenring, gesperrte Sterne bleiben dunkel.

| Ast | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| Bewegung | Federstiefel: +12 % Sprunghöhe | Mikro-Jetpack: 1 Luftsprung | Raketenhose: 2 Luftsprünge, 28 % weniger Schwerkraft |
| Sicht | Weitwinkel-Visier: Sicht 3 | Erz-Scanner: Erzmarkierungen Radius 4 | Röntgen-Kartoffel: Scanner 7, +1 Sicht |
| Mining | Laser-Fokus: +25 % Schaden | Kettenblitz: 2 Nachbarblöcke | Gewitter-Abo: 4 Nachbarblöcke, +15 % Schaden |
| Utility | Cargo-Tetris: +1 Slot | Taschen-Wurmloch: +3 Stack, Magnet 140 px | Goldene Gummiente: +25 Leben, Magnet 220 px, -15 % Schwerkraft |

### Ungewöhnliche Tiers 4–13

| Tier | Bewegung | Sicht | Mining | Utility |
|---:|---|---|---|---|
| 4 | Mondlauf-Versicherung | Spektrum-Monokel | Lichtbogen-Lehrling | Notfall-Banane |
| 5 | Decken-Verhandler | Kupfer-Klatschfunk | Erz-Mixer | Cargo-Origami |
| 6 | Turbo-Schnecke | Nebel-Rabattcoupon | Laser-Spaghetti | Hosentaschen-Dimension |
| 7 | Chrono-Schnürsenkel | Geologie-Karaoke | Donner-Frettchen | Gewerkschafts-Nanobots |
| 8 | Hüpfsteuer-Rückzahlung | Schrödingers Karte | Steuerflucht-Bohrer | Loot-Bumerang |
| 9 | Antigrav-Sandwich | Bürokratie-Röntgen | Plasma-Fondue | Meteoriten-Versicherungsbetrug |
| 10 | Panik-Teleporter | Prophetische Brotkrumen | Rekursive Spitzhacke | Tragbare Schiffswerft |
| 11 | Kometen-Kniescheiben | Seismischer Klatsch | Koffein-Strahl | Kosmischer Staubsauger |
| 12 | Quantum-Himmel-und-Hölle | Allwissender Toaster | Lokale Apokalypse | Administrative Unsterblichkeit |
| 13 | Schwerkraft deinstallieren | Planet ohne Privatsphäre | Planet deabonnieren | Realität Premium |

Die ungewöhnlichen Skills kombinieren bewusst normalerweise getrennte Systeme. Beispiele: Der `Steuerflucht-Bohrer` koppelt Laserschaden mit Cargo-Stackgröße, `Geologie-Karaoke` verbindet Scanner und Energieregeneration, `Loot-Bumerang` koppelt Magnet und Laserreichweite, und `Realität Premium` ist ein teures Multi-System-Endgamepaket. Alle Boni verändern reale effektive Stats und sind keine reinen Flavor-Texte.

Der Kern kostet `50 Cr`. Die ersten drei Tiers kosten ungefähr `100–1100 Cr`; die späteren Endgame-Tiers steigen bis `30.000 Cr`. Der Vollausbau aller 53 Skills kostet `415.325 Cr`. Farbcodierung: Grün Bewegung, Blau Sicht, Pink Mining, Lila Utility.

Besondere Laufzeitwirkungen:

- Luftsprünge werden bei Bodenkontakt wieder aufgefüllt.
- Scannerrahmen werden oberhalb des Fog gerendert und pulsieren in der Materialfarbe.
- Kettenblitze räumen echte benachbarte Blöcke, erzeugen Drops und besitzen einen sichtbaren Blitzpfad.
- Der Beutemagnet vergrößert den realen Einsammelradius und zieht Drops zum Player.
- Alte lineare Upgrades bleiben für bestehende Savegames kompatibel, werden aber nicht mehr als primäre Shopoberfläche angeboten.

## Kompatible lineare Upgrade-Kurven

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

## Energie und Lebenserhaltung

Außerhalb des Schiffs verbraucht die Lebenserhaltung kontinuierlich `1,5 Energie/Sekunde`. Eine Standardbatterie mit 100 Energie reicht ohne Mining ungefähr `66,7 Sekunden`. Mining benötigt zusätzlich `12 Energie/Sekunde`; die Kosten werden gleichzeitig berechnet.

Im Dock wird keine Lebenserhaltungsenergie abgezogen. Stattdessen lädt das Schiff mit `18 Energie/Sekunde`, sodass eine vollständig leere Standardbatterie nach ungefähr `5,6 Sekunden` wieder voll ist. Bei 0 Energie kann nicht weiter gemined werden; der Spieler muss zum Schiff zurückkehren.

## Einheitliche Ressourcen-Icons

Drops in der Welt, fliegende Cargo-Transferobjekte und belegte Cargo-Slots verwenden denselben kanonischen Asset-Key `item-<itemId>`. Die HUD-Slots tauschen ihr Bildasset beim Itemwechsel aus; Ressourcen werden nicht mehr als identisches Rock-Icon mit unterschiedlichen Tints dargestellt.

## Sichtfeld und Shadow

Das aktive Sichtfeld wird durch den hierarchischen `VisibilityFieldNode` erzeugt:

```text
Gameplay
├── GameRoot
│   ├── Level
│   ├── World
│   │   └── LootLayer
│   ├── EffectsLayer
│   └── VisibilityField
└── UIRoot
```

Es werden keine statischen Depth-/Z-Index-Werte für diese Reihenfolge verwendet. Miningpartikel und Cargo-Flüge gehören explizit in den `EffectsLayer`; der Shadow folgt danach und liegt vor dem `UIRoot`. HUD und Touchcontrols bleiben dadurch lesbar.

### Darstellung

- vollständig erkundete Gridfelder innerhalb der Sichtweite: kein Shadow (`0 %`)
- Startsichtweite: `2` Tiles Radius; diese Felder werden vollständig und dauerhaft aufgedeckt
- dritter Tile-Ring vom Player: `30 %` Shadow
- vierter Tile-Ring vom Player: `60 %` Shadow
- ab dem fünften Tile-Ring: nahezu vollständig dunkler Shadow (`98,5 %`, visuell 100 %)
- die Fog-Grenzen folgen exakt dem Weltgrid und bewegen sich gemeinsam mit der Tilemap
- keine viewportbezogene Maskenprojektion
- Visier-Upgrades verwenden den bestehenden `sightRadius`-Stat und vergrößern den Radius auf 3–6 Tiles

### Dauerhaft erkundete Bereiche

Beim Betreten eines neuen Tiles wird das kreisförmige Grid-Sichtfeld als erkundet markiert:

- jede erreichte Shadowstufe wird pro Tile gespeichert: `g60:` für maximal 60 %, `g30:` für maximal 30 % und `g:` für vollständig aufgedeckt
- ein Tile darf ausschließlich heller werden (`100 → 60 → 30 → 0`), niemals wieder dunkler
- beim Weglaufen bleibt deshalb ein einmal mit 30 % sichtbares Tile bei höchstens 30 %; es springt nicht auf 60 % oder 100 % zurück
- vollständig erkundete Bereiche bleiben dauerhaft vollständig hell (`0 %` Shadow)
- Saves aus Game `1.0.450–1.0.451` werden automatisch vom alten Mittelpunktformat ins Gridformat migriert
- der Zustand wird mit dem aktiven Run gespeichert und nach erneutem Laden desselben Runs wiederhergestellt

Das Sichtfeld erweitert sich nur beim Wechsel in ein anderes Tile. Neu erkundete Felder übernehmen für die Reveal-Animation exakt ihre unmittelbar vorher sichtbare Shadowstufe. Ein Feld aus dem dritten Ring animiert also von `30 %` zu `0 %`, ein Feld aus dem vierten Ring von `60 %` zu `0 %`; es springt niemals zurück auf 100 % Shadow. Der vorhandene Shadow wird über `360 ms` transparenter und zieht sich mit Ease-out zum Mittelpunkt des Tiles zusammen. Vollständig aufgedeckte Felder bleiben anschließend dauerhaft ohne Shadow.

### Performance

Das Overlay verwendet zwei weltverankerte Phaser-`Graphics`-Objekte: eine statische Fogfläche und eine kleine Animationsfläche. Die statische Ebene zeichnet nur die aktuell sichtbaren, noch nicht erkundeten Gridfelder plus zwei Padding-Tiles und wird ausschließlich bei einem Tile- oder Viewportzellenwechsel neu aufgebaut. Während der kurzen Reveal-Animation wird nur die zweite Ebene mit den gerade verschwindenden Tiles aktualisiert. Es gibt keine CanvasTexture-Uploads, radialen Gradienten oder `80 ms`-Projektionssprünge mehr.

## Weiteres Tuning

Bei neuen Upgrades oder Ressourcen gelten folgende Leitlinien:

1. Die erste relevante Verbesserung einer Familie kostet ungefähr 3–4 sinnvolle Early-Game-Fahrten.
2. Eine Folgestufe kostet ungefähr das 2,5- bis 3-Fache der vorherigen Stufe.
3. Tempoänderungen werden in kleinen, kontrollierbaren Schritten von ungefähr 4 Prozent vorgenommen.
4. Ressourcenwert, Cargo-Kapazität und Upgradepreis werden gemeinsam betrachtet; einzelne Werte dürfen nicht isoliert hochskaliert werden.
5. Sichtweite wird in Tiles dokumentiert und nicht über feste Render-Depths umgesetzt.
