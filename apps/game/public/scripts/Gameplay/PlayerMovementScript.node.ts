import * as Core from '@gravity-dig/game-core';

type CollisionBody = {
  x: number;
  y: number;
  setPosition(x: number, y: number): unknown;
};

type LevelNodeLike = {
  collidesBox(centerX: number, centerY: number, width: number, height: number): boolean;
};

type GameplayInputLike = {
  getPlayerIntent(options: { previousJumpHeld: boolean }): {
    moveX: number;
    jumpPressed: boolean;
    jumpHeld: boolean;
    interactPressed: boolean;
  };
  isMenuOpen?(): boolean;
};

type PlayerStateLike = {
  stats?: {
    moveSpeed?: number;
    jumpVelocity?: number;
  };
};

const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 64;
const MAX_DELTA_SECONDS = 1 / 30;
const SKIN_WIDTH = 0.5;
const SKIN_HEIGHT = 0.5;

export default class PlayerMovementScript extends Core.ScriptNode {
  id = 'dynamic.player-movement';
  name = 'Player Movement Script';

  levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
  inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  moveSpeedScale = Core.prop.number(1.22, { min: 0.2, max: 3, step: 0.05, label: 'Move Speed Scale' });
  jumpVelocityScale = Core.prop.number(1.18, { min: 0.2, max: 3, step: 0.05, label: 'Jump Velocity Scale' });
  gravity = Core.prop.number(2500, { min: 0, step: 10, label: 'Gravity' });
  groundAcceleration = Core.prop.number(32000, { min: 0, step: 100, label: 'Ground Acceleration' });
  airAcceleration = Core.prop.number(26000, { min: 0, step: 100, label: 'Air Acceleration' });
  groundFriction = Core.prop.number(36000, { min: 0, step: 100, label: 'Ground Friction' });
  airFriction = Core.prop.number(2200, { min: 0, step: 100, label: 'Air Friction' });
  coyoteTimeMs = Core.prop.number(140, { min: 0, max: 300, step: 10, label: 'Coyote Time ms' });
  jumpBufferMs = Core.prop.number(150, { min: 0, max: 300, step: 10, label: 'Jump Buffer ms' });
  jumpCutMultiplier = Core.prop.number(0.56, { min: 0.1, max: 1, step: 0.05, label: 'Jump Cut Multiplier' });
  maxFallSpeed = Core.prop.number(1500, { min: 200, step: 50, label: 'Max Fall Speed' });
  groundSnapPixels = Core.prop.number(6, { min: 0, max: 12, step: 1, label: 'Ground Snap px' });

  velocity = { x: 0, y: 0 };
  grounded = false;
  inputBlocked = false;

  private player?: CollisionBody;
  private level?: LevelNodeLike;
  private input?: GameplayInputLike;
  private playerState?: PlayerStateLike;
  private coyoteTimerSeconds = 0;
  private jumpBufferTimerSeconds = 0;
  private jumpHeld = false;

  resolve() {
    this.level = this.resolveNode<LevelNodeLike>(this.levelNodeId, 'Level');
    this.input = this.resolveNode<GameplayInputLike>(this.inputNodeId, 'GameplayInput');
    this.playerState = this.resolveNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
  }

  setPlayer(player: CollisionBody) {
    this.player = player;
    this.resetMotion();
    this.grounded = this.collidesAt(player.x, player.y + 1);
  }

  resetMotion() {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.grounded = false;
    this.inputBlocked = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
    this.jumpHeld = false;
  }

  getVelocity() {
    return this.velocity;
  }

  isGrounded() {
    return this.grounded;
  }

  isInputBlocked() {
    return this.inputBlocked;
  }

  update(deltaMs: number) {
    if (!this.player || !this.level || !this.input) return;

    const dt = Math.min(deltaMs / 1000, MAX_DELTA_SECONDS);
    this.updateInput(dt);
    this.updatePhysics(dt);
  }

