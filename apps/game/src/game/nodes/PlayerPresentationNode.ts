import Phaser from 'phaser';
import { AnimatedImageNode, GameNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
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
  private playerImage!: AnimatedImageNode;
  override readonly dependencies = ['world', 'playerController', 'miningTool', 'playerImage'] as const;
  readonly data: PlayerPresentationData = createPlayerPresentationData();

  constructor() {
    super({ name: 'playerPresentation', order: 30, className: 'PlayerPresentationNode' });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.playerImage = this.requireNode<AnimatedImageNode>('playerImage');
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
      walkFrame: this.data.walkFrame,
      x: player?.x ?? null,
      y: player?.y ?? null,
      texture: player?.texture.key ?? null,
    };
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
      grounded: this.playerController.grounded,
      walkFrame: this.data.walkFrame,
    });

    this.data.facing = animation.facing;
    this.playerImage.play(animation.animationId);
    this.playerImage.flipX = animation.flipX;
    player.setFlipX(animation.flipX);

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
