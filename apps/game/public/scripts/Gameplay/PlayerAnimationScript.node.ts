import * as Core from '@gravity-dig/game-core';

type Point = { x: number; y: number };
type WorldLike = { player: { x: number; visible: boolean; setVisible(value: boolean): unknown } };
type MovementLike = { callScriptMethod?(name: string): unknown; getScriptProperty?(name: string): unknown };
type MiningLike = { callScriptMethod(name: string): unknown };
type AnimatedImageLike = { isEffectivelyActive(): boolean; play(id: string): void; flipX: boolean };
type AudioLike = { playOneShot(options?: { detune?: number }): void };

export default class PlayerAnimationScript extends Core.ScriptNode {
  id = 'dynamic.player-animation';
  name = 'Player Animator';

  worldNodeId = Core.prop.nodeRef(null, { label: 'World' });
  movementNodeId = Core.prop.nodeRef('8e9c3d71-ea21-4882-809a-e75645ce74ef', { label: 'Movement' });
  miningNodeId = Core.prop.nodeRef('cb278fb8-c7fd-555f-98ef-6a9b0283abe4', { label: 'Mining Tool' });
  imageNodeId = Core.prop.nodeRef('fe8c9a25-c18c-4154-aa84-e4272055d66b', { label: 'Player Image' });
  footstepAudioNodeIds = Core.prop.nodeRefList([], { label: 'Footstep Audio' });
  footstepIntervalMs = Core.prop.number(240, { min: 50, max: 1000, step: 10, label: 'Footstep Interval ms' });

  facing: 'east' | 'west' = 'east';
  animationId = 'idle.east';
  private world!: WorldLike;
  private movement!: MovementLike;
  private mining!: MiningLike;
  private image!: AnimatedImageLike;
  private footstepAudio: AudioLike[] = [];
  private footstepTimerMs = 0;
  private walkSoundIndex = 0;

  resolve() {
    this.world = this.requireResolvedNode<WorldLike>(this.worldNodeId, 'World');
    this.movement = this.requireResolvedNode<MovementLike>(this.movementNodeId, 'PlayerMovementController');
    this.mining = this.requireResolvedNode<MiningLike>(this.miningNodeId, 'MiningTool');
    this.image = this.requireResolvedNode<AnimatedImageLike>(this.imageNodeId, 'PlayerImage');
    this.footstepAudio = this.footstepAudioNodeIds.flatMap((id) => {
      const node = this.getNodeById<AudioLike>(id);
      return node ? [node] : [];
    });
  }

  update(deltaMs: number) {
    const player = this.world.player;
    if (!this.image.isEffectivelyActive()) {
      player.setVisible(false);
      return;
    }
    player.setVisible(true);
    const aim = this.mining.callScriptMethod('getAimWorldPoint') as Point | undefined;
    const aimX = this.mining.callScriptMethod('isMiningPressed') === true ? aim?.x : undefined;
    const velocity = readPoint(this.movement.callScriptMethod?.('getVelocity') ?? this.movement.getScriptProperty?.('velocity'));
    const grounded = (this.movement.callScriptMethod?.('isGrounded') ?? this.movement.getScriptProperty?.('grounded')) === true;
    if (aimX !== undefined && Math.abs(aimX - player.x) > 10) this.facing = aimX >= player.x ? 'east' : 'west';
    else if (Math.abs(velocity.x) > 1) this.facing = velocity.x > 0 ? 'east' : 'west';
    const airborne = !grounded;
    const moving = Math.abs(velocity.x) > 1;
    const animationName = airborne ? (velocity.y <= 30 ? 'jump' : 'fall') : moving ? 'walk' : 'idle';
    this.animationId = `${animationName}.east`;
    this.image.play(this.animationId);
    this.image.flipX = this.facing === 'west';
    this.updateFootstep(!airborne && moving, deltaMs);
  }

  private updateFootstep(active: boolean, deltaMs: number) {
    if (!active) {
      this.footstepTimerMs = 0;
      return;
    }
    this.footstepTimerMs += deltaMs;
    if (this.footstepTimerMs < this.footstepIntervalMs || this.footstepAudio.length === 0) return;
    this.footstepTimerMs = 0;
    this.walkSoundIndex = (this.walkSoundIndex + 1) % this.footstepAudio.length;
    this.footstepAudio[this.walkSoundIndex].playOneShot({ detune: Math.round(Math.random() * 60 - 30) });
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}

function readPoint(value: unknown): Point {
  return value && typeof value === 'object' && 'x' in value && 'y' in value
    ? { x: Number(value.x), y: Number(value.y) }
    : { x: 0, y: 0 };
}
