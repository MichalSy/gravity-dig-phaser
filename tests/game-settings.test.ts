import { describe, expect, it } from 'vitest';
import { managersForScene, parseGameSettings } from '../packages/game-core/src/config/GameSettings';

function settings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    assets: { manifest: 'assets/assets.manifest.json' },
    scenes: {
      startup: 'menu',
      editorDefault: 'gameplay',
      definitions: {
        menu: { path: 'scenes/menu.scene.json', assetGroups: ['startup'] },
        gameplay: { path: 'scenes/gameplay.scene.json', assetGroups: ['gameplay'] },
      },
    },
    actions: {},
    managers: [],
    ...overrides,
  };
}

function manager(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    path: `managers/${id}.manager.json`,
    mountWhen: ['gameplay'],
    lifetime: 'runtime',
    modes: ['play', 'editor'],
    ...overrides,
  };
}

describe('parseGameSettings', () => {
  it('accepts and orders a valid manager dependency graph', () => {
    const parsed = parseGameSettings(settings({
      managers: [manager('level', { dependsOn: ['state'], order: 10 }), manager('state', { order: 20 })],
    }));

    expect(managersForScene(parsed, 'gameplay', 'play').map(({ id }) => id)).toEqual(['state', 'level']);
  });

  it('normalizes scene assets, prefabs, transitions, and sound actions', () => {
    const parsed = parseGameSettings(settings({
      actions: {
        start: { type: 'mountScene', scene: 'gameplay', unmount: ['menu'] },
        jump: { type: 'playSound', asset: 'jump', volume: 0.4, detune: 20 },
      },
    }));

    expect(parsed.assets.manifest).toBe('assets/assets.manifest.json');
    expect(parsed.scenes.definitions.gameplay.assetGroups).toEqual(['gameplay']);
    expect(parsed.scenes.definitions.gameplay.prefabs).toEqual([]);
    expect(parsed.actions.start).toEqual({ type: 'mountScene', scene: 'gameplay', unmount: ['menu'] });
    expect(parsed.actions.jump).toEqual({ type: 'playSound', asset: 'jump', volume: 0.4, detune: 20 });
  });

  it.each([
    [settings({ version: 2 }), 'unsupported schema version'],
    [settings({ managers: [manager('state'), manager('state')] }), "Duplicate manager id 'state'"],
    [settings({ managers: [manager('level', { dependsOn: ['missing'] })] }), "depends on unknown manager 'missing'"],
    [settings({ managers: [manager('a', { dependsOn: ['b'] }), manager('b', { dependsOn: ['a'] })] }), 'dependency cycle'],
    [settings({ managers: [manager('level', { mountWhen: ['missing'] })] }), "references unknown scene 'missing'"],
    [settings({ actions: { broken: { type: 'mountScene', scene: 'missing' } } }), "references unknown scene 'missing'"],
    [settings({ actions: { broken: { type: 'playSound' } } }), 'has no sound asset'],
  ])('rejects invalid settings', (input, message) => {
    expect(() => parseGameSettings(input)).toThrow(message);
  });

  it('rejects a runtime manager depending on a scene-lifetime manager', () => {
    expect(() => parseGameSettings(settings({
      managers: [
        manager('scene-input', { lifetime: 'scene' }),
        manager('state', { dependsOn: ['scene-input'], lifetime: 'runtime' }),
      ],
    }))).toThrow("Runtime manager 'state' cannot depend on scene manager 'scene-input'");
  });

  it('rejects dependencies that are inactive in one of the dependent manager modes', () => {
    expect(() => parseGameSettings(settings({
      managers: [
        manager('input', { modes: ['play'] }),
        manager('state', { dependsOn: ['input'], modes: ['play', 'editor'] }),
      ],
    }))).toThrow("Manager 'state' depends on 'input', which is not active in mode 'editor'");
  });

  it('rejects dependencies that cannot mount in every dependent scene', () => {
    expect(() => parseGameSettings(settings({
      managers: [
        manager('input', { mountWhen: ['menu'] }),
        manager('state', { dependsOn: ['input'], mountWhen: ['gameplay'] }),
      ],
    }))).toThrow("Manager 'state' depends on 'input', which does not mount in scene 'gameplay'");
  });
});
