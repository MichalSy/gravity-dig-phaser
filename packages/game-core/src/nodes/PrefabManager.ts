import type { GameNode } from './GameNode';
import type { SceneFileJson, SceneNodeJson } from './SceneNodeFactory';

export type PrefabLoader = (path: string) => Promise<SceneFileJson>;

export class PrefabManager {
  private readonly definitions = new Map<string, SceneFileJson>();
  private readonly definitionsById = new Map<string, SceneFileJson>();
  private readonly pathsById = new Map<string, string>();
  private readonly nodesById = new Map<string, Map<string, SceneNodeJson>>();
  private readonly pendingLoads = new Map<string, Promise<SceneFileJson>>();
  private readonly instancesByPrefabId = new Map<string, Map<string, GameNode>>();
  private readonly listeners = new Set<(path: string, definition: SceneFileJson) => void>();
  private readonly loader: PrefabLoader;
  private nextRuntimeInstance = 1;

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

  getNode(path: string, nodeId: string): SceneNodeJson | undefined {
    return this.nodesById.get(path)?.get(nodeId);
  }

  getById(prefabId: string): SceneFileJson {
    const prefab = this.definitionsById.get(prefabId);
    if (!prefab) throw new Error(`Prefab '${prefabId}' has not been loaded`);
    return prefab;
  }

  getPath(prefabId: string): string | undefined {
    return this.pathsById.get(prefabId);
  }

  allocateRuntimeInstanceId(prefabId: string, nodeId: string): string {
    return `prefab:${prefabId}:${this.nextRuntimeInstance++}:${nodeId}`;
  }

  instantiate(prefabId: string, create: (path: string, definition: SceneFileJson) => GameNode): GameNode {
    const path = this.pathsById.get(prefabId);
    const definition = this.definitionsById.get(prefabId);
    if (!path || !definition) throw new Error(`Prefab '${prefabId}' has not been loaded`);
    return create(path, definition);
  }

  async ensure(path: string): Promise<SceneFileJson> {
    const cached = this.definitions.get(path);
    if (cached) return cached;
    const pending = this.pendingLoads.get(path);
    if (pending) return pending;
    const load = this.loader(path).then(async (definition) => {
      validatePrefab(path, definition);
      this.definitions.set(path, definition);
      this.definitionsById.set(definition.prefabId!, definition);
      this.pathsById.set(definition.prefabId!, path);
      this.nodesById.set(path, indexPrefabNodes(path, definition.root));
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

  async reloadById(prefabId: string): Promise<SceneFileJson> {
    const path = this.pathsById.get(prefabId);
    if (!path) throw new Error(`Prefab '${prefabId}' has not been loaded`);
    return this.reload(path);
  }

  async reload(path: string): Promise<SceneFileJson> {
    const previous = this.definitions.get(path);
    const definition = await this.loader(path);
    validatePrefab(path, definition);
    if (previous?.prefabId && definition.prefabId !== previous.prefabId) throw new Error(`Prefab '${path}' changed prefabId from '${previous.prefabId}' to '${definition.prefabId}'`);
    const nodeIndex = indexPrefabNodes(path, definition.root);
    await this.ensureDefinitions(definition.root);
    this.definitions.set(path, definition);
    this.definitionsById.set(definition.prefabId!, definition);
    this.pathsById.set(definition.prefabId!, path);
    this.nodesById.set(path, nodeIndex);
    for (const listener of this.listeners) listener(path, definition);
    return definition;
  }

  onReload(listener: (path: string, definition: SceneFileJson) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  register(path: string, instance: GameNode): void {
    const prefabId = this.get(path).prefabId!;
    const instances = this.instancesByPrefabId.get(prefabId) ?? new Map<string, GameNode>();
    instances.set(instance.instanceId, instance);
    this.instancesByPrefabId.set(prefabId, instances);
  }

  unregister(path: string, instance: GameNode): void {
    const prefabId = this.definitions.get(path)?.prefabId;
    if (!prefabId) return;
    const instances = this.instancesByPrefabId.get(prefabId);
    instances?.delete(instance.instanceId);
    if (instances?.size === 0) this.instancesByPrefabId.delete(prefabId);
  }

  getInstances(path: string): readonly GameNode[] {
    const prefabId = this.get(path).prefabId!;
    return [...(this.instancesByPrefabId.get(prefabId)?.values() ?? [])];
  }

  getInstancesByPrefabId(prefabId: string): readonly GameNode[] {
    return [...(this.instancesByPrefabId.get(prefabId)?.values() ?? [])];
  }
}

export function collectPrefabPaths(definition: SceneNodeJson, target = new Set<string>()): string[] {
  collectPrefabReferences(definition, target, new WeakSet<object>());
  return [...target];
}

function collectPrefabReferences(value: unknown, target: Set<string>, visited: WeakSet<object>): void {
  if (typeof value === 'string') {
    if (isPrefabPath(value)) target.add(value);
    return;
  }
  if (!value || typeof value !== 'object' || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPrefabReferences(item, target, visited);
    return;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) collectPrefabReferences(nested, target, visited);
}

function isPrefabPath(value: string): boolean {
  return value.endsWith('.prefab.json');
}

function validatePrefab(path: string, definition: SceneFileJson): void {
  if (!definition || definition.version !== 1 || !definition.root || typeof definition.root !== 'object') throw new Error(`Prefab '${path}' is invalid`);
  if (!definition.prefabId) throw new Error(`Prefab '${path}' needs a prefabId`);
}

function indexPrefabNodes(path: string, root: SceneNodeJson): Map<string, SceneNodeJson> {
  const nodes = new Map<string, SceneNodeJson>();
  const visit = (node: SceneNodeJson): void => {
    if (!node.nodeId) throw new Error(`Prefab '${path}' node '${node.name ?? '<unnamed>'}' needs a nodeId`);
    if (nodes.has(node.nodeId)) throw new Error(`Prefab '${path}' contains duplicate nodeId '${node.nodeId}'`);
    nodes.set(node.nodeId, node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return nodes;
}
