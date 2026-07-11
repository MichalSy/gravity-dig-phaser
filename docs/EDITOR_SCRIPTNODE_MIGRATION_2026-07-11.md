# Editor and Public ScriptNode Migration — 2026-07-11

This document records the completed Gravity Dig runtime/editor migration from 2026-07-11. The implementation described here is deployed on `main` through commit `1184bdc`.

## Result

Gameplay and UI behavior that should be editable is authored as public `.node.ts` scripts under:

```text
apps/game/public/scripts/
```

Reusable object structure is authored as JSON prefabs under:

```text
apps/game/public/prefabs/
```

Native TypeScript nodes under `apps/game/src/` remain only where engine-facing Phaser integration or runtime management is required.

## Runtime lifecycle in EDIT and PLAY

Every runtime tree uses the same initialization phases:

1. `init(ctx)` — EDIT and PLAY
2. `resolve()` — EDIT and PLAY
3. `afterResolved()` — EDIT and PLAY
4. frame update:
   - `update(deltaMs)` in PLAY
   - `editorUpdate(deltaMs)` in EDIT
5. `destroy()` — EDIT and PLAY

Scripts are therefore not disabled in EDIT. They initialize and resolve normally, but normal gameplay `update()` methods do not run. Editor-specific previews use `editorUpdate()`.

World composition that must be identical in EDIT and PLAY belongs in the common initialization/level lifecycle, not in duplicated update methods.

## Dynamic world composition

`GameWorldNode` owns the current level's visual entity lifecycle.

After generating a level, it creates the runtime prefabs in deterministic order:

```text
Level generated
  → Ship prefab instantiated
  → Player prefab instantiated
  → Player positioned at level spawn
  → Mining reset
  → Camera follows player
```

The order is intentional. Ship is inserted before Player, so the Player renders in front when their visuals overlap.

Current runtime hierarchy:

```text
GameRoot
├── Level
├── World
│   ├── Ship       RUNTIME
│   └── Player     RUNTIME
└── ...
```

Neither Ship nor Player is statically declared in `gameplay.scene.json`.

On level replacement, GameWorld destroys the old Player and Ship before creating new instances. The same path runs in EDIT preview and PLAY.

### Ship

Structure remains editor-authored in:

```text
apps/game/public/prefabs/ship.prefab.json
```

Behavior remains public:

```text
apps/game/public/scripts/Gameplay/ShipScript.node.ts
```

### Player

Structure remains editor-authored in:

```text
apps/game/public/prefabs/player.prefab.json
```

The Player root is a normal `TransformNode`. There is no native `PlayerNode`, native `PlayerMovementControllerNode`, or separate `PlayerScript` adapter.

Player structure:

```text
Player                         TransformNode
├── PlayerMovementController  Player Movement Script
├── PlayerBody                CollisionRectNode
│   └── PlayerImage           AnimatedImageNode
├── PlayerAnimator            PlayerAnimatorNode
├── MiningLaser               MiningLaserNode
└── MiningTool                Mining Tool Script
```

`PlayerMovementScript.node.ts` resolves its authored Body and Image references and owns:

```text
spawnAt(x, y)
resetMotion()
movement/input/physics state
```

`GameWorldNode` instantiates the prefab, calls the movement script's `spawnAt()`, and uses the returned Phaser image as the camera target.

## Runtime creation metadata

`GameNode` carries explicit creation metadata:

```ts
type NodeCreationOrigin =
  | 'scene'
  | 'runtime-code'
  | 'runtime-script';

interface NodeCreationMetadata {
  origin: NodeCreationOrigin;
  runtimeRoot?: boolean;
  prefabPath?: string;
  createdByInstanceId?: string;
}
```

`SceneNodeFactory.createTree()` applies this metadata to created trees.

- Declarative scene trees use `scene`.
- Prefabs instantiated by native runtime code use `runtime-code`.
- Prefabs instantiated through a public ScriptNode use `runtime-script`.
- `runtimeRoot` is set only on the root of the dynamically instantiated tree.

The metadata is serialized through `DebugNodeDescriptor` and shown by the Hierarchy Explorer as a `RUNTIME` badge on the dynamic root. The tooltip includes origin and prefab path. Children inherit the creation origin but do not repeat the badge.

