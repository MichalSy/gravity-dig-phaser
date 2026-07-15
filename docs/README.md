# Documentation

## Current references

These documents describe the active Phaser/TypeScript implementation:

- [`NODE_RUNTIME_ARCHITECTURE.md`](./NODE_RUNTIME_ARCHITECTURE.md) — canonical runtime, layout, prefab, ScriptNode, Inspector, and live-reload architecture.
- [`GAMEPLAY_BALANCE.md`](./GAMEPLAY_BALANCE.md) — active resource values, upgrade curves, progression targets, and visibility-field tuning.
- [`../README.md`](../README.md) — repository overview, development, editor backend, and deployment.
- [`ART_STYLE.md`](./ART_STYLE.md) — current visual direction.

## Historical migration record

- [`EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md`](./EDITOR_SCRIPTNODE_MIGRATION_2026-07-11.md) records the migration that introduced public ScriptNodes and runtime prefabs. It is useful history, but the canonical current behavior is in `NODE_RUNTIME_ARCHITECTURE.md`.

## Legacy source references

The following folders document predecessor implementations and game-design source material. They do not define the current Phaser runtime:

- [`godot/`](./godot/) — design and system notes inherited from the Godot phase.
- [`godot-project/`](./godot-project/) — obsolete Godot engine/project architecture.
- [`archive/godot/`](./archive/godot/) — archived Godot repository notes.
- [`archive/unity/`](./archive/unity/) — archived Unity migration material.

When legacy documentation conflicts with current TypeScript code or `NODE_RUNTIME_ARCHITECTURE.md`, the current architecture document and implementation win.
