# Runtime Public Project Cleanup Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Remove obsolete and duplicated runtime/editor paths, establish permanent regression tests, and complete the ownership split where concrete Gravity Dig behavior lives under `apps/game/public` while native/core code remains reusable.

**Architecture:** Work in dependency order. First remove dead compiler code and add tests. Then centralize native factory/bootstrap capabilities and simplify bundle hot reload. Only after those safety gates pass, migrate the remaining level domain, settings-driven scene flow, input, player state, and animation ownership to public scripts and data.

**Tech Stack:** TypeScript 6, Phaser 4, Vite 8, Next.js 16, esbuild, Node test runner or Vitest, GitHub Actions, GHCR, ArgoCD/k3s.

---

## Global gates

Every implementation task follows these gates:

1. Start from a clean `main` equal to `origin/main`.
2. Write or identify a failing regression test before behavior changes.
3. Keep stable `nodeTypeId`, `instanceId`, `nodeId`, and prefab IDs unchanged unless migration explicitly requires a new public ScriptNode ID.
4. Run task-specific tests, game/editor typechecks, and `git diff --check` before committing.
5. Use one focused commit per task.
6. After runtime-facing tasks, verify the exact EDIT and PLAY browser flows.
7. Before final delivery, fetch/rebase normally, push, watch both image builds, verify GitOps versions, ArgoCD health, rollouts, and public endpoints.

## Task 1: Remove obsolete editor compiler

**Objective:** Delete the superseded TypeScript string-concatenation compiler and keep only the canonical esbuild invocation.

**Files:**
- Modify: `apps/editor/src/server/editorBackend.ts`
- Modify if now unused: `apps/editor/package.json`

**Steps:**
1. Prove `buildDynamicNodeModules()` invokes `apps/game/scripts/build-dynamic-nodes.mjs` and no deleted helper has a caller.
2. Delete `DynamicNodeBuildScriptEntry`, old transpile/factory/import-strip/shim/atomic-write/source-discovery/diagnostic helpers.
3. Remove unused `typescript`, `createHash`, `rename`, and other imports/dependencies.
4. Run editor typecheck and build.
5. Run editor dynamic-node build API against a current workspace and verify nine manifest entries plus `dynamic.level-manager`.
6. Commit `Remove obsolete editor script compiler`.

## Task 2: Add permanent regression test infrastructure

**Objective:** Replace temporary `/tmp` checks with repository-owned deterministic tests.

**Files:**
- Modify: root `package.json`
- Modify: root lockfile
- Create: test configuration only if needed
- Create: `tests/game-settings.test.ts`
- Create: `tests/runtime-manager-host.test.ts`
- Create: `tests/public-level-generator.test.ts`
- Create: `tests/dynamic-node-bundle.test.ts`

**Steps:**
1. Choose the smallest test runner that can import repository TypeScript and run in CI.
2. Add `npm test` and a focused test command.
3. Add failing parser tests for duplicate IDs, unknown dependencies, cycles, invalid scenes/modes, and invalid persistent-to-scene dependencies.
4. Tighten `GameSettings` validation until tests pass.
5. Add manager-host tests for dependency order, singleton reuse, reverse scene teardown, source metadata, and runtime destruction.
6. Add deterministic generator invariants for seed, spawn, boundaries, resources, and cleanup.
7. Add canonical bundle tests for relative imports, transitive hash changes, bundle module selection, and shared-hash manifest entries.
8. Run tests twice to prove deterministic output.
9. Commit `Add runtime and public project regression tests`.

## Task 3: Centralize native factory construction

**Objective:** Eliminate duplicated native node registration in `AppScene` and `editor-runtime`.

**Files:**
- Create: `apps/game/src/nodes/createGravityDigNodeFactory.ts`
- Modify: `apps/game/src/scenes/AppScene.ts`
- Modify: `apps/game/src/editor-runtime/main.ts`
- Modify: relevant node exports
- Test: factory registration test

