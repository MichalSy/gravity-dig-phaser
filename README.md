# Gravity Dig Phaser

Phaser + TypeScript is now the target stack for Gravity Dig.

This repo started as a minimal web spike and now contains the migrated baseline from the old Godot and Unity experiments:

- Godot level generation concepts ported to TypeScript
- Godot/Unity tile, UI, ship, effect and character assets copied into `public/assets/`
- Planet configs copied into `public/config/planets/`
- Original design and migration docs archived under `docs/`
- Web-first deployment via Docker/nginx, GHCR, GitOps and ArgoCD

Live demo:

`https://gravity-dig-phaser.sytko.de`

## Current playable state

Controls:

- `A/D` or arrow keys: move
- `W` / `Space`: jump
- Left mouse button: laser mine a block in range
- `G`: toggle gravity debug mode
- `R`: regenerate world with a new seed

Implemented:

- deterministic level generation from `dev_planet.json`
- terrain, boundaries, spawn clearing and resource spawning
- tile rendering from the original generated atlas
- character animation frames from the Unity project copy
- simple collision, camera follow, HUD and persistent run cargo
- mineable blocks with health and laser feedback
- centralized player management for profile, run state, inventory, upgrades, perks and local savegames

## Source migration notes

### Godot source

- Original docs: `docs/godot/`
- Godot project docs: `docs/godot-project/`
- Archived README/version: `docs/archive/godot/`
- Planet configs: `public/config/planets/`

### Unity source

- Archived README/migration plan: `docs/archive/unity/`
- Authored Unity sprites copied from `unity-project/Assets/Sprites/` into `public/assets/`

Unity did contain useful extra work versus the Godot repo:

- Unity C# ports of `PlayerController`, `LevelGenerator`, `GameManager`, `UIManager`, `HUD`, `TitleScreen`
- a built WebGL output
- full character animation frames and rotations
- the same generated tile/UI/device/icon asset set already organized for engine import

The C# gameplay code is treated as reference only; Phaser/TypeScript is the canonical implementation path from here.

## Architecture

```text
src/
├── main.ts                 # Phaser bootstrap only
├── config/gameConfig.ts    # Tunables and dimensions
├── controls/               # Mobile/desktop input helpers
├── game/level.ts           # Deterministic world generation + level types
├── player/                 # Profile, run state, inventory, upgrades, perks, savegame
├── scenes/GameScene.ts     # Phaser scene orchestration
└── utils/                  # Small pure helpers
```

Rules:

- `main.ts` stays thin.
- New gameplay belongs in systems/modules, not in bootstrap.
- Player progress/state belongs in `src/player/`, not directly in `GameScene`.
- Engine-facing orchestration stays in `scenes/`.
- Pure logic stays independent from Phaser where practical.
- Assets/configs stay in `public/` so they are deployable as static files.

## Development

```bash
npm install
npm run dev
npm run build
```

## Deployment

GitHub Actions builds a Docker image to GHCR:

`ghcr.io/michalsy/gravity-dig-phaser.aikogame`

GitOps/ArgoCD deploy target:

`https://gravity-dig-phaser.sytko.de`

## Player Management

The current canonical player-state architecture is documented in `docs/godot/PLAYER_MANAGEMENT.md`. In short: permanent progression lives in `PlayerProfile`, active expedition state lives in `RunState`, and gameplay consumes `EffectivePlayerStats` computed from upgrades/perks. Savegames currently use versioned `localStorage` key `gravity-dig-save-v1`.
