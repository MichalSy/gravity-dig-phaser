import Phaser from 'phaser';
import type { DebugDynamicNodeBundleReference } from '@gravity-dig/debug-protocol';
import '../style.css';
import { GAME_ANIMATION_SETS, GAME_FONT_ASSETS, GAME_GRAPHIC_ASSETS, loadGameAssets, loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/gameConfig';
import { createGravityDigNodeFactory, NodeRoot, NodeRuntime, NodeRuntimeMode, parseGameSettings, PrefabManager, registerGravityDigDynamicModule, RuntimeManagerHost, SceneNodeFactoryRegistry, type GameNode, type GameSettings, type SceneFileJson } from '../nodes';
import { DebugBridgeNode } from '../debug';
import { DynamicScriptNode, loadDynamicNodeModule, loadDynamicNodeModuleFromCode, loadDynamicNodeModulesFromCode, type DynamicNodeManifest, type DynamicNodeManifestEntry, type DynamicNodeModule } from '../nodes';
import { VIEWPORT_REFRESH_EVENT } from '../utils/screen';

type RuntimeMode = 'editor' | 'play';
type RuntimeSceneId = 'menu' | 'loading' | 'gameplay';

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
  private managerHost?: RuntimeManagerHost;
  private gameSettings?: GameSettings;
  private prefabManagerApiBase?: string;
  private currentMode?: RuntimeMode;
  private currentEditorRoot?: NodeRoot;
  private playRoot?: NodeRoot;
  private playMenuScene?: GameNode;
  private playLoadingScene?: GameNode;
  private debugBridge?: DebugBridgeNode;
  private playGameplayMounted = false;
  private editorApiBase?: string;
  private lastStartSignature?: string;
  private startQueue: Promise<void> = Promise.resolve();
  private readonly dynamicModules = new Map<string, { hash: string; module: DynamicNodeModule }>();
  private readonly dynamicScriptNodes = new Set<DynamicScriptNode>();

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
    this.managerHost = undefined;
    this.gameSettings = undefined;
    this.dynamicModules.clear();

    const mode = message.mode === 'editor' ? NodeRuntimeMode.Editor : NodeRuntimeMode.Play;
    this.runtime = new NodeRuntime({ phaserScene: this, mode });
    this.currentMode = message.mode;
    this.runtime.registerImageAssets([...MENU_GRAPHIC_ASSETS, ...GAME_GRAPHIC_ASSETS]);
    this.runtime.registerAnimationSets(GAME_ANIMATION_SETS);
    this.runtime.registerFontAssets(GAME_FONT_ASSETS);
    await this.refreshFactory(message.editorApiBase);
    this.gameSettings = parseGameSettings(await this.fetchJson<unknown>(message.editorApiBase, 'game.settings.json'));
    if (!this.factory || !this.prefabManager) throw new Error('Runtime factory is not ready');
    this.managerHost = new RuntimeManagerHost({
      runtime: this.runtime,
      factory: this.factory,
      prefabManager: this.prefabManager,
      settings: this.gameSettings,
      mode: message.mode,
      loadManager: (path) => this.fetchJson<SceneFileJson>(message.editorApiBase, path),
    });

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
    this.factory = createGravityDigNodeFactory({
      prefabManager: this.prefabManager,
      dynamicModules: [...this.dynamicModules.values()].map(({ module }) => module),
      createScriptActions: () => this.createScriptActions(),
      onDynamicScriptNode: (node) => this.dynamicScriptNodes.add(node),
    });
    this.managerHost?.updateFactory(this.factory, this.prefabManager);
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

    await this.requireManagerHost().activateScene(message.scene);
    const scene = await this.fetchJson<SceneFileJson>(message.editorApiBase, this.scenePath(message.scene));
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
    const startupSceneId = this.requireGameSettings().scenes.startup;
    const menu = await this.fetchJson<SceneFileJson>(message.editorApiBase, this.scenePath(startupSceneId));
    await this.prefabManager?.ensureDefinitions(menu.root);
    this.playMenuScene = this.playRoot.addChild(this.createScene(menu));
  }

  private async startGame(): Promise<void> {
    if (this.playMenuScene && this.playRoot) {
      this.playRoot.removeChild(this.playMenuScene);
      this.playMenuScene = undefined;
    }
    if (!this.playRoot || this.playLoadingScene) return;
    const loading = await this.fetchJson<SceneFileJson>(this.editorApiBase, this.scenePath('loading'));
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
      'game:mount': () => { void this.mountGameplay(); },
      'player:jump': () => this.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) }),
    };
  }

  private async mountGameplay(): Promise<void> {
    if (this.playGameplayMounted || !this.playRoot) return;
    this.playGameplayMounted = true;
    await this.requireManagerHost().activateScene('gameplay');

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
      const gameplay = await this.fetchJson<SceneFileJson>(this.editorApiBase, this.scenePath('gameplay'));
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

  private requireRuntime(): NodeRuntime {
    if (!this.runtime) throw new Error('Runtime ist nicht bereit');
    return this.runtime;
  }

  private requireManagerHost(): RuntimeManagerHost {
    if (!this.managerHost) throw new Error('Manager host is not ready');
    return this.managerHost;
  }

  private requireGameSettings(): GameSettings {
    if (!this.gameSettings) throw new Error('Game settings are not loaded');
    return this.gameSettings;
  }

  private scenePath(sceneId: string): string {
    const definition = this.requireGameSettings().scenes.definitions[sceneId];
    if (!definition) throw new Error(`Scene '${sceneId}' is not defined in game.settings.json`);
    return definition.path;
  }

  private addDebugBridge(runtime: NodeRuntime, config: { sessionId: string; editorApiUrl: string }): void {
    this.debugBridge = runtime.addPersistentNode(new DebugBridgeNode({ enabled: true, ...config }, {
      createNode: (definition) => {
        if (!this.factory) throw new Error('Runtime factory is not ready');
        return this.factory.createTree(definition);
      },
      hasDynamicModule: (module) => this.hasDynamicModule(module),
      ensureDynamicModule: (module, code) => this.ensureDynamicModule(module, code),
      reloadDynamicBundle: (bundle, code) => this.reloadDynamicBundle(bundle, code),
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
    const module = code ? await loadDynamicNodeModuleFromCode(code, nodeTypeId, entry.hash) : entry.url ? await loadDynamicNodeModule({ url: entry.url, hash: entry.hash, nodeTypeId }) : undefined;
    if (!module || module.nodeTypeId !== nodeTypeId) return false;
    this.dynamicModules.set(nodeTypeId, { hash: entry.hash, module });
    if (this.factory) registerGravityDigDynamicModule(this.factory, module, {
      createScriptActions: () => this.createScriptActions(),
      onDynamicScriptNode: (node) => this.dynamicScriptNodes.add(node),
    });
    return true;
  }

  private async reloadDynamicBundle(bundle: DebugDynamicNodeBundleReference, code: string): Promise<{ modules: number; reloaded: number }> {
    const importedModules = await loadDynamicNodeModulesFromCode(code, bundle.hash);
    const expectedTypeIds = new Set(bundle.nodeTypeIds);
    const modules = importedModules.filter((module) => expectedTypeIds.has(module.nodeTypeId));
    if (modules.length !== expectedTypeIds.size) throw new Error(`Bundle '${bundle.hash}' enthält nicht alle erwarteten Dynamic Nodes.`);
    let reloaded = 0;
    for (const module of modules) {
      this.dynamicModules.set(module.nodeTypeId, { hash: bundle.hash, module });
      if (this.factory) registerGravityDigDynamicModule(this.factory, module, {
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
