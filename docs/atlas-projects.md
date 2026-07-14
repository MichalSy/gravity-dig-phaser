# Atlas Projects

Gravity Dig stores editable atlases as three co-located explorer entries sharing one stem:

```text
terrain.atlas.webp       generated runtime image
terrain.atlas.json       versioned layout and frame metadata
terrain.atlas.frames/    editable source images
```

The generated image is the Asset Explorer primary item. The JSON file and the real source directory are companion items. Several atlas projects may live in the same parent directory.

## Atlas types

### Grid

Use `type: "grid"` for tilesets. `tileWidth`, `tileHeight`, `columns`, and `rows` define the canvas. Every frame owns a stable numeric `slot`.

Moving a frame onto an occupied slot swaps both frames. Deleting a frame does not renumber the remaining slots. Adding a row extends the canvas without changing existing slot numbers.

### Packed

Use `type: "packed"` for sprites of different dimensions. The project defines a canvas `width` and `height`; every frame owns an explicit `{x, y, width, height}` rectangle. Frames can overlap and are composed in metadata order.

## Editor workflow

1. Select a directory below `apps/game/public`.
2. Use **Atlas** in the Asset Explorer header to create a Grid or Packed project.
3. Open the generated `.atlas.png` or `.atlas.webp` primary item.
4. Grid projects accept images on empty or occupied slots. Existing frames can be dragged between slots.
5. Packed projects accept images on the canvas and allow frames to be repositioned by dragging.
6. Source files remain normal files inside `.atlas.frames/` and can also be overwritten through regular Explorer upload.

Every editor operation validates the complete project and atomically writes metadata, source changes, and generated output. The game preview reloads after a successful build.

## Automatic rebuilds

Changes to any of these paths trigger the associated build:

```text
<name>.atlas.json
<name>.atlas.frames/<source-image>
<name>.atlas.png
<name>.atlas.webp
```

Build all checked-in projects from the repository root:

```bash
npm run build:atlases
```

The command discovers every `*.atlas.json` below `apps/game/public` and regenerates its output.

## Safety and validation

- Atlas paths must remain below `apps/game/public`.
- Symlinked atlas files and source directories are rejected.
- Source entries are basenames, not relative paths.
- Frame IDs, sources, Grid slots, and Packed rectangles are validated.
- Grid source images are automatically scaled to the configured `tileWidth` × `tileHeight` during atlas generation. The original files in `.atlas.frames/` remain unchanged.
- Packed frames must fit inside the configured canvas.
- Output, metadata, and source mutations use temporary files and rollback backups.
- Generated images can be PNG or lossless WebP.

The JSON schema is stored at:

```text
apps/game/public/schemas/atlas-project.schema.json
```
