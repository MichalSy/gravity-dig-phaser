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

export default class PlayerMovementScript extends Core.ScriptNode {
  id = 'dynamic.player-movement';
  name = 'Player Movement Script';

  levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
  inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  gravity = Core.prop.number(2640, { min: 0, step: 10, label: 'Gravity' });
  groundAcceleration = Core.prop.number(7200, { min: 0, step: 100, label: 'Ground Acceleration' });
  airAcceleration = Core.prop.number(5200, { min: 0, step: 100, label: 'Air Acceleration' });
  groundFriction = Core.prop.number(8200, { min: 0, step: 100, label: 'Ground Friction' });
  airFriction = Core.prop.number(900, { min: 0, step: 100, label: 'Air Friction' });
  coyoteTimeMs = Core.prop.number(120, { min: 0, max: 300, step: 10, label: 'Coyote Time ms' });
  jumpBufferMs = Core.prop.number(140, { min: 0, max: 300, step: 10, label: 'Jump Buffer ms' });
  jumpCutMultiplier = Core.prop.number(0.45, { min: 0.1, max: 1, step: 0.05, label: 'Jump Cut Multiplier' });
  maxFallSpeed = Core.prop.number(1450, { min: 200, step: 50, label: 'Max Fall Speed' });
  groundSnapPixels = Core.prop.number(4, { min: 0, max: 12, step: 1, label: 'Ground Snap px' });

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
    this.level = this.levelNodeId ? this.getNodeById<LevelNodeLike>(this.levelNodeId) : this.getNode<LevelNodeLike>('Level');
    this.input = this.inputNodeId ? this.getNodeById<GameplayInputLike>(this.inputNodeId) : this.getNode<GameplayInputLike>('GameplayInput');
    this.playerState = this.playerStateNodeId ? this.getNodeById<PlayerStateLike>(this.playerStateNodeId) : this.getNode<PlayerStateLike>('PlayerState');
  }

  setPlayer(player: CollisionBody) {
    this.player = player;
    this.resetMotion();
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

    const dt = Math.min(deltaMs / 1000, 1 / 30);
    this.updateInput(dt);
    this.updatePhysics(dt);
  }

  private updateInput(dt: number) {
    const menuOpen = this.input?.isMenuOpen?.() === true;
    this.inputBlocked = menuOpen;

    if (menuOpen) {
      this.velocity.x = approach(this.velocity.x, 0, this.groundFriction * dt);
      this.jumpHeld = false;
      this.jumpBufferTimerSeconds = 0;
      return;
    }

    const intent = this.input?.getPlayerIntent({ previousJumpHeld: this.jumpHeld }) ?? { moveX: 0, jumpPressed: false, jumpHeld: false, interactPressed: false };
    const targetSpeed = intent.moveX * this.moveSpeed();
    const accel = this.grounded ? this.groundAcceleration : this.airAcceleration;
    const friction = this.grounded ? this.groundFriction : this.airFriction;

    this.velocity.x = Math.abs(targetSpeed) > 0.01
      ? approach(this.velocity.x, targetSpeed, accel * dt)
      : approach(this.velocity.x, 0, friction * dt);

    if (intent.jumpPressed) this.jumpBufferTimerSeconds = this.jumpBufferMs / 1000;
    if (!intent.jumpHeld && this.jumpHeld && this.velocity.y < 0) this.velocity.y *= this.jumpCutMultiplier;
    this.jumpHeld = intent.jumpHeld;

    if (this.jumpBufferTimerSeconds > 0) this.jumpBufferTimerSeconds = Math.max(0, this.jumpBufferTimerSeconds - dt);
  }

  private updatePhysics(dt: number) {
    const wasGrounded = this.grounded;

    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();

    this.velocity.y = Math.min(this.maxFallSpeed, this.velocity.y + this.gravity * dt);

    this.moveAxis(this.velocity.x * dt, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * dt);
    this.snapToGround();

    if (wasGrounded && !this.grounded) this.coyoteTimerSeconds = this.coyoteTimeMs / 1000;
    if (this.grounded) this.coyoteTimerSeconds = 0;
    else if (this.coyoteTimerSeconds > 0) this.coyoteTimerSeconds = Math.max(0, this.coyoteTimerSeconds - dt);

    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) this.jump();
  }

  private jump() {
    this.velocity.y = this.jumpVelocity();
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
  }

  private moveAxis(dx: number, dy: number) {
    if (!this.player || !this.level || (dx === 0 && dy === 0)) return;

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + stepX;
      const nextY = this.player.y + stepY;
      if (!this.level.collidesBox(nextX, nextY, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        this.player.setPosition(nextX, nextY);
        continue;
      }

      if (dy > 0) this.grounded = true;
      if (dy !== 0) this.velocity.y = 0;
      if (dx !== 0) this.velocity.x = 0;
      break;
    }
  }

  private snapToGround() {
    if (!this.player || !this.level || this.grounded || this.velocity.y < 0 || this.groundSnapPixels <= 0) return;

    for (let offset = 1; offset <= this.groundSnapPixels; offset += 1) {
      if (!this.level.collidesBox(this.player.x, this.player.y + offset, PLAYER_WIDTH, PLAYER_HEIGHT)) continue;
      this.player.setPosition(this.player.x, this.player.y + offset - 1);
      this.velocity.y = 0;
      this.grounded = true;
      return;
    }
  }

  private moveSpeed() {
    return this.playerState?.stats?.moveSpeed ?? 470;
  }

  private jumpVelocity() {
    return this.playerState?.stats?.jumpVelocity ?? -1040;
  }
}

function approach(current: number, target: number, delta: number): number {
  if (current < target) return Math.min(target, current + delta);
  if (current > target) return Math.max(target, current - delta);
  return target;
}
