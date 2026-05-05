# Gravity Dig Monorepo

Gravity Dig is a TypeScript monorepo with three deployable apps:

- `apps/game` - Phaser + Vite game client
- `apps/editor` - Next.js/React debug editor
- `apps/relay` - small Node.js WebSocket debug relay
- `packages/debug-protocol` - shared debug message types

Live targets:

- Game: `https://gravity-dig-phaser.sytko.de`
- Debug editor: `https://gravity-dig-debug.sytko.de`
- Debug relay: `wss://gravity-dig-relay.sytko.de/debug`

## Current playable state

Controls:

- `A/D` or arrow keys: move
- `W` / `Space`: jump
- Left mouse button: laser mine a block in range
- `E` near the ship: secure/sell run cargo and refill suit energy

Implemented:

- deterministic level generation from `dev_planet.json`
- terrain, boundaries, spawn clearing and resource spawning
- tile rendering from the original generated atlas
- character animation frames from the Unity project copy
- simple collision, camera follow, HUD and persistent run cargo
- ship dock return loop: cargo is moved into permanent storage, sold for credits, and suit energy is refilled
- mineable blocks with health and laser feedback
- centralized player management for profile, run state, inventory, upgrades, perks and local savegames

## Monorepo layout

```text
apps/
├── game/                   # Phaser/Vite game
│   ├── public/             # static game assets/configs
│   └── src/
│       ├── main.ts         # Phaser bootstrap only
│       ├── config/         # tunables and dimensions
│       ├── controls/       # mobile/desktop control widgets
│       ├── input/          # input intent builders
│       ├── app/            # app roots/loading/menu nodes/views
│       ├── game/           # gameplay runtime/domain code
│       ├── player/         # profile, run state, inventory, savegame
│       ├── scenes/         # single Phaser scene adapter
│       ├── ui/             # HUD/touch-control nodes and layout
│       └── utils/          # small pure helpers
├── editor/                 # minimal Next.js debug editor smoke UI
└── relay/                  # Node.js WebSocket relay at /debug

packages/
└── debug-protocol/         # shared message/types package
```

## Debug smoke flow

The first debug milestone is intentionally tiny:

1. Start relay: `npm run dev:relay`
2. Start editor: `npm run dev:editor`
3. Open editor and connect to `ws://localhost:8787/debug` with a generated `debugSession`.
4. Use the editor button to open the game with `?debug=1&debugSession=<id>&debugRelay=<relay-url>`.
5. The game registers as role `game`; the editor registers as role `editor`; matching `debugSession` pairs them through the relay.

`?debug=0` disables the persisted game debug connection. The relay exposes `/health` for Kubernetes probes.

## Source migration notes

### Godot source

- Original docs: `docs/godot/`
- Godot project docs: `docs/godot-project/`
- Archived README/version: `docs/archive/godot/`
- Planet configs: `apps/game/public/config/planets/`

### Unity source

- Archived README/migration plan: `docs/archive/unity/`
- Authored Unity sprites copied into `apps/game/public/assets/`
- Unity `.meta` files are intentionally removed and ignored.

The C# gameplay code is treated as reference only; Phaser/TypeScript is the canonical implementation path from here.

## Architecture rules

- `apps/game/src/main.ts` stays thin.
- New runtime behavior belongs in one node per file; avoid multi-node catch-all files.
- Player progress/state belongs in `apps/game/src/player/`, not directly in `AppScene`.
- Engine-facing orchestration stays in `scenes/AppScene.ts`; app/game/UI flow belongs in runtime nodes.
- Pure/domain logic lives outside nodes where practical: level pipeline, input intents, physics, mining, world geometry, UI layout.
- Assets/configs stay in `apps/game/public/` so they are deployable as static files.

## Development

```bash
npm install
npm run dev:game
npm run dev:editor
npm run dev:relay
npm run build
```

## Deployment

GitHub Actions builds three GHCR images:

- `ghcr.io/michalsy/gravity-dig-phaser.aikogame`
- `ghcr.io/michalsy/gravity-dig-phaser.debug-editor`
- `ghcr.io/michalsy/gravity-dig-phaser.debug-relay`

GitOps/ArgoCD apps:

- `gravity-dig-phaser`
- `gravity-dig-editor`
- `gravity-dig-relay`

## Player Management

The current canonical player-state architecture is documented in `docs/godot/PLAYER_MANAGEMENT.md`. In short: permanent progression lives in `PlayerProfile`, active expedition state lives in `RunState`, and gameplay consumes `EffectivePlayerStats` computed from upgrades/perks. Savegames currently use versioned `localStorage` key `gravity-dig-save-v1`.
