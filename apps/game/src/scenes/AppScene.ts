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
import { AnimatedImageNode, collectNodesByName, CollisionRectNode, ImageNode, NodeRoot, NodeRuntime, SceneNode, SceneNodeFactoryRegistry, TextNode, type GameNode, type SceneFileJson, type SceneNodeJson } from '../nodes';
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

const NODE_IDS = {
  sceneMenu: '18958b84-2b9f-5176-8ef7-b29688b458ed',
  menu: '6285c2b2-111e-537b-bc42-c8680153d15d',
  sceneLoading: '383489d7-473a-532b-8b6c-34f6bcbe29ef',
  loading: 'bd4b5c0f-3d3f-5752-9e1f-a4caafbeecd0',
  sceneGameplay: 'f37c6a1e-9d13-53f0-9bf5-fa8f969f6648',
  level: '54f36173-6201-5d2d-8091-64b6e7967e54',
  world: '8b5c35e6-f86c-5466-9a7d-bf045896c9a3',
  shipInstance: 'd029a58a-5ca6-5eae-8ef4-babcdb6629d9',
  playerInstance: 'ed8675b7-05b6-5f06-99dd-6caaacbfba63',
  sceneGameplayUi: '9eab7f71-0566-598a-8059-a250c3d4f454',
  inputModeDetector: '3c223156-2661-5541-ab0e-42c431ae5085',
  statusHudInstance: '67c317c9-b3a7-5d2c-9935-76b9a7044382',
  bottomHudInstance: '2e67cf0e-7e26-545d-80a4-8555f2330df9',
  touchControls: '4a9de373-ef65-56bf-9926-4579f7f4cc8d',
  player: '971ab469-6170-5fd4-8d91-8ee2aee777c1',
  playerMovementController: '10eec272-8b13-515a-bf70-1e159f4ac4ac',
  playerBody: '2b5e049b-2024-54ee-8910-239a49ab3bcd',
  playerImage: '62f5fdc4-bfe6-5da3-aaf4-7bb2c6ce9d91',
  playerAnimator: 'ce7bf020-2d91-559c-9e95-549e058ca623',
  miningTool: 'd2421a2e-dbc3-500b-b86d-b0b483b9f5c9',
  ship: 'cea3d11d-10b3-55ab-acdb-cff58097215b',
  shipImage: 'ec1dc6c9-11b5-5766-ab36-55f5abf693d0',
  shipPrompt: 'c5b09e65-7e2a-5ab9-9d6d-63e5945612fc',
  statusHud: '1179c663-883d-5315-bb23-459ade336b0e',
  statusFrame: 'b4ccf634-be36-5d3f-bfb7-720ebfec7610',
  hpFill: '32557573-b908-589b-8b3d-e1ebeb4c69b5',
  fuelFill: '5985c1e1-b7d2-5062-8fe6-1402a1c45034',
  bottomHud: 'bb3b713f-d685-44a3-b0cd-95596cbce41b',
  actionFrame: 'af9fee4b-158b-4ead-8264-c46e5d7af366',
  energyFill: '470d2d11-1ada-4bac-9d20-fde438408424',
  slotFrame0: 'ac806217-66e0-4a83-8ccd-7891b49e9843',
  slotFrame1: '8f51a2f7-b2a6-4291-8168-87f69cd52fc8',
  slotFrame2: 'f11d3a50-62c5-46bc-8d38-aef480dac284',
  slotFrame3: 'bd6775ad-9138-4255-bcd9-1b1075cacaf0',
  slotItem0: '38b37c84-8e23-4916-a9e2-73fddf87e35d',
  slotItem1: '06460d2b-6c62-4d6a-b848-0a7f80df73f1',
  slotItem2: '4b54d317-4b8d-46f5-90d6-214358c4d188',
  slotItem3: '65cd6cb1-6dc7-4937-80af-315cdd92c12e',
  slotLabel0: '966e64da-3cd8-47e0-b74b-9cc28b4bb246',
  slotLabel1: '9ba299e0-b2ce-4973-b3d4-38c0faeec8b0',
  slotLabel2: '1e1504a9-96f5-45b2-be68-c69eed3bdb1c',
  slotLabel3: '80bd70f5-c17b-4058-8b77-2acfc2087e53',
} as const;

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
      .register(NODE_IDS.sceneMenu, (definition) => new SceneNode({ guid: definition.id, rootName: definition.name ?? 'Scene.Menu', ...(definition.props ?? {}) }))
      .register(NODE_IDS.menu, (definition) => withGuid(new MenuNode(() => this.startGame()), definition))
      .register(NODE_IDS.sceneLoading, (definition) => new SceneNode({ guid: definition.id, rootName: definition.name ?? 'Scene.Loading', ...(definition.props ?? {}) }))
      .register(NODE_IDS.loading, (definition) => withGuid(new LoadingNode(() => this.mountGameplay()), definition))
      .register(NODE_IDS.sceneGameplay, (definition) => new SceneNode({ guid: definition.id, rootName: definition.name ?? 'Gameplay', ...(definition.props ?? {}) }))
      .register(NODE_IDS.level, (definition) => withGuid(new LevelNode(), definition))
      .register(NODE_IDS.world, (definition) => withGuid(new GameWorldNode(), definition))

      .register(NODE_IDS.sceneGameplayUi, (definition) => new SceneNode({ guid: definition.id, rootName: definition.name ?? 'UI.Gameplay', ...(definition.props ?? {}) }))
      .register(NODE_IDS.inputModeDetector, (definition) => withGuid(new InputModeDetectorNode(), definition))

      .register(NODE_IDS.touchControls, (definition) => withGuid(new TouchControlsNode(), definition))
      .register(NODE_IDS.player, (definition) => withGuid(new PlayerNode(), definition))
      .register(NODE_IDS.playerMovementController, (definition) => withGuid(new PlayerMovementControllerNode(), definition))
      .register(NODE_IDS.playerBody, (definition) => new CollisionRectNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.playerImage, (definition) => new AnimatedImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof AnimatedImageNode>[0]))
      .register(NODE_IDS.playerAnimator, (definition) => withGuid(new PlayerAnimatorNode(), definition))
      .register(NODE_IDS.miningTool, (definition) => withGuid(new MiningToolNode(), definition))
      .register(NODE_IDS.ship, (definition) => new ShipNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.shipImage, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.shipPrompt, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.statusHud, (definition) => new StatusHudNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.statusFrame, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.hpFill, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.fuelFill, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.bottomHud, (definition) => new BottomHudNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.actionFrame, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.energyFill, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotFrame0, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotFrame1, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotFrame2, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotFrame3, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotItem0, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotItem1, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotItem2, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotItem3, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ConstructorParameters<typeof ImageNode>[0]))
      .register(NODE_IDS.slotLabel0, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.slotLabel1, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.slotLabel2, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }))
      .register(NODE_IDS.slotLabel3, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) }));
  }

  private requireSceneNode<T extends GameNode>(root: GameNode, name: string): T {
    const node = collectNodesByName(root).get(name);
    if (!node) throw new Error(`Scene '${root.debugName()}' is missing node '${name}'`);
    return node as T;
  }
}

function withGuid<T extends GameNode>(node: T, definition: SceneNodeJson): T {
  Object.assign(node, { guid: definition.id });
  return node;
}
