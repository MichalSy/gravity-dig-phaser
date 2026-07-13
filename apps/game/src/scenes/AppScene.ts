import Phaser from 'phaser';
import { GAME_ANIMATION_SETS, GAME_FONT_ASSETS, GAME_GRAPHIC_ASSETS, loadGameAssets, loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import {
  GameRootNode,
  GameWorldNode,
  LevelNode,
  PlayerAnimatorNode,
  PlayerStateManagerNode,
} from '../game/nodes';
import { AnimatedImageNode, AudioNode, ButtonNode, CollisionRectNode, getDefinitionNodeTypeId, ImageNode, LineNode, NODE_TYPE_IDS, NodeRoot, NodeRuntime, NodeRuntimeMode, parseGameSettings, PrefabManager, RectangleNode, RuntimeManagerHost, SceneNode, SceneNodeFactoryRegistry, TextNode, TransformNode, type EditorPreviewSetPropsChange, type GameNode, type GameSettings, type SceneFileJson, type SceneNodeJson } from '../nodes';
import { GameplayInputNode } from '../app/nodes';
import { InputModeDetectorNode, TouchControlsNode, UIRootNode } from '../ui/nodes';
import { DebugBridgeNode, readDebugConnectionConfig } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../nodes';

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
  private menuScene!: GameNode;
  private loadingScene!: GameNode;
  private gameplayMounted = false;
  private launchMode: AppRuntimeLaunchMode = 'play';
  private editorSceneKey = 'gameplay';
  private debugConfig = readDebugConnectionConfig();
  private readonly dynamicModuleCache = new Map<string, { hash: string; module: DynamicNodeModule }>();
  private readonly dynamicScriptNodes = new Set<DynamicScriptNode>();

  constructor() {
    super('App-Root');
  }

  preload(): void {
    this.readLaunchParams();
    loadMenuAssets(this);
    if (this.launchMode === 'editor') loadGameAssets(this);
    this.load.json(GAME_SETTINGS_KEY, 'game.settings.json');
    this.load.json(DYNAMIC_NODE_MANIFEST_KEY, 'scripts-compiled/manifest.json');
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
    this.prefabManager = new PrefabManager(async (path) => {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Prefab '${path}' konnte nicht geladen werden: HTTP ${response.status}`);
      return await response.json() as SceneFileJson;
    });
    this.sceneFactory = this.createSceneFactory();
    await this.registerDynamicNodeModules();
    this.managerHost = new RuntimeManagerHost({
      runtime: this.appRuntime,
      factory: this.sceneFactory,
      prefabManager: this.prefabManager,
      settings: this.gameSettings,
      mode: this.launchMode,
      loadManager: (path) => this.fetchPublicJson(path),
    });
    this.appRuntime.registerImageAssets(MENU_GRAPHIC_ASSETS);
    this.appRuntime.registerFontAssets(GAME_FONT_ASSETS);
    if (this.launchMode === 'editor') {
      this.appRuntime.registerImageAssets(GAME_GRAPHIC_ASSETS);
      this.appRuntime.registerAnimationSets(GAME_ANIMATION_SETS);
    }
    if (this.launchMode === 'play' && this.debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(this.debugConfig, {
      createNode: (definition) => this.sceneFactory.createTree(definition),
      hasDynamicModule: (module) => this.hasDynamicNodeModule(module),
      ensureDynamicModule: (module, code) => this.ensureDynamicNodeModule(module, code),
      reloadDynamicModule: (module, code) => this.reloadDynamicNodeModule(module, code),
    }));

    this.appRoot = this.appRuntime.addRoot(new NodeRoot({ rootName: this.launchMode === 'editor' ? 'Editor-Root' : 'App-Root' }));
    if (this.launchMode === 'editor') {
      const sceneId = this.gameSettings.scenes.definitions[this.editorSceneKey] ? this.editorSceneKey : this.gameSettings.scenes.editorDefault;
      await this.managerHost.activateScene(sceneId);
      this.appRoot.addChild(await this.createScene(sceneId));
    } else {
      this.menuScene = this.appRoot.addChild(await this.createScene(this.gameSettings.scenes.startup));
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

  private async startGame(): Promise<void> {
    this.appRoot.removeChild(this.menuScene);
    this.loadingScene = this.appRoot.addChild(await this.createScene('loading'));
    this.appRuntime.resolve();
  }

  private loadGameplayAssets(source: DynamicScriptNode): void {
    const setProgress = (progress: number): void => { source.callScriptMethod('setProgress', progress); };
    const complete = (): void => {
      this.load.off('progress', setProgress);
      this.appRuntime.registerImageAssets(GAME_GRAPHIC_ASSETS);
      this.appRuntime.registerAnimationSets(GAME_ANIMATION_SETS);
      this.appRuntime.registerFontAssets(GAME_FONT_ASSETS);
      source.callScriptMethod('complete');
    };

    setProgress(0);
    if (this.textures.exists('tiles') && this.cache.json.exists('dev-planet')) {
      setProgress(1);
      complete();
      return;
    }

    this.load.on('progress', setProgress);
    this.load.once('complete', complete);
    loadGameAssets(this);
    this.load.start();
  }

  private async mountGameplay(): Promise<void> {
    if (this.gameplayMounted) return;

    this.gameplayMounted = true;
    await this.managerHost.activateScene('gameplay');
    await this.mountGameplayScenes();
    this.unmountStartupNodes();
  }

  private unmountStartupNodes(): void {
    this.appRoot.removeChild(this.menuScene);
    this.appRoot.removeChild(this.loadingScene);
  }

  private async mountGameplayScenes(): Promise<void> {
    await Promise.all([
      this.prefabManager.ensure('prefabs/player.prefab.json'),
      this.prefabManager.ensure('prefabs/ship.prefab.json'),
    ]);
    this.appRoot.addChild(await this.createScene('gameplay'));
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
    this.sceneFactory.register(module.nodeTypeId, (definition) => this.createDynamicScriptNode(module, definition));
    return true;
  }

  private createDynamicScriptNode(module: DynamicNodeModule, definition: SceneNodeJson): DynamicScriptNode {
    const node = new DynamicScriptNode({
      module,
      nodeTypeId: getDefinitionNodeTypeId(definition),
      instanceId: definition.instanceId,
      name: definition.name,
      props: definition.props,
      actions: this.createScriptActions(),
      instantiatePrefab: (prefabId, options) => this.sceneFactory.createPrefab(prefabId, options, { origin: 'runtime-script', createdByInstanceId: definition.instanceId }),
    });
    this.dynamicScriptNodes.add(node);
    return node;
  }

  private createScriptActions(): Record<string, (source: DynamicScriptNode) => void> {
    return {
      'game:start': () => { void this.startGame(); },
      'game:load': (source) => this.loadGameplayAssets(source),
      'game:mount': () => { void this.mountGameplay(); },
      'player:jump': () => this.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) }),
    };
  }

  private async reloadDynamicNodeModule(entry: DynamicNodeManifestEntry | { nodeTypeId?: string; hash: string; url?: string }, code: string): Promise<number> {
    const ready = await this.ensureDynamicNodeModule(entry, code);
    if (!ready || !entry.nodeTypeId) return 0;
    const cached = this.dynamicModuleCache.get(entry.nodeTypeId);
    if (!cached) return 0;
    let reloaded = 0;
    for (const node of [...this.dynamicScriptNodes]) {
      if (!node.isInitialized) {
        this.dynamicScriptNodes.delete(node);
        continue;
      }
      if (node.nodeTypeId !== entry.nodeTypeId) continue;
      node.reloadModule(cached.module);
      reloaded += 1;
    }
    return reloaded;
  }

  private async createScene(sceneId: string): Promise<GameNode> {
    const definition = this.gameSettings.scenes.definitions[sceneId];
    if (!definition) throw new Error(`Scene '${sceneId}' is not defined in game.settings.json`);
    const scene = await this.fetchPublicJson(definition.path);
    await this.prefabManager.ensureDefinitions(scene.root);
    return this.sceneFactory.createTree(scene.root);
  }

  private async fetchPublicJson(path: string): Promise<SceneFileJson> {
    const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Public JSON '${path}' could not be loaded: HTTP ${response.status}`);
    return await response.json() as SceneFileJson;
  }

  private createSceneFactory(): SceneNodeFactoryRegistry {
    return new SceneNodeFactoryRegistry()
      .withPreviewChanges(this.readPreviewChanges())
      .withPrefabManager(this.prefabManager)
      .register(NODE_TYPE_IDS.TransformNode, (definition) => new TransformNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.SceneNode, (definition) => new SceneNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) }))
      .register(NODE_TYPE_IDS.ButtonNode, (definition) => new ButtonNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameplayInputNode, (definition) => new GameplayInputNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerStateManagerNode, (definition) => new PlayerStateManagerNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LevelNode, (definition) => new LevelNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameWorldNode, (definition) => new GameWorldNode({
        ...optionsFrom(definition),
        instantiatePrefab: (prefabId) => this.sceneFactory.createPrefab(prefabId, {}, { origin: 'runtime-code', createdByInstanceId: definition.instanceId }),
      }))
      .register(NODE_TYPE_IDS.PlayerAnimatorNode, (definition) => new PlayerAnimatorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.InputModeDetectorNode, (definition) => new InputModeDetectorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameRootNode, (definition) => new GameRootNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.UIRootNode, (definition) => new UIRootNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.TouchControlsNode, (definition) => new TouchControlsNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ImageNode, (definition) => new ImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_TYPE_IDS.TextNode, (definition) => new TextNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.AnimatedImageNode, (definition) => new AnimatedImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof AnimatedImageNode>[0]))
      .register(NODE_TYPE_IDS.CollisionRectNode, (definition) => new CollisionRectNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LineNode, (definition) => new LineNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.RectangleNode, (definition) => new RectangleNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.AudioNode, (definition) => new AudioNode(optionsFrom(definition)));
  }

  private readPreviewChanges(): EditorPreviewSetPropsChange[] {
    const payload = this.cache.json.get(PREVIEW_CHANGES_KEY) as { changes?: EditorPreviewSetPropsChange[] } | undefined;
    return payload?.changes?.filter((change) => change.kind === 'setProps' && Array.isArray(change.target.nodePath)) ?? [];
  }

}

function optionsFrom(definition: SceneNodeJson): Record<string, unknown> {
  return { nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) };
}
