import type { GameSettings, GameRuntimeMode, GameManagerSettings } from '../config/GameSettings';
import { managersForScene } from '../config/GameSettings';
import type { GameNode } from './GameNode';
import type { NodeRuntime } from './NodeRuntime';
import type { PrefabManager } from './PrefabManager';
import type { SceneFileJson, SceneNodeFactoryRegistry } from './SceneNodeFactory';

export interface RuntimeManagerHostOptions {
  runtime: NodeRuntime;
  factory: SceneNodeFactoryRegistry;
  prefabManager: PrefabManager;
  settings: GameSettings;
  mode: GameRuntimeMode;
  loadManager(path: string): Promise<SceneFileJson>;
}

interface MountedManager {
  definition: GameManagerSettings;
  node: GameNode;
}

export class RuntimeManagerHost {
  private readonly runtime: NodeRuntime;
  private factory: SceneNodeFactoryRegistry;
  private prefabManager: PrefabManager;
  private readonly settings: GameSettings;
  private readonly mode: GameRuntimeMode;
  private readonly loadManager: (path: string) => Promise<SceneFileJson>;
  private readonly mounted = new Map<string, MountedManager>();
  private activeSceneId?: string;

  constructor(options: RuntimeManagerHostOptions) {
    this.runtime = options.runtime;
    this.factory = options.factory;
    this.prefabManager = options.prefabManager;
    this.settings = options.settings;
    this.mode = options.mode;
    this.loadManager = options.loadManager;
  }

  updateFactory(factory: SceneNodeFactoryRegistry, prefabManager: PrefabManager): void {
    this.factory = factory;
    this.prefabManager = prefabManager;
  }

  get mountedManagers(): readonly GameNode[] {
    return [...this.mounted.values()].map(({ node }) => node);
  }

  async activateScene(sceneId: string): Promise<void> {
    const requested = managersForScene(this.settings, sceneId, this.mode);
    const requestedIds = new Set(requested.map((manager) => manager.id));

    const sceneManagersToRemove = [...this.mounted.values()]
      .filter(({ definition }) => definition.lifetime === 'scene' && !requestedIds.has(definition.id))
      .reverse();
    for (const manager of sceneManagersToRemove) this.unmount(manager.definition.id);

    for (const definition of requested) {
      if (this.mounted.has(definition.id)) continue;
      for (const dependencyId of definition.dependsOn ?? []) {
        if (!this.mounted.has(dependencyId) && !requestedIds.has(dependencyId)) {
          throw new Error(`Manager '${definition.id}' requires inactive manager '${dependencyId}'`);
        }
      }
      await this.mount(definition);
    }
    this.activeSceneId = sceneId;
  }

  deactivateScene(sceneId: string): void {
    if (this.activeSceneId !== sceneId) return;
    const active = managersForScene(this.settings, sceneId, this.mode);
    for (const definition of [...active].reverse()) {
      if (definition.lifetime === 'scene') this.unmount(definition.id);
    }
    this.activeSceneId = undefined;
  }

  destroy(): void {
    for (const id of [...this.mounted.keys()].reverse()) this.unmount(id);
    this.activeSceneId = undefined;
  }

  private async mount(definition: GameManagerSettings): Promise<void> {
    const source = await this.loadManager(definition.path);
    await this.prefabManager.ensureDefinitions(source.root);
    const node = this.factory.createTree(source.root, { origin: 'runtime-code', managerPath: definition.path });
    if (node.parent) throw new Error(`Manager '${definition.id}' root cannot have a parent`);
    this.runtime.addPersistentNode(node);
    this.mounted.set(definition.id, { definition, node });
  }

  private unmount(id: string): void {
    const mounted = this.mounted.get(id);
    if (!mounted) return;
    this.runtime.removePersistentNode(mounted.node);
    this.mounted.delete(id);
  }
}
