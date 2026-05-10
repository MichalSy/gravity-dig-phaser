import Phaser from 'phaser';
import { loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import {
  GameRootNode,
  GameWorldNode,
  LevelGeneratorManagerNode,
  LevelNode,
  MiningToolNode,
  PlayerAnimatorNode,
  PlayerMovementControllerNode,
  PlayerNode,
  PlayerStateManagerNode,
  ShipNode,
} from '../game/nodes';
import { AnimatedImageNode, collectNodesByName, CollisionRectNode, getDefinitionNodeTypeId, ImageNode, NODE_TYPE_IDS, NodeRoot, NodeRuntime, NodeRuntimeMode, SceneNode, SceneNodeFactoryRegistry, TextNode, TransformNode, type EditorPreviewSetPropsChange, type GameNode, type SceneFileJson, type SceneNodeJson } from '../nodes';
import { ButtonNode, GameplayInputNode, LoadingNode, MenuNode, MenuScriptNode } from '../app/nodes';
import { BottomHudNode, InputModeDetectorNode, StatusHudNode, TouchControlsNode, UIRootNode } from '../ui/nodes';
import { DebugBridgeNode, readDebugConnectionConfig } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../dynamic-nodes';

const SCENE_JSON_KEYS = {
  menu: 'scene:menu',
  loading: 'scene:loading',
  gameplay: 'scene:gameplay',
} as const;

const PREFAB_JSON_KEYS: Record<string, string> = {
  'prefabs/player.prefab.json': 'prefab:player',
  'prefabs/ship.prefab.json': 'prefab:ship',
  'prefabs/status-hud.prefab.json': 'prefab:status-hud',
  'prefabs/bottom-hud.prefab.json': 'prefab:bottom-hud',
};

const PREVIEW_CHANGES_KEY = 'editor:preview-changes';
const DYNAMIC_NODE_MANIFEST_KEY = 'dynamic-nodes:manifest';

type AppRuntimeLaunchMode = 'play' | 'editor';

const EDITOR_SCENE_KEYS = new Set<keyof typeof SCENE_JSON_KEYS>(['menu', 'loading', 'gameplay']);

export class AppScene extends Phaser.Scene {
  private appRuntime!: NodeRuntime;
  private appRoot!: NodeRoot;
  private sceneFactory!: SceneNodeFactoryRegistry;
  private menuScene!: GameNode;
  private loadingScene!: GameNode;
  private loadingNode!: LoadingNode;
  private gameplayMounted = false;
  private launchMode: AppRuntimeLaunchMode = 'play';
  private editorSceneKey: keyof typeof SCENE_JSON_KEYS = 'gameplay';
  private debugConfig = readDebugConnectionConfig();
  private readonly dynamicModuleCache = new Map<string, { hash: string; module: DynamicNodeModule }>();
  private readonly dynamicScriptNodes = new Set<DynamicScriptNode>();

  constructor() {
    super('App-Root');
  }

  preload(): void {
    loadMenuAssets(this);
    this.load.json(SCENE_JSON_KEYS.menu, 'scenes/menu.scene.json');
    this.load.json(SCENE_JSON_KEYS.loading, 'scenes/loading.scene.json');
    this.load.json(SCENE_JSON_KEYS.gameplay, 'scenes/gameplay.scene.json');
    for (const [path, key] of Object.entries(PREFAB_JSON_KEYS)) this.load.json(key, path);
    this.load.json(DYNAMIC_NODE_MANIFEST_KEY, 'dynamic-nodes-compiled/manifest.json');
    this.readLaunchParams();
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
    this.sceneFactory = this.createSceneFactory();
    await this.registerDynamicNodeModules();
    this.appRuntime.registerImageAssets(MENU_GRAPHIC_ASSETS);
    if (this.launchMode === 'play' && this.debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(this.debugConfig, {
      createNode: (definition) => this.sceneFactory.createTree(definition),
      hasDynamicModule: (module) => this.hasDynamicNodeModule(module),
      ensureDynamicModule: (module, code) => this.ensureDynamicNodeModule(module, code),
      reloadDynamicModule: (module, code) => this.reloadDynamicNodeModule(module, code),
    }));

    this.appRoot = this.appRuntime.addRoot(new NodeRoot({ rootName: this.launchMode === 'editor' ? 'Editor-Root' : 'App-Root' }));
    if (this.launchMode === 'editor') {
      this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS[this.editorSceneKey]));
    } else {
      this.menuScene = this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.menu));
      this.loadingScene = this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.loading));
      this.loadingNode = this.requireSceneNode<LoadingNode>(this.loadingScene, 'Loading');
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
    if (scene && EDITOR_SCENE_KEYS.has(scene as keyof typeof SCENE_JSON_KEYS)) this.editorSceneKey = scene as keyof typeof SCENE_JSON_KEYS;
  }

  private startGame(): void {
    this.appRoot.removeChild(this.menuScene);
    this.loadingNode.start();
  }

  private mountGameplay(): void {
    if (this.gameplayMounted) return;

    this.gameplayMounted = true;
    this.appRuntime.addPersistentNode(new GameplayInputNode());
    this.appRuntime.addPersistentNode(new PlayerStateManagerNode());
    this.appRuntime.addPersistentNode(new LevelGeneratorManagerNode());
    this.mountGameplayScenes();
    this.unmountStartupNodes();
  }

  private unmountStartupNodes(): void {
    this.appRoot.removeChild(this.menuScene);
    this.appRoot.removeChild(this.loadingScene);
  }

  private mountGameplayScenes(): void {
    this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.gameplay));
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
      ? await loadDynamicNodeModuleFromCode(code)
      : entry.url
        ? await loadDynamicNodeModule({ url: entry.url, hash: entry.hash })
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
    });
    this.dynamicScriptNodes.add(node);
    return node;
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

  private createScene(cacheKey: string): GameNode {
    const scene = this.cache.json.get(cacheKey) as SceneFileJson | undefined;
    if (!scene) throw new Error(`Scene JSON '${cacheKey}' was not loaded`);
    return this.sceneFactory.createTree(scene.root);
  }

  private createSceneFactory(): SceneNodeFactoryRegistry {
    return new SceneNodeFactoryRegistry()
      .withPreviewChanges(this.readPreviewChanges())
      .withPrefabResolver((path) => {
        const key = PREFAB_JSON_KEYS[path];
        if (!key) throw new Error(`Unknown prefab '${path}'`);
        const prefab = this.cache.json.get(key) as SceneFileJson | undefined;
        if (!prefab) throw new Error(`Prefab '${path}' was not loaded`);
        return prefab;
      })
      .register(NODE_TYPE_IDS.TransformNode, (definition) => new TransformNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.SceneNode, (definition) => new SceneNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) }))
      .register(NODE_TYPE_IDS.MenuNode, (definition) => new MenuNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.MenuScriptNode, (definition) => new MenuScriptNode(() => this.startGame(), optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ButtonNode, (definition) => new ButtonNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LoadingNode, (definition) => new LoadingNode(() => this.mountGameplay(), optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LevelNode, (definition) => new LevelNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameWorldNode, (definition) => new GameWorldNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ShipNode, (definition) => new ShipNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerNode, (definition) => new PlayerNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerMovementControllerNode, (definition) => new PlayerMovementControllerNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerAnimatorNode, (definition) => new PlayerAnimatorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.MiningToolNode, (definition) => new MiningToolNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.InputModeDetectorNode, (definition) => new InputModeDetectorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameRootNode, (definition) => new GameRootNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.UIRootNode, (definition) => new UIRootNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.StatusHudNode, (definition) => new StatusHudNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.BottomHudNode, (definition) => new BottomHudNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.TouchControlsNode, (definition) => new TouchControlsNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ImageNode, (definition) => new ImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_TYPE_IDS.TextNode, (definition) => new TextNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.AnimatedImageNode, (definition) => new AnimatedImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof AnimatedImageNode>[0]))
      .register(NODE_TYPE_IDS.CollisionRectNode, (definition) => new CollisionRectNode(optionsFrom(definition)));
  }

  private readPreviewChanges(): EditorPreviewSetPropsChange[] {
    const payload = this.cache.json.get(PREVIEW_CHANGES_KEY) as { changes?: EditorPreviewSetPropsChange[] } | undefined;
    return payload?.changes?.filter((change) => change.kind === 'setProps' && Array.isArray(change.target.nodePath)) ?? [];
  }

  private requireSceneNode<T extends GameNode>(root: GameNode, name: string): T {
    const node = collectNodesByName(root).get(name);
    if (!node) throw new Error(`Scene '${root.debugName()}' is missing node '${name}'`);
    return node as T;
  }
}

function optionsFrom(definition: SceneNodeJson): Record<string, unknown> {
  return { nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) };
}