**Steps:**
1. Add a failing test asserting PLAY and EDIT expose the same native node type IDs.
2. Define a dependency object for prefab creation, preview changes, script actions, and dynamic-node tracking.
3. Extract one factory builder with core/native registrations.
4. Make both runtimes call it and keep only mode-specific wiring outside.
5. Verify cold EDIT, cold PLAY, prefab instantiation, and dynamic ScriptNode creation.
6. Commit `Share native node factory across runtimes`.

## Task 4: Replace per-node hot reload chatter with bundle updates

**Objective:** Send, load, cache, and acknowledge one changed shared bundle rather than repeating identical code per node type.

**Files:**
- Modify: `packages/debug-protocol/src/index.ts`
- Modify: `packages/game-core/src/dynamic-nodes/DynamicNodeLoader.ts`
- Modify: `apps/game/src/debug/DebugBridgeNode.ts`
- Modify: `apps/game/src/scenes/AppScene.ts`
- Modify: `apps/game/src/editor-runtime/main.ts`
- Modify: `apps/editor/src/app/page.tsx`
- Test: `tests/dynamic-node-bundle.test.ts`

**Steps:**
1. Add protocol tests for `dynamic-node:bundle-updated`, request, response, and acknowledgement.
2. Send one bundle descriptor containing hash, URL, and affected node type IDs.
3. Load and normalize the bundle once, then update every cached module and matching live node.
4. Bound bundle caches to current/recent hashes and remove rejected promises.
5. Return per-node reload counts in one acknowledgement.
6. Browser-test a helper-only edit and verify one request/response, successful reloads, no duplicate children, and no iframe replacement.
7. Commit `Reload dynamic scripts by shared bundle`.

## Task 5: Move remaining level domain to Public

**Objective:** Make the public LevelManager own concrete tile/resource vocabulary, health, collision policy, mutable level state, damage, destruction, resource release, bounds, and generation.

**Files:**
- Modify: `apps/game/public/scripts/Managers/LevelManager.node.ts`
- Modify/create: `apps/game/public/scripts/LevelGeneration/*`
- Create public tile/render catalog JSON if useful
- Create generic core/native tilemap contracts and adapter nodes
- Modify: `apps/game/src/game/nodes/LevelNode.ts`
- Modify: `apps/game/src/game/level/LevelTilemapView.ts`
- Modify consumers in world, mining, movement, HUD, and gameplay logic
- Delete obsolete concrete files under `apps/game/src/game/level/`

**Steps:**
1. Inventory every producer and consumer of `LevelData`, `TileType`, tile health, resource maps, collision, and damage.
2. Add public LevelManager behavior tests covering generation, collision, damage, destruction, resource release, and regeneration.
3. Define a product-neutral native render contract using strings/numeric frames/grid cells without ore names.
4. Move mutable maps and concrete rules into the public manager.
5. Replace native `LevelNode` with a generic tilemap/render adapter or delete it if ordinary generic nodes suffice.
6. Move atlas/frame choices and hardcoded tunnel/world constants to public configuration.
7. Remove concrete tile/resource names from `apps/game/src` and assert this with a repository search test.
8. Verify movement collision, mining, cargo, rendering, world bounds, regeneration, EDIT, and PLAY.
9. Commit `Move complete level domain into public project`.

## Task 6: Make scene, asset, and prefab flow settings-driven

**Objective:** Remove hardcoded `menu`, `loading`, `gameplay`, asset loader calls, and player/ship prefab paths from runtime bootstraps.

**Files:**
- Modify: `apps/game/public/game.settings.json`
- Modify: `apps/game/public/schemas/game-settings.schema.json`
- Modify: `packages/game-core/src/config/GameSettings.ts`
- Create generic scene/project bootstrap service if needed
- Modify: `apps/game/src/scenes/AppScene.ts`
- Modify: `apps/game/src/editor-runtime/main.ts`
- Modify: `apps/game/src/assets/AssetLoader.ts`

