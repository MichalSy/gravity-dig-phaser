# Node Runtime Architecture

This document is the canonical technical reference for the current Phaser runtime, prefab system, layout engine, public ScriptNodes, and debug editor.

Historical migration notes live in [`EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md`](./EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md). Godot and Unity documents are reference material only and do not define the current implementation.

## 1. System boundaries

Gravity Dig is split into four primary workspaces:

```text
apps/game                 Phaser/Vite game and editor runtime
apps/editor               Next.js debug/prefab editor and Git backend
packages/game-core        reusable node runtime, layout, prefabs and ScriptNode API
packages/debug-protocol   typed editor ↔ game messages
```

`AppScene` is the single Phaser scene. It is an engine adapter that preloads assets, mounts the node runtime, and forwards Phaser's frame delta. App flow, gameplay, UI, and editable behavior belong in nodes rather than additional Phaser scenes.

Phaser owns rendering. Nodes mutate Phaser GameObjects during update; there is no node `render()` lifecycle.

## 2. Runtime tree and lifecycle

`NodeRuntime` owns persistent manager nodes and one or more ordered root trees. Every `GameNode` follows the same lifecycle:

1. `init(ctx)` creates owned Phaser objects and registers listeners.
2. `resolve()` resolves required nodes and validates dependencies.
3. `afterResolved()` performs startup shared by EDIT and PLAY.
4. Layout runs as cached measure and arrange phases.
5. `update(deltaMs)` runs in PLAY; `editorUpdate(deltaMs)` runs in EDIT.
6. `destroy()` releases listeners, children, and owned Phaser objects.

Dynamically inserted trees enter the same lifecycle. Their creator owns their removal. A public ScriptNode that creates runtime slots, for example, must remove them in `destroy()`.

Runtime-created roots carry explicit creation metadata:

```ts
type NodeCreationOrigin = 'scene' | 'runtime-code' | 'runtime-script';
```

The editor displays runtime roots with a `RUNTIME` badge. Names, UUID formats, and node types must never be used to infer creation origin.

### 2.1 Public game settings and managers

`apps/game/public/game.settings.json` is the versioned project bootstrap contract shared by PLAY and EDIT. It defines the public asset manifest, scene paths, asset groups, prefab dependencies, action-driven scene transitions, and manager composition. Neither `AppScene` nor the editor runtime owns duplicate scene IDs, asset lists, prefab lists, transitions, or manager lists.

Concrete assets are grouped in `public/assets/assets.manifest.json`. PLAY loads the startup groups first and additional groups through public actions; EDIT loads the configured groups through the same generic loader. Native source contains no Gravity Dig asset keys or paths.

Singleton manager roots live under `public/managers/*.manager.json`. They use the normal `SceneFileJson` node-tree format, but carry an explicit stable `instanceId` rather than prefab instance semantics. Each settings entry declares:

- `mountWhen`: scenes that first require the manager;
- `lifetime: "runtime" | "scene"`: whether it survives node-scene changes;
- `modes`: PLAY and/or EDIT;
- `dependsOn` and `order`: deterministic startup dependencies.

`RuntimeManagerHost` validates settings, loads manager trees through the shared factory, and routes them through `NodeRuntime.addPersistentNode()`. Runtime-lifetime managers remain mounted after their activating scene is left; scene-lifetime managers are removed in reverse order. Manager roots propagate `managerPath` creation metadata so the editor can persist Inspector changes directly to their public manager file.

## 3. Node types and exposed properties

Core node classes live under `packages/game-core/src/nodes/`. `apps/game/src/` contains the Phaser/bootstrap adapter and native engine services. The concrete Gravity Dig game project lives under `apps/game/public/`: scenes, prefabs, assets, configuration, presentation, and gameplay ScriptNodes.

The boundary is semantic rather than file-type based:

- engine/native code may know how to draw a line, play a sound, read a device, or instantiate a prefab;
- public game code decides that a line is a mining laser, which sound represents a broken gem, and how damage becomes crack stages;
- native adapters must not contain Gravity Dig key bindings, balance values, asset choices, or state machines.

Each node type defines static property metadata through `exposedPropGroups`. This metadata is the single source for:

- normal runtime Inspector controls,
- prefab root Inspector controls,
- prefab sub-node Inspector controls,
- labels, numeric steps, ranges, enums, vectors, anchors and origins.

A prefab file supplies authored values; it does not decide which properties the node type supports. Therefore an `ImageNode` exposes the same core Layout, Transform, Presentation, and Image properties whether selected in a live scene or inside a prefab.

Properties are applied through controlled mutation paths such as `applySceneProp()` and node setters. Mutable layout values must not bypass invalidation by mutating nested fields in place; assign a complete value instead:

```ts
node.position = { x: 120, y: 48 };
node.origin = { x: 0, y: 0.5 };
```

## 4. Layout architecture

