import Phaser from 'phaser';
import { loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import {
  AutoSaveNode,
  CameraZoomNode,
  GameWorldNode,
  HudNode,
  LevelGeneratorManagerNode,
  LevelNode,
  MiningToolNode,
  PlayerNode,
  PlayerStateManagerNode,
  RunRecoveryNode,
  ShipDockNode,
} from '../game/nodes';
import { NodeRoot, NodeRuntime, SceneNode } from '../nodes';
import { GameplayInputNode, HudStateNode, LoadingNode, MenuNode } from '../app/nodes';
import { BottomHudNode, InputModeDetectorNode, StatusHudNode, TouchControlsNode } from '../ui/nodes';
import { DebugBridgeNode, readDebugConnectionConfig } from '../debug';

export class AppScene extends Phaser.Scene {
  private appRuntime!: NodeRuntime;
  private appRoot!: NodeRoot;
  private menuNode!: MenuNode;
  private loadingNode!: LoadingNode;
  private gameplayMounted = false;

  constructor() {
    super('app');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');

    this.appRuntime = new NodeRuntime({ phaserScene: this });
    this.appRuntime.registerImageAssets(MENU_GRAPHIC_ASSETS);
    const debugConfig = readDebugConnectionConfig();
    if (debugConfig) this.appRuntime.addPersistentNode(new DebugBridgeNode(debugConfig));

    this.appRoot = this.appRuntime.addRoot(new NodeRoot({ rootName: 'app' }));
    this.menuNode = this.appRoot.addChild(new MenuNode(() => this.startGame()));
    this.loadingNode = this.appRoot.addChild(new LoadingNode(() => this.mountGameplay()));

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
    this.appRuntime.addPersistentNode(new PlayerStateManagerNode());
    this.appRuntime.addPersistentNode(new LevelGeneratorManagerNode());
    this.mountGameplayScenes();
  }

  private mountGameplayScenes(): void {
    const gameplay = this.appRoot.addChild(new SceneNode({ rootName: 'gameplay', order: 20 }));
    gameplay.addChild(new GameplayInputNode());
    gameplay.addChild(new HudStateNode());
    gameplay.addChild(new LevelNode());
    gameplay.addChild(new CameraZoomNode());
    gameplay.addChild(new GameWorldNode());
    gameplay.addChild(new PlayerNode());
    gameplay.addChild(new MiningToolNode());
    gameplay.addChild(new HudNode());
    gameplay.addChild(new RunRecoveryNode());
    gameplay.addChild(new ShipDockNode());
    gameplay.addChild(new AutoSaveNode());

    const gameplayUi = this.appRoot.addChild(new SceneNode({ rootName: 'ui.gameplay', order: 100, boundsMode: 'content' }));
    gameplayUi.addChild(new InputModeDetectorNode());
    gameplayUi.addChild(new StatusHudNode());
    gameplayUi.addChild(new BottomHudNode());
    gameplayUi.addChild(new TouchControlsNode());
  }
}