  private updateInput(dt: number) {
    const menuOpen = this.input?.isMenuOpen?.() === true;
    this.inputBlocked = menuOpen;

    if (menuOpen) {
      this.velocity.x = 0;
      this.jumpHeld = false;
      this.jumpBufferTimerSeconds = 0;
      return;
    }

    const intent = this.input?.getPlayerIntent({ previousJumpHeld: this.jumpHeld }) ?? { moveX: 0, jumpPressed: false, jumpHeld: false, interactPressed: false };
    const targetSpeed = intent.moveX * this.moveSpeed();
    const acceleration = Math.abs(targetSpeed) > 0.01
      ? (this.grounded ? this.groundAcceleration : this.airAcceleration)
      : (this.grounded ? this.groundFriction : this.airFriction);

    this.velocity.x = approach(this.velocity.x, targetSpeed, acceleration * dt);

    if (intent.jumpPressed) this.jumpBufferTimerSeconds = this.jumpBufferMs / 1000;
    if (!intent.jumpHeld && this.jumpHeld && this.velocity.y < 0) this.velocity.y *= this.jumpCutMultiplier;
    this.jumpHeld = intent.jumpHeld;

    if (this.jumpBufferTimerSeconds > 0) this.jumpBufferTimerSeconds = Math.max(0, this.jumpBufferTimerSeconds - dt);
  }

  private updatePhysics(dt: number) {
    const wasGrounded = this.grounded;

    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();

    this.velocity.y = Math.min(this.maxFallSpeed, this.velocity.y + this.gravity * dt);

    this.moveHorizontal(this.velocity.x * dt);
    this.grounded = false;
    this.moveVertical(this.velocity.y * dt);
    this.snapToGround();

    if (this.grounded) this.coyoteTimerSeconds = this.coyoteTimeMs / 1000;
    else if (wasGrounded) this.coyoteTimerSeconds = this.coyoteTimeMs / 1000;
    else if (this.coyoteTimerSeconds > 0) this.coyoteTimerSeconds = Math.max(0, this.coyoteTimerSeconds - dt);

    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();
  }

  private jump() {
    this.velocity.y = this.jumpVelocity();
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
  }

  private moveHorizontal(dx: number) {
    if (!this.player || dx === 0) return;

    const direction = Math.sign(dx);
    let remaining = Math.abs(dx);
    while (remaining > 0) {
      const step = Math.min(remaining, 2);
      const nextX = this.player.x + direction * step;
      if (this.collidesAt(nextX, this.player.y)) {
        this.velocity.x = 0;
        return;
      }
      this.player.setPosition(nextX, this.player.y);
      remaining -= step;
    }
  }

  private moveVertical(dy: number) {
    if (!this.player || dy === 0) return;

    const direction = Math.sign(dy);
    let remaining = Math.abs(dy);
    while (remaining > 0) {
      const step = Math.min(remaining, 2);
      const nextY = this.player.y + direction * step;
      if (this.collidesAt(this.player.x, nextY)) {
        if (direction > 0) this.grounded = true;
        this.velocity.y = 0;
        return;
      }
      this.player.setPosition(this.player.x, nextY);
      remaining -= step;
    }
  }

  private snapToGround() {
    if (!this.player || this.grounded || this.velocity.y < 0 || this.groundSnapPixels <= 0) return;

    for (let offset = 1; offset <= this.groundSnapPixels; offset += 1) {
      if (!this.collidesAt(this.player.x, this.player.y + offset)) continue;
      this.player.setPosition(this.player.x, this.player.y + offset - 1);
      this.velocity.y = 0;
      this.grounded = true;
      return;
    }
  }

  private collidesAt(centerX: number, centerY: number) {
    return this.level?.collidesBox(centerX, centerY, PLAYER_WIDTH - SKIN_WIDTH, PLAYER_HEIGHT - SKIN_HEIGHT) === true;
  }

  private moveSpeed() {
    return (this.playerState?.stats?.moveSpeed ?? 470) * this.moveSpeedScale;
  }

  private jumpVelocity() {
    return (this.playerState?.stats?.jumpVelocity ?? -1040) * this.jumpVelocityScale;
  }

  private resolveNode<T>(instanceId: string | null, fallbackName: string): T | undefined {
    return (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
  }
}

function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(target, current + delta);
  if (current > target) return Math.max(target, current - delta);
  return target;
}
