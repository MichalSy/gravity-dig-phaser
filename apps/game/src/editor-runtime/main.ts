import Phaser from 'phaser';
import '../style.css';
import { GAME_ANIMATION_SETS, GAME_FONT_ASSETS, GAME_GRAPHIC_ASSETS, loadGameAssets, loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { GameRootNode, GameWorldNode, LevelGeneratorManagerNode, LevelNode, PlayerAnimatorNode, PlayerStateManagerNode } from '../game/nodes';
import { GameplayInputNode } from '../app/nodes';
import { InputModeDetectorNode, TouchControlsNode, UIRootNode } from '../ui/nodes';
import { AnimatedImageNode, AudioNode, ButtonNode, CollisionRectNode, getDefinitionNodeTypeId, ImageNode, LineNode, NODE_TYPE_IDS, NodeRoot, NodeRuntime, NodeRuntimeMode, PrefabManager, RectangleNode, SceneNode, SceneNodeFactoryRegistry, TextNode, TransformNode, type GameNode, type SceneFileJson, type SceneNodeJson } from '../nodes';
import { DebugBridgeNode } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../nodes';
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
}

class EditorRuntimeScene extends Phaser.Scene {
  private runtime?: NodeRuntime;
  private factory?: SceneNodeFactoryRegistry;
  private prefabManager?: PrefabManager;
  private prefabManagerApiBase?: string;
  private currentMode?: RuntimeMode;
  private currentEditorRoot?: NodeRoot;
  private playRoot?: NodeRoot;
  private playMenuScene?: GameNode;
  private playLoadingScene?: GameNode;
  private debugBridge?: DebugBridgeNode;
  private playGameplayMounted = false;
  private gameplayPersistentMounted = false;
  private editorApiBase?: string;
  private lastStartSignature?: string;
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
    const data = event.data as { type?: string; path?: string; prefabId?: string; mode?: RuntimeMode; scene?: RuntimeSceneId } | undefined;
    if (data?.type === 'gravity-dig:prefab:reload' && data.prefabId) {
      void this.reloadPrefab(data.prefabId);
      return;
    }
    if (data?.type !== 'gravity-dig:runtime:start' || !data.mode || !data.scene) return;
    void this.start(data as StartRuntimeMessage);
  };

  private async reloadPrefab(prefabId: string): Promise<void> {
    try {
      if (!this.prefabManager) throw new Error('Prefab manager is not initialized');
      await this.prefabManager.reloadById(prefabId);
      this.runtime?.resolve();
      this.debugBridge?.publishSelectedNodeProps();
      window.parent?.postMessage({
        type: 'gravity-dig:prefab:reloaded',
        prefabId,
        instances: this.prefabManager.getInstancesByPrefabId(prefabId).length,
      }, window.location.origin);
    } catch (error) {
      window.parent?.postMessage({
        type: 'gravity-dig:prefab:reload-error',
        prefabId,
        error: error instanceof Error ? error.message : String(error),
      }, window.location.origin);
    }
  }

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
    const startSignature = `${message.sessionId ?? ''}:${message.editorApiBase ?? ''}:${message.mode}:${message.scene}`;
    if (this.lastStartSignature === startSignature) return;
    this.lastStartSignature = startSignature;
    this.editorApiBase = message.editorApiBase;
    try {
      await this.ensureRuntime(message);
    } catch (error) {
      this.lastStartSignature = undefined;
      throw error;
    }
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
    this.runtime.registerFontAssets(GAME_FONT_ASSETS);
    await this.refreshFactory(message.editorApiBase);

    if (message.sessionId && message.editorApiBase) {
      this.addDebugBridge(this.runtime, { sessionId: message.sessionId, editorApiUrl: message.editorApiBase });
    }
    this.runtime.init();
  }

  private async refreshFactory(editorApiBase: string | undefined): Promise<void> {
    await this.loadDynamicModules(editorApiBase);
    if (!this.prefabManager || this.prefabManagerApiBase !== editorApiBase) {
      this.prefabManager = new PrefabManager((path) => this.fetchJson<SceneFileJson>(editorApiBase, path));
      this.prefabManagerApiBase = editorApiBase;
    }
    this.factory = this.createFactory(this.prefabManager);
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
    await this.prefabManager?.ensureDefinitions(scene.root);
    if (message.scene === 'gameplay') await Promise.all([
      this.prefabManager?.ensure('prefabs/player.prefab.json'),
      this.prefabManager?.ensure('prefabs/ship.prefab.json'),
    ]);
    this.currentEditorRoot.addChild(this.createScene(scene));
    runtime.resolve();

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
    await this.prefabManager?.ensureDefinitions(menu.root);
    this.playMenuScene = this.playRoot.addChild(this.createScene(menu));
  }

  private async startGame(): Promise<void> {
    if (this.playMenuScene && this.playRoot) {
      this.playRoot.removeChild(this.playMenuScene);
      this.playMenuScene = undefined;
    }
    if (!this.playRoot || this.playLoadingScene) return;
    const loading = await this.fetchJson<SceneFileJson>(this.editorApiBase, sceneFiles.loading);
    await this.prefabManager?.ensureDefinitions(loading.root);
    this.playLoadingScene = this.playRoot.addChild(this.createScene(loading));
    this.runtime?.resolve();
  }

  private createScriptActions(): Record<string, (source: DynamicScriptNode) => void> {
    return {
      'game:start': () => { void this.startGame(); },
      'game:load': (source) => {
        source.callScriptMethod('setProgress', 1);
        source.callScriptMethod('complete');
      },
      'game:mount': () => this.mountGameplay(),
      'player:jump': () => this.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) }),
    };
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
      await this.prefabManager?.ensureDefinitions(gameplay.root);
      await Promise.all([
        this.prefabManager?.ensure('prefabs/player.prefab.json'),
        this.prefabManager?.ensure('prefabs/ship.prefab.json'),
      ]);
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

  private addDebugBridge(runtime: NodeRuntime, config: { sessionId: string; editorApiUrl: string }): void {
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
    const module = code ? await loadDynamicNodeModuleFromCode(code) : entry.url ? await loadDynamicNodeModule({ url: entry.url, hash: entry.hash, nodeTypeId }) : undefined;
    if (!module || module.nodeTypeId !== nodeTypeId) return false;
    this.dynamicModules.set(nodeTypeId, { hash: entry.hash, module });
    this.factory?.register(nodeTypeId, (definition) => new DynamicScriptNode({ module, nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, props: definition.props, actions: this.createScriptActions(), instantiatePrefab: (prefabId, options) => { if (!this.factory) throw new Error('Runtime factory is not ready'); return this.factory.createPrefab(prefabId, options, { origin: 'runtime-script', createdByInstanceId: definition.instanceId }); } }));
    return true;
  }

  private async reloadDynamicModule(entry: Pick<DynamicNodeManifestEntry, 'nodeTypeId' | 'hash'> & { url?: string }, code: string): Promise<number> {
    return await this.ensureDynamicModule(entry, code) ? 0 : 0;
  }

  private async loadDynamicModules(editorApiBase: string | undefined): Promise<void> {
    const manifest = await this.fetchOptionalJson<DynamicNodeManifest>(editorApiBase, 'scripts-compiled/manifest.json');
    for (const entry of manifest?.nodes ?? []) {
      if (!entry.nodeTypeId || this.dynamicModules.get(entry.nodeTypeId)?.hash === entry.hash) continue;
      const module = await loadDynamicNodeModule({ hash: entry.hash, nodeTypeId: entry.nodeTypeId, url: this.contentUrl(editorApiBase, `scripts-compiled/${entry.url.split('/').at(-1) ?? ''}`) });
      if (module) this.dynamicModules.set(entry.nodeTypeId, { hash: entry.hash, module });
    }
  }


  private createScene(scene: SceneFileJson): GameNode {
    if (!this.factory) throw new Error('Runtime factory is not ready');
    return this.factory.createTree(scene.root);
  }

  private createFactory(prefabs: PrefabManager): SceneNodeFactoryRegistry {
    const factory = new SceneNodeFactoryRegistry()
      .withPrefabManager(prefabs)
      .register(NODE_TYPE_IDS.TransformNode, (definition) => new TransformNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.SceneNode, (definition) => new SceneNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) }))
      .register(NODE_TYPE_IDS.ButtonNode, (definition) => new ButtonNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.LevelNode, (definition) => new LevelNode(optionsFrom(definition)))
      .register(NODE_TYPE_IDS.GameWorldNode, (definition) => new GameWorldNode({
        ...optionsFrom(definition),
        instantiatePrefab: (prefabId) => {
          if (!this.factory) throw new Error('Runtime factory is not ready');
          return this.factory.createPrefab(prefabId, {}, { origin: 'runtime-code', createdByInstanceId: definition.instanceId });
        },
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

    for (const [nodeTypeId, cached] of this.dynamicModules) {
      const module = cached.module;
      factory.register(nodeTypeId, (definition) => new DynamicScriptNode({ module, nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, props: definition.props, actions: this.createScriptActions(), instantiatePrefab: (prefabId, options) => { if (!this.factory) throw new Error('Runtime factory is not ready'); return this.factory.createPrefab(prefabId, options, { origin: 'runtime-script', createdByInstanceId: definition.instanceId }); } }));
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