Do not infer runtime origin from names, UUIDs, or node types.

## Dynamic ScriptNode API

Public ScriptNodes can instantiate prefabs with:

```ts
this.instantiatePrefab(path, {
  name,
  props,
});
```

The API is implemented consistently in game runtime and editor runtime. Dynamically added children are mounted into an already resolved runtime and are removed through the normal node lifecycle.

## Mining migration

Public behavior:

```text
apps/game/public/scripts/Gameplay/MiningScript.node.ts
```

Phaser-specific visual/audio adapter:

```text
apps/game/src/game/nodes/MiningLaserNode.ts
```

Mining reads effective gameplay stats directly from the active `PlayerState`. Cargo ownership remains centralized in `PlayerStateManagerNode`; the mining script does not duplicate cargo state.

Obsolete native MiningTool data/node paths were removed.

## Status HUD migration

Public behavior:

```text
apps/game/public/scripts/UI/StatusHudScript.node.ts
```

Prefab:

```text
apps/game/public/prefabs/status-hud.prefab.json
```

The prefab uses a normal `TransformNode` root and editor-authored child images. The script updates HP/Fuel crop and visibility in PLAY and supplies a stable preview in EDIT.

## Bottom HUD migration

Public behavior:

```text
apps/game/public/scripts/UI/BottomHudScript.node.ts
```

Prefabs:

```text
apps/game/public/prefabs/bottom-hud.prefab.json
apps/game/public/prefabs/inventory-slot.prefab.json
```

Inventory slots are instantiated dynamically by the Bottom HUD script and are marked `RUNTIME` in the hierarchy.

### Geometry ownership

Bottom HUD position and scale are editor-authored in `bottom-hud.prefab.json`:

```json
"position": { "x": -410.35, "y": 0 },
"scale": { "x": 1, "y": 1 }
```

`BottomHudScript` must not recalculate HUD position, scale, or Energy Fill geometry from viewport size or slot count.

Only the Energy Fill crop is dynamic:

```ts
energyFill.image.setCrop(0, 0, cropWidth, 84);
```

At zero energy, the fill is hidden.

### Empty slots

The inventory slot's Item image is initially hidden. Runtime updates show it only when the cargo slot has an `itemId` and `quantity > 0`. Empty and zero-quantity slots display neither the default rock image nor a quantity label.

## Hot reload and cleanup

Runtime-created prefab instances must be owned by the script or manager that created them.

- Bottom HUD removes generated slots in `destroy()`.
- GameWorld removes Player and Ship on world destruction and before level replacement.
- Runtime metadata is regenerated with each new instance.
- Hot reload must not leave duplicate dynamic instances.

## Verification completed

The migration was verified with:

- Dynamic ScriptNode compilation
- game TypeScript checks
- complete monorepo builds
- focused compiled-script tests
- EDIT browser checks
- PLAY browser checks
- hierarchy ordering and `RUNTIME` badge checks
- browser console checks
- Game and Editor GitHub Actions
- live rollout checks

Relevant commits, oldest to newest:

```text
34bbf28 Move bottom HUD behavior to dynamic script
55b59b2 Handle bottom HUD editor preview without active run
c05bace Fix dynamic HUD lifecycle and responsive updates
6355806 Move mining behavior to dynamic script
bfb5c23 Move status HUD behavior to dynamic script
1026ec7 Fix status HUD transform node type
e895344 Move player lifecycle to dynamic script
623287d Spawn player dynamically with runtime hierarchy metadata
7ace407 Spawn ship dynamically before player
94fc910 Keep bottom HUD geometry editor-authored
1184bdc Author bottom HUD transform in prefab
```

## Architectural rules going forward

1. Reusable structure belongs in public prefabs.
2. Editor-facing gameplay/UI behavior belongs in public ScriptNodes.
3. Native nodes are reserved for Phaser/engine integration and runtime managers.
4. EDIT and PLAY share initialization; only frame-update methods differ.
5. Runtime composition is explicit and deterministic.
6. Runtime-created trees carry origin metadata.
7. Prefab geometry remains editor-authored unless dynamic layout is an explicit feature.
8. PlayerState remains the owner of persistent profile/run/cargo state.
9. Dynamic instances must be destroyed by their creator.
10. Verify changes in both EDIT and PLAY before delivery.