Layout is split into two cached phases.

### 4.1 Measure

`measureTree()` runs bottom-up for branches marked `measureDirty`:

1. a node measures its intrinsic content,
2. dirty children measure themselves,
3. a `sizeMode: "content"` parent unions child bounds,
4. the measured result is cached.

`ImageNode` measures the complete image or atlas frame. `TextNode` measures its rendered text. A generic content container derives its size from child bounds.

### 4.2 Arrange

`arrangeTree()` runs top-down for branches marked `arrangeDirty`:

1. the parent size and transform are already known,
2. `parentAnchor` resolves against the final parent size,
3. origin, local transform and world transform are applied,
4. arranged bounds are cached.

`parentAnchor` is intentionally excluded from content measurement. Anchors such as `center-left` depend on final parent dimensions and belong to arrange.

A content-sized parent must not depend exclusively on an anchored child along the same axis: parent size depending on child position while child position depends on parent size is circular. Give that axis an explicit or otherwise independent size source.

### 4.3 Dirty propagation

Each node tracks separate measure and arrange state plus subtree state so clean branches are skipped completely.

Typical invalidation rules:

| Change | Required work |
|---|---|
| text, font, image asset, intrinsic size | measure node and content ancestors; arrange affected branch |
| explicit size or size mode | measure and arrange |
| local position, anchor, origin, rotation, scale | arrange; measure content parent when its bounds change |
| parent size or transform | arrange anchored descendants |
| visibility or active state | update parent content measurement and arrangement |
| add, remove, move or reparent child | measure affected content parents and arrange tree |

Stable trees do not remeasure or rearrange every frame.

### 4.4 Crop is not layout

Image crop is visual state. It must not change intrinsic node size, authored position, or parent content size.

`ImageNode.setHorizontalFill(percent)` clamps a value to `0..1`, reads the actual frame dimensions, and applies a horizontal Phaser crop. The node continues to measure the complete frame.

HUD scripts therefore provide only dynamic state:

```ts
const energyPct = clamp(currentEnergy / maxEnergy, 0, 1);
energyFill.setHorizontalFill(energyPct);
```

Fill position, origin, anchor, scale, and size remain authored in the prefab and resolved by normal layout.

## 5. Prefab identity and inheritance

Prefab matching uses three different identities:

```text
prefabId    persistent identity of a prefab definition
nodeId      persistent identity of a node inside that definition
instanceId  unique identity of one concrete runtime node
```

`prefabPath` is a loading hint and editor navigation value, not identity. Names, hierarchy paths, array indexes, and reconstructed JSON paths are never valid runtime matching keys.

`PrefabManager` owns:

- lazy loading and dependency loading,
- caches indexed by prefab ID and path,
- runtime instance ID allocation,
- active instance registration,
- targeted definition reload,
- structural reconcile by stable `nodeId`.

A runtime instance keeps source identity and sparse authoring overrides. It does not keep a complete copied `prefabProps` snapshot.

Scene-authored root overrides live in `props`. Child overrides live in `overrides`, keyed by source `nodeId`. Values equal to prefab defaults are removed so overrides stay sparse.

Explicit creation overrides, such as a dynamically calculated slot position, have precedence over prefab defaults. Reference remapping processes only properties with Node-ID semantics and must never reapply unrelated defaults afterward. Remapped Dynamic ScriptNode properties use `applyInitialSceneProps()`: this validates and updates the encapsulated Script behavior without incorrectly recording a sparse Inspector override. Native nodes keep their pre-init-safe constructor/direct-assignment path.

## 6. Prefab reload

Saving a prefab triggers a targeted `PrefabManager` reload:

1. parse and validate the replacement definition,
2. update ID/path indexes transactionally,
3. reconcile registered instances by source `nodeId`,
4. preserve sparse authoring overrides,
5. add, delete, move, or reorder runtime nodes as needed,
6. preserve unrelated runtime state.

Normal Inspector patches are applied directly to the selected runtime instance and persisted as pending changes. They do not reload the game iframe. A full iframe reload is reserved for operations that genuinely replace the whole editor runtime.

## 7. Public ScriptNodes

Editable behavior is authored as `.node.ts` files under:

```text
apps/game/public/scripts/
```

The build produces hashed compiled modules and `scripts-compiled/manifest.json`. Source and generated manifest/module artifacts are committed together.

ScriptNodes expose editable fields with `Core.prop.*`, resolve nodes by stable references, and may instantiate prefabs through the shared factory/manager path:

```ts
this.instantiatePrefab(prefabId, { name, props });
```

The cached and hot-reloaded script paths must both use ID-aware prefab creation. A prefab UUID must not be passed to a path-only tree loader.

Script responsibilities should remain behavioral:

- calculate state or percentages,
- update text, tint, crop, animation, or other runtime presentation,
- create/remove explicitly dynamic composition.

