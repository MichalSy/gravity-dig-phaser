import Phaser from 'phaser';
import { NodeRuntime, NodeScene } from '../nodes';
import {
  AutoSaveNode,
  CameraZoomNode,
  CollisionDebugNode,
  GameWorldNode,
  HudNode,
  PlayerPresentationNode,
  RunRecoveryNode,
  ShipDockNode,
} from '../game/GameplayNodes';
import { LevelGeneratorManagerNode, LevelNode } from '../game/LevelNodes';
import { MiningToolNode } from '../game/MiningToolNode';
import { PlayerControllerNode } from '../game/PlayerControllerNode';
import { GAME_EVENTS, emitGameEvent, onceGameEvent } from '../game/gameEvents';
import { PlayerStateManagerNode } from '../game/PlayerStateManagerNode';
import { loadGameAssets } from '../assets/AssetLoader';

export class GameScene extends Phaser.Scene {
  private gameRuntime!: NodeRuntime;

  constructor() {
    super('game');
  }

  preload(): void {
    if (!this.textures.exists('tiles')) {
      loadGameAssets(this);
    }
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');
    this.scene.launch('ui');
    this.configureUiVisibilityDuringLoading();

    this.gameRuntime = new NodeRuntime({ phaserScene: this });
    this.gameRuntime.addPersistentNode(new PlayerStateManagerNode());
    this.gameRuntime.addPersistentNode(new LevelGeneratorManagerNode());

    const gameNodeScene = this.gameRuntime.addScene(new NodeScene({ sceneName: 'game' }));
    gameNodeScene.addChild(new LevelNode());
    gameNodeScene.addChild(new CameraZoomNode());
    gameNodeScene.addChild(new GameWorldNode());
    gameNodeScene.addChild(new PlayerControllerNode());
    gameNodeScene.addChild(new MiningToolNode());
    gameNodeScene.addChild(new PlayerPresentationNode());
    gameNodeScene.addChild(new CollisionDebugNode());
    gameNodeScene.addChild(new HudNode());
    gameNodeScene.addChild(new RunRecoveryNode());
    gameNodeScene.addChild(new ShipDockNode());
    gameNodeScene.addChild(new AutoSaveNode());

    this.gameRuntime.init();
    this.gameRuntime.resolve();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameRuntime.destroy();
    });

    this.time.delayedCall(0, () => emitGameEvent(this, GAME_EVENTS.gameReady));
  }

  update(_time: number, deltaMs: number): void {
    this.gameRuntime.update(deltaMs);
  }

  private configureUiVisibilityDuringLoading(): void {
    const loadingActive = this.scene.isActive('loading') || this.scene.isVisible('loading');
    this.scene.setVisible(!loadingActive, 'ui');

    if (loadingActive) {
      onceGameEvent(this, GAME_EVENTS.loadingComplete, () => {
        this.scene.setVisible(true, 'ui');
        this.scene.bringToTop('ui');
      });
      return;
    }

    this.scene.bringToTop('ui');
  }
}
