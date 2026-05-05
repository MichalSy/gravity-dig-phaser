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

`NodeRuntime.update(deltaMs)` resolves lazily and then ticks persistent nodes followed by root node trees in `order`.

## Dependencies

Nodes declare required node names with `dependencies`:

```ts
export class MiningToolNode extends GameNode {
  override readonly dependencies = ['level', 'world', 'playerController', 'playerState'] as const;
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
emitGameEvent(scene, GAME_EVENTS.shipReturnCargo);
onGameEvent(scene, GAME_EVENTS.worldLevelCreated, handler, this);
offGameEvent(scene, GAME_EVENTS.worldLevelCreated, handler, this);
```

This keeps event names and payloads typed. Existing external emitters may still emit the same underlying string event names, but gameplay code should use the typed helpers.

## Pure Logic

Reusable decision logic lives in:

```txt
src/game/gameplayLogic.ts
```

Current examples:

- `computePlayerAnimationState(...)`
- `buildHudState(...)`
- `buildShipDockPrompt(...)`
- `isAtShipDock(...)`
- `spawnToWorld(...)`
- `worldBoundsForLevel(...)`
- `inputStrength(...)`

Guideline: if a rule can be expressed without Phaser object ownership, prefer a pure function and let the node orchestrate it.

## Gameplay Node Layout

Gameplay node files live in:

```txt
src/game/nodes/
```

Current gameplay nodes mounted under `GameplayRootNode`:

- `LevelNode` — level data, tilemaps, collision queries, tile clearing
- `CameraZoomNode` — debug zoom state and camera zoom sync
- `GameWorldNode` — level lifecycle, background/ship/core/player spawn, camera bounds/follow
- `PlayerControllerNode` — player input, movement, physics, collision stepping
- `MiningToolNode` — mining input, laser, targeting, tile damage, crack overlays, block break handling
- `PlayerPresentationNode` — animation, facing, footsteps
- `CollisionDebugNode` — collision debug graphics
- `RunRecoveryNode` — energy recovery while not mining
- `HudNode` — writes the HUD view model into `GameplayUiScene`
- `ShipDockNode` — ship prompt and cargo return interaction
- `AutoSaveNode` — periodic active-run save

Persistent nodes:

- `PlayerStateManagerNode` — save/profile/run state
- `LevelGeneratorManagerNode` — planet config and pure level generation

## Adding a New Node

1. Create `src/game/nodes/MyNode.ts`.
2. Add a `data` object in `src/game/nodeData.ts` when the node owns runtime state.
3. Declare `dependencies` explicitly.
4. Register event listeners in `init()` and remove them in `destroy()`.
5. Resolve other nodes in `resolve()`.
6. Put simulation and Phaser sync in `update()`.
7. Export from `src/game/nodes/index.ts`.
8. Register in `src/app/nodes/GameplayRootNode.ts`.
9. Add/adjust smoke coverage if the node affects gameplay.

## Things Not To Do

- Do not put gameplay logic into `AppScene`.
- Do not add node `render()` hooks for normal Phaser object updates.
- Do not hide runtime state in unrelated private fields when it belongs in node data.
- Do not introduce new raw string gameplay events in node code; use `GAME_EVENTS`.
- Do not store save-game state in node data.
- Do not add more Phaser scenes for app/game/UI state; model them as runtime nodes unless Phaser lifecycle isolation is genuinely required.
