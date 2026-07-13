import type { NodeRuntimeMode } from '../nodes/NodeRuntimeMode';

export type GameRuntimeMode = 'play' | 'editor';
export type ManagerLifetime = 'runtime' | 'scene';

export interface GameSceneSettings {
  path: string;
  assetGroup?: string;
}

export interface GameManagerSettings {
  id: string;
  path: string;
  mountWhen: string[];
  lifetime: ManagerLifetime;
  modes: GameRuntimeMode[];
  dependsOn?: string[];
  order?: number;
}

export interface GameSettings {
  version: 1;
  scenes: {
    startup: string;
    editorDefault: string;
    definitions: Record<string, GameSceneSettings>;
  };
  managers: GameManagerSettings[];
}

export function parseGameSettings(value: unknown): GameSettings {
  if (!isRecord(value) || value.version !== 1) throw new Error('game.settings.json uses an unsupported schema version');
  const scenes = value.scenes;
  if (!isRecord(scenes) || typeof scenes.startup !== 'string' || typeof scenes.editorDefault !== 'string' || !isRecord(scenes.definitions)) {
    throw new Error('game.settings.json has invalid scene settings');
  }

  const definitions: Record<string, GameSceneSettings> = {};
  for (const [id, definition] of Object.entries(scenes.definitions)) {
    if (!isRecord(definition) || typeof definition.path !== 'string' || definition.path.length === 0) {
      throw new Error(`Scene '${id}' has no valid path`);
    }
    definitions[id] = {
      path: definition.path,
      assetGroup: typeof definition.assetGroup === 'string' ? definition.assetGroup : undefined,
    };
  }
  if (!definitions[scenes.startup]) throw new Error(`Startup scene '${scenes.startup}' is not defined`);
  if (!definitions[scenes.editorDefault]) throw new Error(`Editor default scene '${scenes.editorDefault}' is not defined`);

  if (!Array.isArray(value.managers)) throw new Error('game.settings.json managers must be an array');
  const managers = value.managers.map(parseManagerSettings);
  const ids = new Set<string>();
  const managersById = new Map<string, GameManagerSettings>();
  for (const manager of managers) {
    if (ids.has(manager.id)) throw new Error(`Duplicate manager id '${manager.id}'`);
    ids.add(manager.id);
    managersById.set(manager.id, manager);
  }
  for (const manager of managers) {
    for (const dependency of manager.dependsOn ?? []) {
      const dependencyManager = managersById.get(dependency);
      if (!dependencyManager) throw new Error(`Manager '${manager.id}' depends on unknown manager '${dependency}'`);
      if (manager.lifetime === 'runtime' && dependencyManager.lifetime === 'scene') {
        throw new Error(`Runtime manager '${manager.id}' cannot depend on scene manager '${dependency}'`);
      }
      for (const mode of manager.modes) {
        if (!dependencyManager.modes.includes(mode)) {
          throw new Error(`Manager '${manager.id}' depends on '${dependency}', which is not active in mode '${mode}'`);
        }
      }
      for (const sceneId of manager.mountWhen) {
        if (!dependencyManager.mountWhen.includes(sceneId)) {
          throw new Error(`Manager '${manager.id}' depends on '${dependency}', which does not mount in scene '${sceneId}'`);
        }
      }
    }
    for (const sceneId of manager.mountWhen) {
      if (!definitions[sceneId]) throw new Error(`Manager '${manager.id}' references unknown scene '${sceneId}'`);
    }
  }
  topologicallySortManagers(managers);

  return {
    version: 1,
    scenes: { startup: scenes.startup, editorDefault: scenes.editorDefault, definitions },
    managers,
  };
}

export function runtimeModeName(mode: NodeRuntimeMode): GameRuntimeMode {
  return mode === 'editor' ? 'editor' : 'play';
}

export function managersForScene(settings: GameSettings, sceneId: string, mode: GameRuntimeMode): GameManagerSettings[] {
  const active = settings.managers.filter((manager) => manager.modes.includes(mode) && manager.mountWhen.includes(sceneId));
  return topologicallySortManagers(active, settings.managers);
}

export function topologicallySortManagers(managers: readonly GameManagerSettings[], dependencySource = managers): GameManagerSettings[] {
  const available = new Map(dependencySource.map((manager) => [manager.id, manager]));
  const selected = new Map(managers.map((manager) => [manager.id, manager]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: GameManagerSettings[] = [];

  const visit = (manager: GameManagerSettings): void => {
    if (visited.has(manager.id)) return;
    if (visiting.has(manager.id)) throw new Error(`Manager dependency cycle includes '${manager.id}'`);
    visiting.add(manager.id);
    for (const dependencyId of manager.dependsOn ?? []) {
      const dependency = available.get(dependencyId);
      if (!dependency) throw new Error(`Manager '${manager.id}' depends on unknown manager '${dependencyId}'`);
      if (selected.has(dependencyId)) visit(dependency);
    }
    visiting.delete(manager.id);
    visited.add(manager.id);
    result.push(manager);
  };

  for (const manager of [...managers].sort(compareManagers)) visit(manager);
  return result;
}

function parseManagerSettings(value: unknown, index: number): GameManagerSettings {
  if (!isRecord(value)) throw new Error(`Manager at index ${index} is invalid`);
  if (typeof value.id !== 'string' || value.id.length === 0) throw new Error(`Manager at index ${index} has no id`);
  if (typeof value.path !== 'string' || value.path.length === 0) throw new Error(`Manager '${value.id}' has no path`);
  if (!Array.isArray(value.mountWhen) || !value.mountWhen.every((entry) => typeof entry === 'string')) {
    throw new Error(`Manager '${value.id}' has invalid mountWhen settings`);
  }
  if (value.lifetime !== 'runtime' && value.lifetime !== 'scene') throw new Error(`Manager '${value.id}' has invalid lifetime`);
  if (!Array.isArray(value.modes) || !value.modes.every((entry) => entry === 'play' || entry === 'editor')) {
    throw new Error(`Manager '${value.id}' has invalid modes`);
  }
  if (value.dependsOn !== undefined && (!Array.isArray(value.dependsOn) || !value.dependsOn.every((entry) => typeof entry === 'string'))) {
    throw new Error(`Manager '${value.id}' has invalid dependsOn settings`);
  }
  return {
    id: value.id,
    path: value.path,
    mountWhen: [...value.mountWhen] as string[],
    lifetime: value.lifetime,
    modes: [...value.modes] as GameRuntimeMode[],
    dependsOn: value.dependsOn ? [...value.dependsOn] as string[] : undefined,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 0,
  };
}

function compareManagers(left: GameManagerSettings, right: GameManagerSettings): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
