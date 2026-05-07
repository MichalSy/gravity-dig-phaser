import Phaser from 'phaser';
import { loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import {
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
import { AnimatedImageNode, collectNodesByName, CollisionRectNode, getDefinitionNodeTypeId, ImageNode, NODE_TYPE_IDS, NodeRoot, NodeRuntime, SceneNode, SceneNodeFactoryRegistry, TextNode, type EditorPreviewSetPropsChange, type GameNode, type SceneFileJson, type SceneNodeJson } from '../nodes';
import { GameplayInputNode, LoadingNode, MenuNode } from '../app/nodes';
import { BottomHudNode, InputModeDetectorNode, StatusHudNode, TouchControlsNode } from '../ui/nodes';
import { DebugBridgeNode, readDebugConnectionConfig } from '../debug';

const SCENE_JSON_KEYS = {
  menu: 'scene:menu',
  loading: 'scene:loading',
  gameplay: 'scene:gameplay',
  gameplayUi: 'scene:gameplay-ui',
} as const;

const PREFAB_JSON_KEYS: Record<string, string> = {
  'prefabs/player.prefab.json': 'prefab:player',
  'prefabs/ship.prefab.json': 'prefab:ship',
  'prefabs/status-hud.prefab.json': 'prefab:status-hud',
  'prefabs/bottom-hud.prefab.json': 'prefab:bottom-hud',
};

const PREVIEW_CHANGES_KEY = 'editor:preview-changes';

export class AppScene extends Phaser.Scene {
  private appRuntime!: NodeRuntime;
  private appRoot!: NodeRoot;
  private sceneFactory!: SceneNodeFactoryRegistry;
  private menuScene!: GameNode;
  private loadingScene!: GameNode;
  private menuNode!: MenuNode;
  private loadingNode!: LoadingNode;
  private gameplayMounted = false;
  private debugConfig = readDebugConnectionConfig();

  constructor() {
    super('App-Root');
  }

  preload(): void {
    loadMenuAssets(this);
    this.load.json(SCENE_JSON_KEYS.menu, 'scenes/menu.scene.json');
    this.load.json(SCENE_JSON_KEYS.loading, 'scenes/loading.scene.json');
    this.load.json(SCENE_JSON_KEYS.gameplay, 'scenes/gameplay.scene.json');
    this.load.json(SCENE_JSON_KEYS.gameplayUi, 'scenes/gameplay-ui.scene.json');
    for (const [path, key] of Object.entries(PREFAB_JSON_KEYS)) this.load.json(key, path);
    if (this.debugConfig) {
      const previewUrl = new URL(`/api/editor/changes/${encodeURIComponent(this.debugConfig.sessionId)}/preview`, this.debugConfig.editorApiUrl);
      previewUrl.searchParams.set('cacheBust', Date.now().toString(36));
      this.load.json(PREVIEW_CHANGES_KEY, previewUrl.toString());
    }
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');

    this.appRuntime = new NodeRuntime({ phaserScene: this });
    this.sceneFactory = this.createSceneFactory();
    this.appRuntime.registerImageAssets(MENU_GRAPHIC_ASSETS);
    if (this.debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(this.debugConfig));

    this.appRoot = this.appRuntime.addRoot(new NodeRoot({ rootName: 'App-Root' }));
    this.menuScene = this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.menu));
    this.loadingScene = this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.loading));
    this.menuNode = this.requireSceneNode<MenuNode>(this.menuScene, 'Menu');
    this.loadingNode = this.requireSceneNode<LoadingNode>(this.loadingScene, 'Loading');

    this.appRuntime.init();
    this.appRuntime.resolve();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.appRuntime.destroy();
    });
  }

  update(_time: number, deltaMs: number): void {
    this.appRuntime.update(deltaMs);
  }

  private startGame(): void {
    this.menuNode.close();
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
    this.appRoot.addChild(this.createScene(SCENE_JSON_KEYS.gameplayUi));
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
