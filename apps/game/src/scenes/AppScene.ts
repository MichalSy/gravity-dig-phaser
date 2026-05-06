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
import { AnimatedImageNode, collectNodesByName, CollisionRectNode, ImageNode, NodeRoot, NodeRuntime, SceneNodeFactoryRegistry, TextNode, type GameNode, type SceneFileJson } from '../nodes';
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

export class AppScene extends Phaser.Scene {
  private appRuntime!: NodeRuntime;
  private appRoot!: NodeRoot;
  private sceneFactory!: SceneNodeFactoryRegistry;
  private menuScene!: GameNode;
  private loadingScene!: GameNode;
  private menuNode!: MenuNode;
  private loadingNode!: LoadingNode;
  private gameplayMounted = false;

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
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');

    this.appRuntime = new NodeRuntime({ phaserScene: this });
    this.sceneFactory = this.createSceneFactory();
    this.appRuntime.registerImageAssets(MENU_GRAPHIC_ASSETS);
    const debugConfig = readDebugConnectionConfig();
    if (debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(debugConfig));

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
      .withPrefabResolver((path) => {
        const key = PREFAB_JSON_KEYS[path];
        if (!key) throw new Error(`Unknown prefab '${path}'`);
        const prefab = this.cache.json.get(key) as SceneFileJson | undefined;
        if (!prefab) throw new Error(`Prefab '${path}' was not loaded`);
        return prefab;
      })
      .registerType('MenuNode', () => new MenuNode(() => this.startGame()))
      .registerType('LoadingNode', () => new LoadingNode(() => this.mountGameplay()))
      .registerType('LevelNode', () => new LevelNode())
      .registerType('GameWorldNode', () => new GameWorldNode())
      .registerType('ShipNode', () => new ShipNode())
      .registerType('PlayerNode', () => new PlayerNode())
      .registerType('PlayerMovementControllerNode', () => new PlayerMovementControllerNode())
      .registerType('PlayerAnimatorNode', () => new PlayerAnimatorNode())
      .registerType('MiningToolNode', () => new MiningToolNode())
      .registerType('InputModeDetectorNode', () => new InputModeDetectorNode())
      .registerType('StatusHudNode', () => new StatusHudNode())
      .registerType('BottomHudNode', () => new BottomHudNode())
      .registerType('TouchControlsNode', () => new TouchControlsNode())
      .registerType('ImageNode', (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .registerType('TextNode', (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof TextNode>[0]))
      .registerType('AnimatedImageNode', (definition) => new AnimatedImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof AnimatedImageNode>[0]))
      .registerType('CollisionRectNode', (definition) => new CollisionRectNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof CollisionRectNode>[0]));
  }

  private requireSceneNode<T extends GameNode>(root: GameNode, name: string): T {
    const node = collectNodesByName(root).get(name);
    if (!node) throw new Error(`Scene '${root.debugName()}' is missing node '${name}'`);
    return node as T;
  }
}
