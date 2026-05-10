import Phaser from 'phaser';
import '../style.css';
import { GAME_ANIMATION_SETS, GAME_GRAPHIC_ASSETS, loadGameAssets, loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { GameWorldNode, LevelGeneratorManagerNode, LevelNode, MiningToolNode, PlayerAnimatorNode, PlayerMovementControllerNode, PlayerNode, PlayerStateManagerNode, ShipNode } from '../game/nodes';
import { GameplayInputNode, LoadingNode, MenuNode } from '../app/nodes';
import { BottomHudNode, InputModeDetectorNode, StatusHudNode, TouchControlsNode, UIRootNode } from '../ui/nodes';
import { AnimatedImageNode, CollisionRectNode, getDefinitionNodeTypeId, ImageNode, NODE_TYPE_IDS, NodeRoot, NodeRuntime, NodeRuntimeMode, SceneNode, SceneNodeFactoryRegistry, TextNode, TransformNode, type GameNode, type SceneFileJson, type SceneNodeJson } from '../nodes';
import { DebugBridgeNode } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../dynamic-nodes';
import { VIEWPORT_REFRESH_EVENT } from '../utils/screen';

const sceneFiles = {
  menu: 'scenes/menu.scene.json',
  loading: 'scenes/loading.scene.json',
  gameplay: 'scenes/gameplay.scene.json',
} as const;

type RuntimeMode = 'editor' | 'play';
type RuntimeSceneId = keyof typeof sceneFiles;

interface StartRuntimeMessage {
  type: 'gravity-dig:runtime:start';
  mode: RuntimeMode;
  scene: RuntimeSceneId;
  editorApiBase?: string;
  sessionId?: string;
  relayUrl?: string;
}

const prefabFiles: Record<string, string> = {
  'prefabs/player.prefab.json': 'prefabs/player.prefab.json',
  'prefabs/ship.prefab.json': 'prefabs/ship.prefab.json',
  'prefabs/status-hud.prefab.json': 'prefabs/status-hud.prefab.json',
  'prefabs/bottom-hud.prefab.json': 'prefabs/bottom-hud.prefab.json',
};

class EditorRuntimeScene extends Phaser.Scene {
  private runtime?: NodeRuntime;
  private factory?: SceneNodeFactoryRegistry;
  private currentMode?: RuntimeMode;
  private currentEditorRoot?: NodeRoot;
  private playRoot?: NodeRoot;
  private playMenuScene?: GameNode;
  private playLoadingScene?: GameNode;
  private debugBridge?: DebugBridgeNode;
  private playGameplayMounted = false;
  private gameplayPersistentMounted = false;
  private editorApiBase?: string;
  private startQueue: Promise<void> = Promise.resolve();
  private readonly dynamicModules = new Map<string, { hash: string; module: DynamicNodeModule }>();

  constructor() {
    super('EditorRuntime');
  }

  preload(): void {
    loadMenuAssets(this);
    loadGameAssets(this);
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');
    window.addEventListener('message', this.handleMessage);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('message', this.handleMessage));
    window.parent?.postMessage({ type: 'gravity-dig:runtime:ready' }, window.location.origin);
  }

  update(_time: number, deltaMs: number): void {
    this.runtime?.update(deltaMs);
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Partial<StartRuntimeMessage> | undefined;
    if (data?.type !== 'gravity-dig:runtime:start' || !data.mode || !data.scene) return;
    void this.start(data as StartRuntimeMessage);
  };

  private async start(message: StartRuntimeMessage): Promise<void> {
    this.startQueue = this.startQueue
      .catch(() => undefined)
      .then(() => this.startUnsafe(message))
      .catch((error) => {
        console.error('[Gravity Dig Runtime] start failed', error);
        window.parent?.postMessage({ type: 'gravity-dig:runtime:error', message: error instanceof Error ? error.message : String(error) }, window.location.origin);
      });
    await this.startQueue;
  }

  private async startUnsafe(message: StartRuntimeMessage): Promise<void> {
    this.editorApiBase = message.editorApiBase;
    await this.ensureRuntime(message);
    if (!this.runtime) throw new Error('Runtime konnte nicht initialisiert werden');

    if (message.mode === 'play') {
      await this.startPlayMode(message);
    } else {
      await this.showEditorScene(message);
    }

    this.runtime.resolve();
    this.debugBridge?.publishTreeSnapshot();
    window.parent?.postMessage({ type: 'gravity-dig:runtime:started', mode: message.mode, scene: message.mode === 'play' ? 'menu' : message.scene }, window.location.origin);
  }

  private async ensureRuntime(message: StartRuntimeMessage): Promise<void> {
    const mustRecreate = !this.runtime || this.currentMode !== message.mode;
    if (!mustRecreate) {
      await this.refreshFactory(message.editorApiBase);
      return;
    }

    this.runtime?.destroy();
    this.children.removeAll(true);
    this.currentEditorRoot = undefined;
    this.playRoot = undefined;
    this.debugBridge = undefined;
    this.playMenuScene = undefined;
    this.playLoadingScene = undefined;
    this.playGameplayMounted = false;
    this.gameplayPersistentMounted = false;
    this.dynamicModules.clear();

    const mode = message.mode === 'editor' ? NodeRuntimeMode.Editor : NodeRuntimeMode.Play;
    this.runtime = new NodeRuntime({ phaserScene: this, mode });
    this.currentMode = message.mode;
    this.runtime.registerImageAssets([...MENU_GRAPHIC_ASSETS, ...GAME_GRAPHIC_ASSETS]);
    this.runtime.registerAnimationSets(GAME_ANIMATION_SETS);
    await this.refreshFactory(message.editorApiBase);

    if (message.sessionId && message.relayUrl && message.editorApiBase) {
      this.addDebugBridge(this.runtime, { sessionId: message.sessionId, relayUrl: message.relayUrl, editorApiUrl: message.editorApiBase });
    }
    this.runtime.init();
  }

  private async refreshFactory(editorApiBase: string | undefined): Promise<void> {
    await this.loadDynamicModules(editorApiBase);
    const prefabs = await this.loadPrefabs(editorApiBase);
    this.factory = this.createFactory(prefabs);
  }

  private async showEditorScene(message: StartRuntimeMessage): Promise<void> {
    const runtime = this.requireRuntime();
    if (this.playRoot) {
      runtime.removeRoot(this.playRoot);
      this.playRoot = undefined;
    }
    if (this.currentEditorRoot) runtime.removeRoot(this.currentEditorRoot);

    this.cameras.main.setBackgroundColor('#050816');
    this.currentEditorRoot = runtime.addRoot(new NodeRoot({ rootName: `Editor-${message.scene}-Root` }));

    if (this.needsGameplayRuntime(message.scene)) this.addGameplayRuntimeNodes(runtime);
    const scene = await this.fetchJson<SceneFileJson>(message.editorApiBase, sceneFiles[message.scene]);
    this.currentEditorRoot.addChild(this.createScene(scene));
    runtime.resolve();

    if (message.scene === 'loading') {
      runtime.getNode<LoadingNode>('Loading')?.start();
    }
  }

  private async startPlayMode(message: StartRuntimeMessage): Promise<void> {
    const runtime = this.requireRuntime();
    if (this.currentEditorRoot) {
      runtime.removeRoot(this.currentEditorRoot);
      this.currentEditorRoot = undefined;
    }
    if (this.playRoot) return;

    this.cameras.main.setBackgroundColor('#050816');
    this.playRoot = runtime.addRoot(new NodeRoot({ rootName: 'Play-Runtime-Root' }));
    const menu = await this.fetchJson<SceneFileJson>(message.editorApiBase, sceneFiles.menu);
    const loading = await this.fetchJson<SceneFileJson>(message.editorApiBase, sceneFiles.loading);
    this.playMenuScene = this.playRoot.addChild(this.createScene(menu));
    this.playLoadingScene = this.playRoot.addChild(this.createScene(loading));
  }

  private startGame(): void {
    const loading = this.runtime?.getNode<LoadingNode>('Loading');
    const menu = this.runtime?.getNode<MenuNode>('Menu');
    if (!loading) return;
    menu?.close();
    loading.start();
  }

  private mountGameplay(): void {
    if (this.playGameplayMounted || !this.playRoot) return;
    this.playGameplayMounted = true;
    const runtime = this.requireRuntime();
    this.addGameplayRuntimeNodes(runtime);

    if (this.playMenuScene) {
      this.playRoot.removeChild(this.playMenuScene);
      this.playMenuScene = undefined;
    }
    if (this.playLoadingScene) {
      this.playRoot.removeChild(this.playLoadingScene);
      this.playLoadingScene = undefined;
    }

    void this.mountGameplayScenes(this.playRoot);
  }

  private async mountGameplayScenes(root: NodeRoot): Promise<void> {
    try {
      const gameplay = await this.fetchJson<SceneFileJson>(this.editorApiBase, sceneFiles.gameplay);
      root.addChild(this.createScene(gameplay));
      this.runtime?.resolve();
    } catch (error) {
      console.error('[Gravity Dig Runtime] gameplay mount failed', error);
      window.parent?.postMessage({ type: 'gravity-dig:runtime:error', message: error instanceof Error ? error.message : String(error) }, window.location.origin);
    }
  }

  private needsGameplayRuntime(scene: RuntimeSceneId): boolean {
    return scene === 'gameplay';
  }

  private addGameplayRuntimeNodes(runtime: NodeRuntime): void {
    if (this.gameplayPersistentMounted) return;
    this.gameplayPersistentMounted = true;
    runtime.addPersistentNode(new GameplayInputNode());
    runtime.addPersistentNode(new PlayerStateManagerNode());
    runtime.addPersistentNode(new LevelGeneratorManagerNode());
  }

  private requireRuntime(): NodeRuntime {
    if (!this.runtime) throw new Error('Runtime ist nicht bereit');
    return this.runtime;
  }

  private addDebugBridge(runtime: NodeRuntime, config: { sessionId: string; relayUrl: string; editorApiUrl: string }): void {
    this.debugBridge = runtime.addPersistentNode(new DebugBridgeNode({ enabled: true, ...config }, {
      createNode: (definition) => {
        if (!this.factory) throw new Error('Runtime factory is not ready');
        return this.factory.createTree(definition);
      },
      hasDynamicModule: (module) => this.hasDynamicModule(module),
      ensureDynamicModule: (module, code) => this.ensureDynamicModule(module, code),
      reloadDynamicModule: (module, code) => this.reloadDynamicModule(module, code),
    }));
  }

  private hasDynamicModule(entry: Pick<DynamicNodeManifestEntry, 'nodeTypeId' | 'hash'>): boolean {
    return Boolean(entry.nodeTypeId && this.dynamicModules.get(entry.nodeTypeId)?.hash === entry.hash);
  }

  private async ensureDynamicModule(entry: Pick<DynamicNodeManifestEntry, 'nodeTypeId' | 'hash'> & { url?: string }, code?: string): Promise<boolean> {
    const nodeTypeId = entry.nodeTypeId;
    if (!nodeTypeId) return false;
    const cached = this.dynamicModules.get(nodeTypeId);
    if (cached?.hash === entry.hash) return true;
    const module = code ? await loadDynamicNodeModuleFromCode(code) : entry.url ? await loadDynamicNodeModule({ url: entry.url, hash: entry.hash }) : undefined;
    if (!module || module.nodeTypeId !== nodeTypeId) return false;
    this.dynamicModules.set(nodeTypeId, { hash: entry.hash, module });
    this.factory?.register(nodeTypeId, (definition) => new DynamicScriptNode({ module, nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, props: definition.props }));
    return true;
  }

  private async reloadDynamicModule(entry: Pick<DynamicNodeManifestEntry, 'nodeTypeId' | 'hash'> & { url?: string }, code: string): Promise<number> {
    return await this.ensureDynamicModule(entry, code) ? 0 : 0;
  }

  private async loadDynamicModules(editorApiBase: string | undefined): Promise<void> {
    const manifest = await this.fetchOptionalJson<DynamicNodeManifest>(editorApiBase, 'dynamic-nodes-compiled/manifest.json');
    for (const entry of manifest?.nodes ?? []) {
      if (!entry.nodeTypeId || this.dynamicModules.get(entry.nodeTypeId)?.hash === entry.hash) continue;
      const module = await loadDynamicNodeModule({ hash: entry.hash, url: this.contentUrl(editorApiBase, `dynamic-nodes-compiled/${entry.url.split('/').at(-1) ?? ''}`) });
      if (module) this.dynamicModules.set(entry.nodeTypeId, { hash: entry.hash, module });
    }
  }

  private async loadPrefabs(editorApiBase: string | undefined): Promise<Map<string, SceneFileJson>> {
    const prefabs = new Map<string, SceneFileJson>();
    for (const [key, path] of Object.entries(prefabFiles)) prefabs.set(key, await this.fetchJson<SceneFileJson>(editorApiBase, path));
    return prefabs;
  }

  private createScene(scene: SceneFileJson): GameNode {
    if (!this.factory) throw new Error('Runtime factory is not ready');
    return this.factory.createTree(scene.root);
  }

  private createFactory(prefabs: Map<string, SceneFileJson>): SceneNodeFactoryRegistry {
    const factory = new SceneNodeFactoryRegistry()
      .withPrefabResolver((path) => {
        const prefab = prefabs.get(path);
        if (!prefab) throw new Error(`Unknown prefab '${path}'`);
        return prefab;
      })
      .register(NODE_TYPE_IDS.TransformNode, (definition) => new TransformNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.SceneNode, (definition) => new SceneNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) }))
      .register(NODE_TYPE_IDS.MenuNode, (definition) => new MenuNode(() => this.startGame(), optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LoadingNode, (definition) => new LoadingNode(() => this.mountGameplay(), optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LevelNode, (definition) => new LevelNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameWorldNode, (definition) => new GameWorldNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ShipNode, (definition) => new ShipNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerNode, (definition) => new PlayerNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerMovementControllerNode, (definition) => new PlayerMovementControllerNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.PlayerAnimatorNode, (definition) => new PlayerAnimatorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.MiningToolNode, (definition) => new MiningToolNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.InputModeDetectorNode, (definition) => new InputModeDetectorNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.UIRootNode, (definition) => new UIRootNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.StatusHudNode, (definition) => new StatusHudNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.BottomHudNode, (definition) => new BottomHudNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.TouchControlsNode, (definition) => new TouchControlsNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.ImageNode, (definition) => new ImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_TYPE_IDS.TextNode, (definition) => new TextNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.AnimatedImageNode, (definition) => new AnimatedImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof AnimatedImageNode>[0]))
      .register(NODE_TYPE_IDS.CollisionRectNode, (definition) => new CollisionRectNode(optionsFrom(definition)));

    for (const [nodeTypeId, cached] of this.dynamicModules) {
      const module = cached.module;
      factory.register(nodeTypeId, (definition) => new DynamicScriptNode({ module, nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, props: definition.props }));
    }
    return factory;
  }

  private async fetchJson<T>(editorApiBase: string | undefined, path: string): Promise<T> {
    const response = await fetch(this.contentUrl(editorApiBase, path), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Editor runtime konnte '${path}' nicht laden: HTTP ${response.status}`);
    return await response.json() as T;
  }

  private async fetchOptionalJson<T>(editorApiBase: string | undefined, path: string): Promise<T | undefined> {
    const response = await fetch(this.contentUrl(editorApiBase, path), { cache: 'no-store' });
    if (response.status === 404 || response.status === 204) return undefined;
    if (!response.ok) throw new Error(`Editor runtime konnte '${path}' nicht laden: HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) return undefined;
    return JSON.parse(text) as T;
  }

  private contentUrl(editorApiBase: string | undefined, path: string): string {
    if (!editorApiBase) return new URL(path, import.meta.env.BASE_URL).toString();
    const url = new URL('/api/editor/public-files/content', editorApiBase);
    url.searchParams.set('path', path);
    return url.toString();
  }
}

function optionsFrom(definition: SceneNodeJson): Record<string, unknown> {
  return { nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) };
}

async function startRuntime(): Promise<void> {
  await document.fonts?.load('700 28px "Silkscreen"');

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#050816',
    pixelArt: false,
    smoothPixelArt: true,
    antialias: true,
    antialiasGL: true,
    input: { activePointers: 4 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_WIDTH, height: GAME_HEIGHT },
    render: { antialias: true, antialiasGL: true },
    scene: [EditorRuntimeScene],
  });

  const resizeGameToViewport = (): void => {
    const gameElement = document.getElementById('game');
    if (gameElement) {
      gameElement.style.width = '100vw';
      gameElement.style.height = '100dvh';
    }
    game.scale.refresh();
  };

  window.addEventListener(VIEWPORT_REFRESH_EVENT, resizeGameToViewport);
  window.addEventListener('resize', resizeGameToViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeGameToViewport, { passive: true });
  resizeGameToViewport();
}

void startRuntime();
