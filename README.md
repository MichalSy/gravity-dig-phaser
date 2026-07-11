# Gravity Dig Monorepo

Gravity Dig is a TypeScript monorepo with two deployable apps:

- `apps/game` - Phaser + Vite game client
- `apps/editor` - Next.js/React debug editor plus server-side file/Git backend
- `packages/debug-protocol` - shared debug message types

Live targets:

- Game: `https://gravity-dig-phaser.sytko.de`
- Debug editor: `https://gravity-dig-debug.sytko.de`

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
└── editor/                 # Next.js debug editor + server-only backend APIs

packages/
└── debug-protocol/         # shared message/types package
```

## Debug smoke flow

Debug flow:

1. Start editor: `npm run dev:editor`
2. Open editor; it generates a `debugSession` and embeds the game with `?debug=1&debugSession=<id>&debugEditorApi=<editor-origin>`.
3. Editor and embedded game communicate directly via `postMessage`; there is no WebSocket relay in the debug path.
4. The game sends `node:tree`, `node:delta`, `node:props`, asset, and exposed-prop metadata to the editor.
5. Editor UI patches go to the embedded game through `postMessage` for live preview. Persisting those changes is handled by the editor's own Next.js API under `/api/editor/*`.

`?debug=0` disables the persisted game debug connection.

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

## Debug editor backend model

- Browser clients never receive repository tokens or file-system paths beyond safe relative paths; the game only gets a client-safe `debugEditorApi` origin for preview reads.
- `apps/editor` owns backend responsibilities: pending debug changes, safe file APIs, Git status, commit and push workflow.
- `apps/editor/src/server/*` is server-only. It validates relative paths, blocks traversal, and only writes under allowlisted repository roots.
- Main editor APIs:
  - `GET|POST|DELETE /api/editor/changes/:sessionId`
  - `POST /api/editor/git/save/:sessionId`
  - `GET /api/editor/git/status`
  - `GET|PUT /api/editor/files?path=<repo-relative-path>`
  - `POST /api/editor/assets/upload/:sessionId`

Server-side editor environment:

```bash
EDITOR_GIT_REPO=https://github.com/MichalSy/gravity-dig-phaser.git
EDITOR_GIT_BRANCH=main
EDITOR_WORKSPACE=/tmp/gravity-dig-phaser-editor-workspace
EDITOR_ALLOWED_REPO_ROOTS=/tmp/gravity-dig-phaser-editor-workspace
EDITOR_GIT_AUTHOR_NAME="Gravity Dig Editor"
EDITOR_GIT_AUTHOR_EMAIL=editor@gravity-dig.local
GITHUB_TOKEN=... # required only for push
```

Client-safe environment remains `NEXT_PUBLIC_GAME_URL` only.

## Architecture rules

Current editor/public ScriptNode architecture and the completed 2026-07-11 migration are documented in [`docs/EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md`](docs/EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md).

- `apps/game/src/main.ts` stays thin.
- New runtime behavior belongs in one node per file; avoid multi-node catch-all files.
- Player progress/state belongs in `apps/game/src/player/`, not directly in `AppScene`.
- Engine-facing orchestration stays in `scenes/AppScene.ts`; app/game/UI flow belongs in runtime nodes.
- Pure/domain logic lives outside nodes where practical: level pipeline, input intents, physics, mining, world geometry, UI layout.
- Assets/configs stay in `apps/game/public/` so they are deployable as static files.
- Reusable gameplay/UI structures are JSON prefabs under `apps/game/public/prefabs/`.
- Editor-facing behaviors are public `.node.ts` scripts under `apps/game/public/scripts/`.
- Player and Ship are runtime prefab instances created by `GameWorldNode` after level generation, in deterministic Ship → Player order.
- Runtime-created trees carry explicit origin metadata and appear as `RUNTIME` in the Hierarchy Explorer.
- Image rendering uses typed asset records (`ImageAsset`, `FrameAsset`, `ImageAnimationAsset`) resolved by `AssetCatalog`; nodes consume assets instead of parsing atlas metadata themselves.

## Development

```bash
npm install
npm run dev:game
npm run dev:editor
npm run build
```

## Deployment

GitHub Actions builds two GHCR images:

- `ghcr.io/michalsy/gravity-dig-phaser.aikogame`
- `ghcr.io/michalsy/gravity-dig-phaser.debug-editor`

GitOps/ArgoCD apps:

- `gravity-dig-phaser`
- `gravity-dig-editor`

## Player Management

The current canonical player-state architecture is documented in `docs/godot/PLAYER_MANAGEMENT.md`. In short: permanent progression lives in `PlayerProfile`, active expedition state lives in `RunState`, and gameplay consumes `EffectivePlayerStats` computed from upgrades/perks. Savegames currently use versioned `localStorage` key `gravity-dig-save-v1`.
