import Phaser from 'phaser';
import type { DebugDynamicNodeBundleReference } from '@gravity-dig/debug-protocol';
import { loadAssetGroups, parsePublicAssetManifest, runtimeAssetDefinitions, type PublicAssetManifest } from '../assets/AssetLoader';
import { createGravityDigNodeFactory, NodeRoot, NodeRuntime, NodeRuntimeMode, parseGameSettings, PrefabManager, registerGravityDigDynamicModule, RuntimeManagerHost, SceneNodeFactoryRegistry, type EditorPreviewSetPropsChange, type GameNode, type GameSettings, type SceneFileJson } from '../nodes';
import { DebugBridgeNode, readDebugConnectionConfig } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, loadDynamicNodeModulesFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../nodes';

const GAME_SETTINGS_KEY = 'game:settings';
const PREVIEW_CHANGES_KEY = 'editor:preview-changes';
const DYNAMIC_NODE_MANIFEST_KEY = 'dynamic-nodes:manifest';

type AppRuntimeLaunchMode = 'play' | 'editor';

export class AppScene extends Phaser.Scene {
  private appRuntime!: NodeRuntime;
  private appRoot!: NodeRoot;
  private sceneFactory!: SceneNodeFactoryRegistry;
  private prefabManager!: PrefabManager;
  private managerHost!: RuntimeManagerHost;
  private gameSettings!: GameSettings;
  private assetManifest!: PublicAssetManifest;
  private readonly loadedAssetGroups = new Set<string>();
  private readonly mountedScenes = new Map<string, GameNode>();
  private launchMode: AppRuntimeLaunchMode = 'play';
  private editorSceneKey?: string;
  private debugConfig = readDebugConnectionConfig();
  private readonly dynamicModuleCache = new Map<string, { hash: string; module: DynamicNodeModule }>();
  private readonly dynamicScriptNodes = new Set<DynamicScriptNode>();

  constructor() {
    super('App-Root');
  }

  preload(): void {
    this.readLaunchParams();
    this.load.json(GAME_SETTINGS_KEY, 'game.settings.json');
    this.load.json(DYNAMIC_NODE_MANIFEST_KEY, `scripts-compiled/manifest.json?v=${Date.now().toString(36)}`);
    if (this.debugConfig) {
      const previewUrl = new URL(`/api/editor/changes/${encodeURIComponent(this.debugConfig.sessionId)}/preview`, this.debugConfig.editorApiUrl);
      previewUrl.searchParams.set('cacheBust', Date.now().toString(36));
      this.load.json(PREVIEW_CHANGES_KEY, previewUrl.toString());
    }
  }

  create(): void {
    void this.createAsync();
  }

  update(_time: number, deltaMs: number): void {
    this.appRuntime?.update(deltaMs);
  }

