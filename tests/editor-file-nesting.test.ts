import { describe, expect, it } from 'vitest';
import { buildNestedFileBundles, pairByStem, type NestableFile } from '../apps/editor/src/file-nesting';

function files(...names: string[]): NestableFile[] {
  return names.map((name) => ({ name, path: `folder/${name}`, kind: 'file' }));
}

function entries(...values: Array<[string, 'file' | 'directory']>): NestableFile[] {
  return values.map(([name, kind]) => ({ name, path: `folder/${name}`, kind }));
}

describe('editor file nesting registry', () => {
  it('aggregates children from multiple rules under the same active primary', () => {
    const manager = pairByStem({
      id: 'manager', label: 'Manager', priority: 100,
      primarySuffixes: ['.node.ts'], childSuffixes: ['.manager.json'],
    });
    const schemaAndDocs = pairByStem({
      id: 'node-support', label: 'Support', priority: 80,
      primarySuffixes: ['.node.ts'], childSuffixes: ['.schema.json', '.docs.md'],
    });
    const result = buildNestedFileBundles(files(
      'GameplayInput.node.ts',
      'GameplayInput.manager.json',
      'GameplayInput.schema.json',
      'GameplayInput.docs.md',
      'unrelated.json',
    ), [manager, schemaAndDocs]);

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].primary.name).toBe('GameplayInput.node.ts');
    expect(result.bundles[0].children.map(({ file }) => file.name)).toEqual([
      'GameplayInput.manager.json',
      'GameplayInput.docs.md',
      'GameplayInput.schema.json',
    ]);
    expect(result.bundledChildPaths).not.toContain('folder/unrelated.json');
  });

  it('uses the registered manager and image metadata conventions', () => {
    const result = buildNestedFileBundles(files(
      'PlayerStateManager.node.ts',
      'PlayerStateManager.manager.json',
      'tiles_atlas.webp',
      'tiles_atlas.json',
      'hud.webp',
      'hud.webp.json',
    ));

    expect(result.bundles.map(({ primary, children }) => [primary.name, children.map(({ file }) => file.name)])).toEqual([
      ['hud.webp', ['hud.webp.json']],
      ['PlayerStateManager.node.ts', ['PlayerStateManager.manager.json']],
      ['tiles_atlas.webp', ['tiles_atlas.json']],
    ]);
  });

  it('groups atlas metadata and a real frames directory under the generated image', () => {
    const result = buildNestedFileBundles(entries(
      ['terrain.atlas.webp', 'file'],
      ['terrain.atlas.json', 'file'],
      ['terrain.atlas.frames', 'directory'],
      ['effects.atlas.png', 'file'],
      ['effects.atlas.json', 'file'],
      ['effects.atlas.frames', 'directory'],
    ));

    expect(result.bundles.map(({ primary, children }) => [primary.name, children.map(({ file }) => [file.name, file.kind])])).toEqual([
      ['effects.atlas.png', [['effects.atlas.json', 'file'], ['effects.atlas.frames', 'directory']]],
      ['terrain.atlas.webp', [['terrain.atlas.json', 'file'], ['terrain.atlas.frames', 'directory']]],
    ]);
  });

  it('keeps a child visible when equally strong rules disagree about its owner', () => {
    const first = pairByStem({ id: 'first', label: 'First', priority: 10, primarySuffixes: ['.one'], childSuffixes: ['.meta'] });
    const second = pairByStem({ id: 'second', label: 'Second', priority: 10, primarySuffixes: ['.two'], childSuffixes: ['.meta'] });
    const result = buildNestedFileBundles(files('Thing.one', 'Thing.two', 'Thing.meta'), [first, second]);

    expect(result.bundles).toEqual([]);
    expect(result.conflictedChildPaths).toEqual(new Set(['folder/Thing.meta']));
    expect(result.bundledChildPaths).toEqual(new Set());
  });
});
