import Phaser from 'phaser';
import { GameNode, type NodeContext } from '../../nodes';
import type { UIScene } from '../../scenes/UIScene';
import { buildHudState } from '../gameplayLogic';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';
import { MiningToolNode } from '../MiningToolNode';
import { PlayerStateManagerNode } from '../PlayerStateManagerNode';
import { CameraZoomNode } from './CameraZoomNode';
import { GameWorldNode } from './GameWorldNode';

export class HudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  override readonly dependencies = ['world', 'playerState', 'miningTool', 'cameraZoom'] as const;

  constructor() {
    super({ name: 'hud', order: 60 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
  }

  update(): void {
    emitGameEvent(this.phaserScene, GAME_EVENTS.hudUpdate, buildHudState({
      level: this.world.level,
      inputMode: this.uiScene.getInputMode(),
      playerState: this.playerState,
      miningTool: this.miningTool,
      cameraZoom: this.cameraZoom,
    }));
  }

  private get uiScene(): UIScene {
    return this.phaserScene.scene.get('ui') as UIScene;
  }
}
