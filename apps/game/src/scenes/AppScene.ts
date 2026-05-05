import Phaser from 'phaser';
import { loadMenuAssets, MENU_GRAPHIC_ASSETS } from '../assets/AssetLoader';
import { LevelGeneratorManagerNode, PlayerStateManagerNode } from '../game/nodes';
import { NodeRoot, NodeRuntime } from '../nodes';
import { GameplayRootNode, LoadingNode, MenuNode } from '../app/nodes';
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
    this.appRoot.addChild(new GameplayRootNode());
  }
}
