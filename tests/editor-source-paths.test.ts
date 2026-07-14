import { describe, expect, it } from 'vitest';
import { isEditorSourcePath, normalizeEditorSourcePath } from '../apps/editor/src/server/editorSourcePath';

describe('editor source paths', () => {
  it('preserves editable text companions anywhere below game public', () => {
    const atlasMetadata = 'apps/game/public/assets/tilesets/atlas/tiles.atlas.json';
    expect(normalizeEditorSourcePath(atlasMetadata)).toBe(atlasMetadata);
    expect(isEditorSourcePath(atlasMetadata)).toBe(true);
    expect(isEditorSourcePath('apps/game/public/assets/tilesets/atlas/tiles.atlas.webp')).toBe(false);
  });

  it('keeps source-root behavior and rejects unrelated repository paths', () => {
    expect(normalizeEditorSourcePath('nodes/LevelNode.ts')).toBe('apps/game/src/nodes/LevelNode.ts');
    expect(isEditorSourcePath('apps/game/src/nodes/LevelNode.ts')).toBe(true);
    expect(isEditorSourcePath('package.json')).toBe(false);
  });
});
