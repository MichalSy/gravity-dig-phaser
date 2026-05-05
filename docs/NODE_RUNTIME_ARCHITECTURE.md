# Node Runtime Architecture

Gravity Dig uses Phaser for rendering and a small node runtime for gameplay orchestration.

## Core Rule

`AppScene` is the only Phaser scene and only acts as an engine adapter:

- preload menu assets
- create the app runtime/root nodes
- dynamically load gameplay assets when the menu requests start
- mount gameplay/UI nodes after assets are ready
- tick the runtime in `update()`

```ts
update(_time: number, deltaMs: number): void {
  this.appRuntime.update(deltaMs);
}
```

There is no custom render phase. Phaser renders GameObjects automatically after we mutate their state in `update()`.

## Why There Is No `render()` Method

The previous runtime had `render()` hooks, but the game does not render manually. Nodes call Phaser APIs such as:

- `image.setTexture(...)`
- `image.setPosition(...)`
- `graphics.clear()` / `graphics.strokeRect(...)`
- `text.setText(...)`
- `camera.setZoom(...)`

Those are normal update-side mutations of Phaser objects. Phaser's renderer draws the resulting scene graph. A separate node `render()` phase would be misleading unless the game first introduced a strict pure-state/sync-to-view architecture.

Current rule:

- `update(deltaMs)` owns simulation, input, and Phaser object synchronization.
- Phaser owns actual drawing.
- Do not add node `render()` methods unless we intentionally reintroduce a real state-to-view render pipeline.

## Runtime Lifecycle

Each `GameNode` supports:

1. `init(ctx)`
   - create Phaser objects
   - register event listeners
   - read Phaser cache/config
2. `resolve(ctx)`
   - require other nodes
   - validate dependencies have been registered
3. `update(deltaMs)`
   - perform simulation and sync Phaser objects
4. `destroy()`
   - remove listeners
   - destroy Phaser objects owned by the node

`NodeRuntime.update(deltaMs)` resolves lazily and then ticks persistent nodes followed by `NodeRoot` trees in `order`.

## Dependencies

Nodes declare required node names with `dependencies`:

```ts
export class MiningToolNode extends GameNode {
  override readonly dependencies = ['level', 'world', 'playerController', 'playerState', 'gameplayInput'] as const;
}
```

The base `GameNode` validates that dependencies exist before `resolve()` runs. This catches missing registrations early.

Important: current validation checks presence, not full cycle analysis. Keep node coupling low and prefer data/events over direct calls when possible.

## Node Data

Runtime state belongs in explicit `data` objects, not hidden scattered fields.

Examples:

- `PlayerControllerData`: velocity, grounded state, coyote timer, jump buffer, gravity toggle, input block flag
- `MiningToolData`: target, aim vectors, laser origin, gamepad aim
- `GameWorldData`: active level, player object, scene-owned decoration objects
- `ShipDockData`: prompt message and timer

Data factories live in:

```txt
src/game/nodeData.ts
```

Rules:

- Node data is runtime state.
- Save-game state remains in player/profile/run modules.
- Config/tuning remains constants or config files.
- Phaser GameObjects may be referenced by node data only when the node owns their lifecycle.

## Typed Game Events

String events are centralized in:

```txt
src/game/gameEvents.ts
```

Use:

```ts
emitGameEvent(scene, GAME_EVENTS.playerInteractRequested);
onGameEvent(scene, GAME_EVENTS.worldLevelCreated, handler, this);
offGameEvent(scene, GAME_EVENTS.worldLevelCreated, handler, this);
```

This keeps event names and payloads typed. Existing external emitters may still emit the same underlying string event names, but gameplay code should use the typed helpers.

## Pure Logic

Reusable decision logic lives outside the node classes:

```txt
src/game/gameplayLogic.ts      # gameplay decisions and view-model builders
src/game/level/                # deterministic level generation, tilemap view, collision helpers
src/game/mining/               # mining targeting, damage, and laser view
src/game/physics/              # movement/physics helpers
src/game/world/                # world geometry and decoration/player view factories
src/input/gameplayIntents.ts   # player/mining input intent builders
src/app/menu/                  # menu config/layout/view
src/ui/layout/                 # pure UI layout calculations
```

Current examples:

- `computePlayerAnimationState(...)`
- `buildHudState(...)`
- `buildShipDockPrompt(...)`
- `isAtShipDock(...)`
- `buildPlayerInputIntent(...)`
- `buildMiningInputIntent(...)`
- `computeBottomHudLayout(...)`
- `stepPlayerPhysics(...)`
- `findFirstMineableTile(...)`
- `worldBoundsForLevel(...)`
- `LevelTilemapView.draw(...)`
- `collidesBox(...)`