**Steps:**
1. Add settings parser tests for asset groups, preload groups, transition targets, and prefab dependencies.
2. Add asset-group and required-prefab declarations to settings.
3. Replace fixed scene unions with validated string IDs from settings.
4. Load declared assets before activating dependent managers/scenes.
5. Replace hardcoded player/ship preload paths with settings data.
6. Move Gravity Dig transition policy into public scene scripts/actions while keeping generic host loading capability.
7. Verify arbitrary editor scene selection and normal menu to loading to gameplay transition.
8. Commit `Drive scenes and assets from public settings`.

## Task 7: Public input mapping

**Objective:** Keep native input as a raw device adapter and move Gravity Dig action mapping/mode policy into a public manager ScriptNode.

**Files:**
- Modify/rename: `apps/game/src/app/nodes/GameplayInputNode.ts`
- Create: `apps/game/public/scripts/Managers/GameplayInputManager.node.ts`
- Modify: `apps/game/public/managers/gameplay-input.manager.json`
- Modify dependent scripts and factory registrations

**Steps:**
1. Capture all current keyboard, pointer, touch, and gamepad inputs in tests.
2. Define a narrow generic raw-input adapter API.
3. Move bindings, action names, and Gravity Dig policy into public code/properties.
4. Preserve stable manager identity and dependent node references.
5. Verify keyboard, touch, gamepad/mode changes, EDIT startup, and PLAY movement/mining.
6. Commit `Move gameplay input mapping into public project`.

## Task 8: Public player state and animation policy

**Objective:** Move Gravity Dig run/cargo/upgrades/state and animation-selection policy to public managers/scripts while retaining only generic persistence and passive animation capabilities native.

**Files:**
- Modify/delete: `apps/game/src/game/nodes/PlayerStateManagerNode.ts`
- Modify/delete: `apps/game/src/game/nodes/PlayerAnimatorNode.ts`
- Create public manager/scripts and manager JSON updates
- Modify dependent HUD, mining, movement, ship, and gameplay scripts

**Steps:**
1. Add deterministic tests for run creation/resume, cargo capacity, mined resources, credits, upgrades, respawn/reset, and animation state selection.
2. Expose generic JSON storage and passive animation APIs only.
3. Move product state and rules into public ScriptNodes with explicit NodeRefs.
4. Migrate all consumers without name-based lookups or parallel registries.
5. Remove native Gravity Dig state/animation classes and type IDs only after source files no longer reference them.
6. Verify persisted run semantics, cargo HUD, mining, ship interaction, death/respawn, and all movement animations.
7. Commit `Move player state and animation policy into public project`.

## Task 9: Polish, CI, and architecture documentation

**Objective:** Finish structural cleanup and make the new boundaries enforceable.

**Files:**
- Modify GitHub workflow action versions if needed
- Modify Next tracing configuration only with verified narrow paths
- Modify `docs/NODE_RUNTIME_ARCHITECTURE.md`
- Add architecture boundary/search tests

**Steps:**
1. Remove remaining dead imports, duplicate paths, stale native exports, and obsolete documentation.
2. Resolve Node action deprecation warnings using supported action releases.
3. Investigate and fix the Next NFT whole-project trace warning without hiding required editor workspace files.
4. Add checks preventing product terms and public-domain modules from returning to generic engine paths.
5. Run full tests, typechecks, builds, `git diff --check`, and fresh browser smokes.
6. Commit `Polish public project runtime architecture`.

## Task 10: Ship and verify

**Objective:** Deliver the complete cleanup through the normal deployment chain.

**Steps:**
1. Fetch `origin/main`, rebase normally if required, and rerun all verification.
2. Confirm source and editor workspaces are clean and synchronized.
3. Push all focused commits.
4. Watch Game and Editor GitHub Actions by SHA.
5. Verify generated Game and Editor image tags in `gitops-config`.
6. Verify ArgoCD `Synced/Healthy`, rollout status, image tags, and ready replicas.
7. Perform productive Game menu/gameplay/mining/respawn smoke and productive Editor hierarchy/manager/Inspector/helper-hot-reload smoke.
8. Report exact commits, CI run URLs, images, GitOps revision, health, and any explicitly deferred limitation.