Static geometry belongs in node/prefab properties. Dynamic composition may position instances, but should derive geometry from measured node bounds rather than duplicate asset constants.

The Bottom HUD demonstrates this split:

- Energy Fill geometry is authored in `bottom-hud.prefab.json`.
- The script only calculates energy percentage and crop.
- Slot origin is exposed as pixel properties `slotOriginX` and `slotOriginY`.
- Slot spacing comes from the first slot's measured parent bounds, not a hard-coded step.

### 7.1 Public mining composition

Mining is composed by `public/prefabs/mining-tool.prefab.json` and `public/scripts/Gameplay/MiningScript.node.ts`. The public script owns targeting, range checks, energy use, damage, resource classification, crack stages, colors, widths, alpha values, and sound selection.

The prefab uses only generic engine capabilities:

- `LineNode` renders the beam,
- `RectangleNode` renders the target marker,
- `AudioNode` plays looped and one-shot sounds,
- `ImageNode.setAssetId()` updates runtime crack-prefab instances.

`public/prefabs/mining-crack.prefab.json` is instantiated and removed by the mining script through the normal prefab lifecycle. There is no native `MiningLaserNode` or Phaser-specific `MiningLaserView`; engine code contains no mining presentation policy.

### 7.2 Public level generation

Gravity Dig's procedural generator is public gameplay code under `public/scripts/LevelGeneration/`. Terrain distribution, resources, world replacements, seed handling, planet types, tile health, and boundary policy are not engine responsibilities.

`public/scripts/Managers/LevelManager.node.ts` reads the configured planet JSON through the generic `ScriptNode.requireJsonAsset()` API and owns generation, tile queries, collision rules, frame selection, mutation, health, and resource state. `LevelNode` is only a native Phaser tilemap adapter: it renders generic frame/solid data and delegates all domain operations back to the public manager. The removed native tile domain, collision policy, generator modules, and `LevelGeneratorManagerNode` must not be reintroduced.

The production and editor ScriptNode builds both invoke the canonical esbuild pipeline. Relative helper-module edits anywhere under `public/scripts/` trigger the same rebuild. The editor compares bundle hashes, transfers the changed shared bundle once, imports it once per hash, and reloads every matching live `DynamicScriptNode` instance with one acknowledgement. Runtime bundle caches retain at most eight generations.

### 7.3 Public gameplay managers

Concrete input mapping, player profile/run/cargo state, upgrades, save-game rules, and player animation selection live under `public/scripts/`. The only native input component is `InputDeviceNode`, which exposes raw keyboard, pointer, and gamepad state without knowing Gravity Dig controls. Animation uses generic `AnimatedImageNode` and `AudioNode` children authored in the player prefab.

`DynamicScriptNode` instances provide a transparent method/property facade. Runtime consumers can use the same stable node reference surface whether a manager is native or public, while script exceptions remain guarded and hot reload still replaces the underlying behavior.

## 8. Editor data flow

The embedded game and editor communicate through typed `postMessage` messages from `packages/debug-protocol`.

The game publishes:

- tree snapshots and deltas,
- selected node properties,
- node property definitions,
- asset metadata,
- patch acknowledgements,
- prefab reload acknowledgements.

The editor:

1. renders the live hierarchy and Inspector,
2. sends a live node patch,
3. records a pending source change through its Next.js backend,
4. previews Git changes,
5. commits and pushes from the isolated editor workspace.

The browser never receives repository credentials. Server APIs validate relative paths and restrict writes to configured repository roots.

## 9. Ownership rules

- `AppScene` remains a thin Phaser adapter.
- `apps/game/public/` is the replaceable concrete game project; reusable engine capabilities remain in core/native adapters.
- Structure belongs in scene/prefab JSON.
- Editor-facing behavior belongs in public ScriptNodes.
- Native nodes are reserved for reusable runtime management or Phaser integration and must not encode Gravity Dig decisions.
- Persistent profile/run/cargo state belongs to player-state modules, not UI scripts.
- Runtime-created trees are destroyed by their creator.
- A node owns the Phaser objects it creates.
- Prefab identity never depends on names or paths.
- Crop, tint, and animation are presentation; they must not silently become a second layout system.
- Changes affecting editor/runtime parity are verified in both EDIT and PLAY.

## 10. Verification baseline

Before shipping runtime, prefab, layout, or editor changes, run the relevant subset and the complete build before final delivery:

```bash
npm test
npm run build -w packages/debug-protocol
npx tsc --noEmit -p apps/game/tsconfig.json
npx tsc --noEmit -p apps/editor/tsconfig.json
npm run build -w apps/game
npm run build:editor
npm run build:embedded-game -w apps/editor
git diff --check
```

Also verify the affected behavior in the real embedded editor, including EDIT/PLAY lifecycle, browser console, Inspector controls, targeted prefab reload, and dynamic-instance regressions.
