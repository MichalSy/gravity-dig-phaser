import type { GameNode } from './GameNode';
import type { SceneFileJson, SceneNodeJson } from './SceneNodeFactory';

export type PrefabLoader = (path: string) => Promise<SceneFileJson>;

export class PrefabManager {
  private readonly definitions = new Map<string, SceneFileJson>();
  private readonly pendingLoads = new Map<string, Promise<SceneFileJson>>();
  private readonly instances = new Map<string, Set<GameNode>>();
  private readonly listeners = new Set<(path: string, definition: SceneFileJson) => void>();
  private readonly loader: PrefabLoader;

  constructor(loader: PrefabLoader) {
    this.loader = loader;
  }

  has(path: string): boolean {
    return this.definitions.has(path);
  }

  get(path: string): SceneFileJson {
    const prefab = this.definitions.get(path);
    if (!prefab) throw new Error(`Prefab '${path}' has not been loaded`);
    return prefab;
  }

  async ensure(path: string): Promise<SceneFileJson> {
    const cached = this.definitions.get(path);
    if (cached) return cached;
    const pending = this.pendingLoads.get(path);
    if (pending) return pending;
    const load = this.loader(path).then(async (definition) => {
      validatePrefab(path, definition);
      this.definitions.set(path, definition);
      await this.ensureDefinitions(definition.root);
      return definition;
    }).finally(() => this.pendingLoads.delete(path));
    this.pendingLoads.set(path, load);
    return load;
  }

  async ensureDefinitions(definition: SceneNodeJson): Promise<void> {
    const paths = collectPrefabPaths(definition);
    await Promise.all(paths.map((path) => this.ensure(path)));
  }

  async reload(path: string): Promise<SceneFileJson> {
    this.definitions.delete(path);
    const definition = await this.ensure(path);
    for (const listener of this.listeners) listener(path, definition);
    return definition;
  }

  onReload(listener: (path: string, definition: SceneFileJson) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register(path: string, instance: GameNode): void {
    const instances = this.instances.get(path) ?? new Set<GameNode>();
    instances.add(instance);
    this.instances.set(path, instances);
  }

  unregister(path: string, instance: GameNode): void {
    const instances = this.instances.get(path);
    instances?.delete(instance);
    if (instances?.size === 0) this.instances.delete(path);
  }

  getInstances(path: string): readonly GameNode[] {
    return [...(this.instances.get(path) ?? [])];
  }
}

export function collectPrefabPaths(definition: SceneNodeJson, target = new Set<string>()): string[] {
  if (definition.prefab) target.add(definition.prefab);
  for (const child of definition.children ?? []) collectPrefabPaths(child, target);
  return [...target];
}

function validatePrefab(path: string, definition: SceneFileJson): void {
  if (!definition || definition.version !== 1 || !definition.root || typeof definition.root !== 'object') throw new Error(`Prefab '${path}' is invalid`);
}
