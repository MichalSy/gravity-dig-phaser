import Phaser from 'phaser';
import { AnimatedImageNode, GameNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { computePlayerAnimationState } from '../gameplayLogic';
import { createPlayerAnimatorData, type PlayerAnimatorData } from '../nodeData';
import { MiningToolNode } from './MiningToolNode';
import { PlayerMovementControllerNode } from './PlayerMovementControllerNode';
import { GameWorldNode } from './GameWorldNode';

export class PlayerAnimatorNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerMovementController!: PlayerMovementControllerNode;
  private miningTool!: MiningToolNode;
  private playerImage!: AnimatedImageNode;
  override readonly dependencies = ['World', 'PlayerMovementController', 'MiningTool', 'PlayerImage'] as const;
  readonly data: PlayerAnimatorData = createPlayerAnimatorData();

  constructor() {
    super({ name: 'PlayerAnimator', className: 'PlayerAnimatorNode' });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerMovementController = this.requireNode<PlayerMovementControllerNode>('PlayerMovementController');
    this.miningTool = this.requireNode<MiningToolNode>('MiningTool');
    this.playerImage = this.requireNode<AnimatedImageNode>('PlayerImage');
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    const player = this.world?.player;
    if (!player) return undefined;
    const bounds = player.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }

  override getDebugProps(): NodeDebugProps {
    const player = this.world?.player;
    return {
      ...super.getDebugProps(),
      facing: this.data.facing,
      animationId: this.data.animationId,
      x: player?.x ?? null,
      y: player?.y ?? null,
      texture: player?.texture.key ?? null,
    };
  }

  update(): void {
    const player = this.world.player;
    if (!this.playerImage.isEffectivelyActive()) {
      player.setVisible(false);
      return;
    }

    const aimX = this.miningTool.isMiningPressed() ? this.miningTool.getAimWorldPoint().x : undefined;
    const animation = computePlayerAnimationState({
      playerX: player.x,
      aimX,
      previousFacing: this.data.facing,
      velocity: this.playerMovementController.velocity,
      grounded: this.playerMovementController.grounded,
    });

    this.data.facing = animation.facing;
    this.data.animationId = animation.animationId;
    this.playerImage.play(animation.animationId);
    this.playerImage.flipX = animation.flipX;

    this.updateFootstep(animation.footstepActive);
  }

  private updateFootstep(active: boolean): void {
    if (!active) {
      this.data.footstepTimerMs = 0;
      return;
    }

    this.data.footstepTimerMs += this.phaserScene.game.loop.delta;
    if (this.data.footstepTimerMs < 240) return;

    this.data.footstepTimerMs = 0;
    this.playFootstep();
  }

  private playFootstep(): void {
    this.data.walkSoundIndex = (this.data.walkSoundIndex % 3) + 1;
    this.phaserScene.sound.play(`walk-${this.data.walkSoundIndex}`, {
      volume: 0.16,
      detune: Phaser.Math.Between(-30, 30),
    });
  }
}
