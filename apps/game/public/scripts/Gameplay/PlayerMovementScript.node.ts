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
};

type PlayerStateLike = {
  stats: {
    moveSpeed: number;
    jumpVelocity: number;
  };
};

const PLAYER_SIZE = { w: 40, h: 64 };
const HORIZONTAL_COLLISION_SIZE = { w: PLAYER_SIZE.w, h: PLAYER_SIZE.h - 8 };
const VERTICAL_COLLISION_SIZE = { w: PLAYER_SIZE.w - 8, h: PLAYER_SIZE.h };
const GRAVITY = 2640;

export default class PlayerMovementScript extends Core.ScriptNode {
  id = 'dynamic.player-movement';
  name = 'Player Movement Script';

  levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
  inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });

  velocity = { x: 0, y: 0 };
  grounded = false;
  inputBlocked = false;

  private levelNode!: LevelNodeLike;
  private playerState!: PlayerStateLike;
  private gameplayInput!: GameplayInputLike;
  private player?: CollisionBody;
  private coyoteTimerSeconds = 0;
  private jumpBufferTimerSeconds = 0;
  private jumpHeld = false;

  resolve() {
    this.levelNode = this.requireResolvedNode<LevelNodeLike>(this.levelNodeId, 'Level');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.requireResolvedNode<GameplayInputLike>(this.inputNodeId, 'GameplayInput');
  }

  setPlayer(player: CollisionBody) {
    this.player = player;
    this.resetMotion();
  }

  resetMotion() {
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.jumpBufferTimerSeconds = 0;
    this.jumpHeld = false;
  }

  blockInput() {
    this.inputBlocked = true;
    this.velocity.x = 0;
    this.jumpHeld = false;
    this.jumpBufferTimerSeconds = 0;
  }

  unblockInput() {
    this.inputBlocked = false;
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
    if (!this.player) return;

    const deltaSeconds = deltaMs / 1000;
    this.handleInput(deltaSeconds);
    this.applyPhysics(deltaSeconds);
  }

  private handleInput(deltaSeconds: number) {
    if (this.inputBlocked) {
      this.velocity.x = 0;
      this.jumpHeld = false;
      this.jumpBufferTimerSeconds = 0;
      return;
    }

    const intent = this.gameplayInput.getPlayerIntent({ previousJumpHeld: this.jumpHeld });
    this.velocity.x = intent.moveX * this.playerState.stats.moveSpeed;

    this.jumpHeld = intent.jumpHeld;
    if (intent.jumpPressed) this.queueOrPerformJump();
    if (this.jumpBufferTimerSeconds > 0) this.jumpBufferTimerSeconds -= deltaSeconds;
  }

  private queueOrPerformJump() {
    if (this.grounded || this.coyoteTimerSeconds > 0) {
      this.jump();
      return;
    }

    this.jumpBufferTimerSeconds = 0.1;
  }

  private applyPhysics(deltaSeconds: number) {
    if (!this.player) return;

    const wasGrounded = this.grounded;
    this.velocity.y += GRAVITY * deltaSeconds;

    this.moveAxis(this.velocity.x * deltaSeconds, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * deltaSeconds);
    this.stabilizeGroundContact();

    if (wasGrounded && !this.grounded) this.coyoteTimerSeconds = 0.1;
    if (this.coyoteTimerSeconds > 0) this.coyoteTimerSeconds -= deltaSeconds;

    if (this.jumpBufferTimerSeconds > 0 && (this.grounded || this.coyoteTimerSeconds > 0)) {
      this.jump();
      this.jumpBufferTimerSeconds = 0;
    }
  }

  private stabilizeGroundContact() {
    if (!this.player || this.grounded || this.velocity.y < 0) return;
    if (!this.levelNode.collidesBox(this.player.x, this.player.y + 1, VERTICAL_COLLISION_SIZE.w, VERTICAL_COLLISION_SIZE.h)) return;
    this.grounded = true;
    this.velocity.y = 0;
  }

  private moveAxis(dx: number, dy: number) {
    if (!this.player || (dx === 0 && dy === 0)) return;

    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + stepX;
      const nextY = this.player.y + stepY;
      const collisionSize = dx !== 0 ? HORIZONTAL_COLLISION_SIZE : VERTICAL_COLLISION_SIZE;
      if (!this.levelNode.collidesBox(nextX, nextY, collisionSize.w, collisionSize.h)) {
        this.player.setPosition(nextX, nextY);
        continue;
      }

      if (dy > 0) this.grounded = true;
      if (dy !== 0) this.velocity.y = 0;
      if (dx !== 0) this.velocity.x = 0;
      break;
    }
  }

  private jump() {
    this.velocity.y = this.playerState.stats.jumpVelocity;
    this.grounded = false;
    this.coyoteTimerSeconds = 0;
    this.emit('player:jump');
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}