  private async createAsync(): Promise<void> {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');

    this.appRuntime = new NodeRuntime({ phaserScene: this, mode: this.launchMode === 'editor' ? NodeRuntimeMode.Editor : NodeRuntimeMode.Play });
    this.gameSettings = parseGameSettings(this.cache.json.get(GAME_SETTINGS_KEY));
    this.assetManifest = parsePublicAssetManifest(await this.fetchPublicJson<unknown>(this.gameSettings.assets.manifest));
    const initialSceneId = this.launchMode === 'editor'
      ? (this.editorSceneKey && this.gameSettings.scenes.definitions[this.editorSceneKey] ? this.editorSceneKey : this.gameSettings.scenes.editorDefault)
      : this.gameSettings.scenes.startup;
    await this.ensureSceneAssets(initialSceneId);
    this.prefabManager = new PrefabManager(async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Prefab '${path}' konnte nicht geladen werden: HTTP ${response.status}`);
      return await response.json() as SceneFileJson;
    });
    this.sceneFactory = createGravityDigNodeFactory({
      prefabManager: this.prefabManager,
      previewChanges: this.readPreviewChanges(),
      createScriptActions: () => this.createScriptActions(),
      onDynamicScriptNode: (node) => this.dynamicScriptNodes.add(node),
    });
    await this.registerDynamicNodeModules();
    this.managerHost = new RuntimeManagerHost({
      runtime: this.appRuntime,
      factory: this.sceneFactory,
      prefabManager: this.prefabManager,
      settings: this.gameSettings,
      mode: this.launchMode,
      loadManager: (path) => this.fetchPublicJson(path),
    });

    if (this.launchMode === 'play' && this.debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(this.debugConfig, {
      createNode: (definition) => this.sceneFactory.createTree(definition),
      hasDynamicModule: (module) => this.hasDynamicNodeModule(module),
      ensureDynamicModule: (module, code) => this.ensureDynamicNodeModule(module, code),
      reloadDynamicBundle: (bundle, code) => this.reloadDynamicNodeBundle(bundle, code),
    }));

    this.appRoot = this.appRuntime.addRoot(new NodeRoot({ rootName: this.launchMode === 'editor' ? 'Editor-Root' : 'App-Root' }));
    if (this.launchMode === 'editor') {
      await this.mountScene(initialSceneId);
    } else {
      await this.mountScene(initialSceneId);
    }

    this.appRuntime.init();
    this.appRuntime.resolve();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.appRuntime.destroy();
    });
  }

  private readLaunchParams(): void {
    const params = new URLSearchParams(window.location.search);
    this.launchMode = params.get('runtimeMode') === 'editor' ? 'editor' : 'play';
    const scene = params.get('editorScene');
    if (scene) this.editorSceneKey = scene;
  }


  private async registerDynamicNodeModules(): Promise<void> {
    const manifest = this.cache.json.get(DYNAMIC_NODE_MANIFEST_KEY) as DynamicNodeManifest | undefined;
    for (const entry of manifest?.nodes ?? []) await this.ensureDynamicNodeModule(entry);
  }

  private hasDynamicNodeModule(entry: DynamicNodeManifestEntry | { nodeTypeId?: string; hash: string }): boolean {
    const nodeTypeId = entry.nodeTypeId;
    return Boolean(nodeTypeId && this.dynamicModuleCache.get(nodeTypeId)?.hash === entry.hash);
  }

  private async ensureDynamicNodeModule(entry: DynamicNodeManifestEntry | { nodeTypeId?: string; hash: string; url?: string }, code?: string): Promise<boolean> {
    const nodeTypeId = entry.nodeTypeId;
    if (!nodeTypeId) return false;
    const cached = this.dynamicModuleCache.get(nodeTypeId);
    if (cached?.hash === entry.hash) return true;

    const module = code
      ? await loadDynamicNodeModuleFromCode(code, nodeTypeId, entry.hash)
      : entry.url
        ? await loadDynamicNodeModule({ url: entry.url, hash: entry.hash, nodeTypeId })
        : undefined;
    if (!module || module.nodeTypeId !== nodeTypeId) return false;

    this.dynamicModuleCache.set(nodeTypeId, { hash: entry.hash, module });
    registerGravityDigDynamicModule(this.sceneFactory, module, {
      createScriptActions: () => this.createScriptActions(),
      onDynamicScriptNode: (node) => this.dynamicScriptNodes.add(node),
    });
    return true;
  }

  private createScriptActions(): Record<string, (source: DynamicScriptNode) => void> {
    return Object.fromEntries(Object.keys(this.gameSettings.actions).map((event) => [
      event,
      (source: DynamicScriptNode) => { void this.runConfiguredAction(event, source); },
    ]));
  }

  private async runConfiguredAction(event: string, source: DynamicScriptNode): Promise<void> {
    const action = this.gameSettings.actions[event];
    if (!action) return;
    if (action.type === 'playSound') {
      const detune = action.detune > 0 ? Phaser.Math.Between(-action.detune, action.detune) : 0;
      this.sound.play(action.asset, { volume: action.volume, detune });
      return;
    }
    if (action.type === 'loadSceneAssets') {
      await this.ensureSceneAssets(action.scene, (progress) => source.callScriptMethod('setProgress', progress));
      source.callScriptMethod('complete');
      return;
    }
    await this.mountScene(action.scene);
    this.unmountScenes(action.unmount);
    this.appRuntime.resolve();
  }

  private async mountScene(sceneId: string): Promise<void> {
    if (this.mountedScenes.has(sceneId)) return;
    await this.ensureSceneAssets(sceneId);
    await this.managerHost.activateScene(sceneId);
    const scene = this.appRoot.addChild(await this.createScene(sceneId));
    this.mountedScenes.set(sceneId, scene);
  }

  private unmountScenes(sceneIds: readonly string[]): void {
    for (const sceneId of sceneIds) {
      const scene = this.mountedScenes.get(sceneId);
      if (!scene) continue;
      this.appRoot.removeChild(scene);
      this.mountedScenes.delete(sceneId);
    }
  }

  private async ensureSceneAssets(sceneId: string, onProgress?: (progress: number) => void): Promise<void> {
    const definition = this.gameSettings.scenes.definitions[sceneId];
    if (!definition) throw new Error(`Scene '${sceneId}' is not defined in game.settings.json`);
    const groups = definition.assetGroups.filter((groupId) => !this.loadedAssetGroups.has(groupId));
    await loadAssetGroups(this, this.assetManifest, groups, onProgress);
    groups.forEach((groupId) => this.loadedAssetGroups.add(groupId));
    const assets = runtimeAssetDefinitions(this, this.assetManifest, [...this.loadedAssetGroups]);
    this.appRuntime.registerImageAssets(assets.images);
    this.appRuntime.registerAnimationSets(assets.animationSets);
    this.appRuntime.registerFontAssets(assets.fonts);
  }

  private async reloadDynamicNodeBundle(bundle: DebugDynamicNodeBundleReference, code: string): Promise<{ modules: number; reloaded: number }> {
    const importedModules = await loadDynamicNodeModulesFromCode(code, bundle.hash);
    const expectedTypeIds = new Set(bundle.nodeTypeIds);
    const modules = importedModules.filter((module) => expectedTypeIds.has(module.nodeTypeId));
    if (modules.length !== expectedTypeIds.size) throw new Error(`Bundle '${bundle.hash}' enthält nicht alle erwarteten Dynamic Nodes.`);
    let reloaded = 0;
    for (const module of modules) {
      this.dynamicModuleCache.set(module.nodeTypeId, { hash: bundle.hash, module });
      registerGravityDigDynamicModule(this.sceneFactory, module, {
        createScriptActions: () => this.createScriptActions(),
        onDynamicScriptNode: (node) => this.dynamicScriptNodes.add(node),
      });
      for (const node of [...this.dynamicScriptNodes]) {
        if (!node.isInitialized) {
          this.dynamicScriptNodes.delete(node);
          continue;
        }
        if (node.nodeTypeId !== module.nodeTypeId) continue;
        node.reloadModule(module);
        reloaded += 1;
      }
    }
    return { modules: modules.length, reloaded };
  }

  private async createScene(sceneId: string): Promise<GameNode> {
    const definition = this.gameSettings.scenes.definitions[sceneId];
    if (!definition) throw new Error(`Scene '${sceneId}' is not defined in game.settings.json`);
    await Promise.all(definition.prefabs.map((path) => this.prefabManager.ensure(path)));
    const scene = await this.fetchPublicJson<SceneFileJson>(definition.path);
    await this.prefabManager.ensureDefinitions(scene.root);
    return this.sceneFactory.createTree(scene.root);
  }

  private async fetchPublicJson<T = SceneFileJson>(path: string): Promise<T> {
    const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Public JSON '${path}' could not be loaded: HTTP ${response.status}`);
    return await response.json() as T;
  }



  private readPreviewChanges(): EditorPreviewSetPropsChange[] {
    const payload = this.cache.json.get(PREVIEW_CHANGES_KEY) as { changes?: EditorPreviewSetPropsChange[] } | undefined;
    return payload?.changes?.filter((change) => change.kind === 'setProps' && Array.isArray(change.target.nodePath)) ?? [];
  }

}
