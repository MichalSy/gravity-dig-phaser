import Phaser from 'phaser';
import { GameNode, type NodeContext } from '../../nodes';
import { computePlayerAnimationState } from '../gameplayLogic';
import { createPlayerPresentationData, type PlayerPresentationData } from '../nodeData';
import { MiningToolNode } from './MiningToolNode';
import { PlayerControllerNode } from './PlayerControllerNode';
import { GameWorldNode } from './GameWorldNode';

export class PlayerPresentationNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerController!: PlayerControllerNode;
  private miningTool!: MiningToolNode;
  override readonly dependencies = ['world', 'playerController', 'miningTool'] as const;
  readonly data: PlayerPresentationData = createPlayerPresentationData();

  constructor() {
    super({ name: 'playerPresentation', order: 30 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
  }

  update(deltaMs: number): void {
    const player = this.world.player;
    this.data.walkTimerMs += deltaMs;
    if (this.data.walkTimerMs > 120) {
      this.data.walkFrame += 1;
      this.data.walkTimerMs = 0;
    }

    const aimX = this.miningTool.isMiningPressed() ? this.miningTool.getAimWorldPoint().x : undefined;
    const animation = computePlayerAnimationState({
      playerX: player.x,
      aimX,
      previousFacing: this.data.facing,
      velocity: this.playerController.velocity,
      gravityEnabled: this.playerController.gravityEnabled,
      grounded: this.playerController.grounded,
      walkFrame: this.data.walkFrame,
    });

    this.data.facing = animation.facing;
    player.setTexture(animation.textureKey).setFlipX(animation.flipX);

    if (animation.footstepFrame !== undefined && animation.footstepFrame !== this.data.lastFootstepFrame) {
      this.playFootstep();
      this.data.lastFootstepFrame = animation.footstepFrame;
    } else if (animation.footstepFrame === undefined) {
      this.data.lastFootstepFrame = -1;
    }
  }

  private playFootstep(): void {
    this.data.walkSoundIndex = (this.data.walkSoundIndex % 3) + 1;
    this.phaserScene.sound.play(`walk-${this.data.walkSoundIndex}`, {
      volume: 0.16,
      detune: Phaser.Math.Between(-30, 30),
    });
  }
}