Guideline: if a rule can be expressed without Phaser object ownership, prefer a pure function or focused view/helper module and let the node orchestrate it.

## Image Assets and Display Nodes

Image loading is split into three responsibilities:

- `AssetLoader` queues Phaser files (`.webp`, optional `.webp.json` metadata).
- `AssetCatalog` resolves typed records such as `ImageAsset`, `FrameAsset`, and `ImageAnimationAsset`.
- Display nodes consume resolved assets; they do not parse file names or JSON metadata.

Asset ids use compact references:

```txt
player.webp          # whole image
player.webp#idle_01  # named frame from player.webp.json
player.webp@walk     # animation from player.webp.json
```

The first implementation keeps the current texture keys (`player-idle-0`, etc.) as valid `ImageAsset` ids while adding support for future `image.webp.json` atlas metadata. `ImageAssetKind` is an enum-like const object because the game tsconfig uses `erasableSyntaxOnly`, which rejects runtime TypeScript enums.

Display primitives live under `src/nodes/`:

- `TransformNode` — position/size/anchor/depth/scale base.
- `ImageNode` — renders either an `ImageAsset` or `FrameAsset`.
- `AnimatedImageNode` — plays an `ImageAnimationAsset` frame sequence.
- `DisplayNodeFactory` — small construction helper for display nodes.

## Node Layout

Every runtime node lives in its own file. Root nodes compose child nodes; large multi-node files are intentionally avoided.

```txt
src/app/loading/     # loading overlay view
src/app/menu/        # menu view/config/layout
src/app/nodes/       # app roots/state/menu/loading
src/game/level/      # level generation, tilemap view, collision helpers
src/game/mining/     # mining targeting, damage, laser view
src/game/nodes/      # gameplay/runtime/save nodes
src/game/physics/    # physics helpers
src/game/world/      # world geometry and view factories
src/input/           # input intent builders
src/ui/layout/       # UI layout calculators
src/ui/nodes/        # HUD and touch controls
src/nodes/           # node runtime primitives
```

Current gameplay nodes mounted under `GameplayRootNode`:

- `GameplayInputNode` — input mode, keyboard/touch/gamepad intent source
- `HudStateNode` — current HUD view model for UI rendering
- `LevelNode` — level data lifecycle plus tile/collision query facade
- `CameraZoomNode` — camera zoom sync
- `GameWorldNode` — level lifecycle, background/ship/core/player spawn, camera bounds/follow
- `PlayerNode` — player entity subtree (`playerController`, `playerPresentation`, `playerImage`)
- `PlayerControllerNode` — player input to movement/physics; no world reset or debug toggles
- `MiningToolNode` — mining input, laser, targeting, tile damage, crack overlays, block break handling
- `PlayerPresentationNode` — animation, facing, footsteps; drives `playerImage`
- `RunRecoveryNode` — energy recovery while not mining
- `HudNode` — writes the HUD view model into `HudStateNode`
- `ShipDockNode` — ship prompt and cargo return interaction
- `AutoSaveNode` — periodic active-run save

Persistent nodes:

- `PlayerStateManagerNode` — save/profile/run state
- `LevelGeneratorManagerNode` — planet config and pure level generation

UI nodes mounted under `GameplayUiRootNode`:

- `StatusHudNode`
- `BottomHudNode`
- `TouchControlsNode`

## Adding a New Node

1. Create exactly one node class per file, e.g. `src/game/nodes/MyNode.ts`.
2. Add a `data` object in `src/game/nodeData.ts` when the node owns runtime state.
3. Declare `dependencies` explicitly.
4. Register event listeners in `init()` and remove them in `destroy()`.
5. Resolve other nodes in `resolve()`.
6. Put simulation and Phaser sync in `update()`.
7. Export from the relevant barrel (`src/game/nodes/index.ts`, `src/app/nodes/index.ts`, or `src/ui/nodes/index.ts`).
8. Register in `src/app/nodes/GameplayRootNode.ts`.
9. Add/adjust smoke coverage if the node affects gameplay.

## Things Not To Do

- Do not put gameplay logic into `AppScene`.
- Do not add node `render()` hooks for normal Phaser object updates.
- Do not hide runtime state in unrelated private fields when it belongs in node data.
- Do not introduce new raw string gameplay events in node code; use `GAME_EVENTS`.
- Do not store save-game state in node data.
- Do not add multiple node classes to one file.
- Do not add more Phaser scenes for app/game/UI state; model them as runtime nodes unless Phaser lifecycle isolation is genuinely required.
