import type Phaser from 'phaser';
import { GRAVITY, PLAYER_SIZE } from '../../config/gameConfig';
import type { PlayerControllerData } from '../nodeData';

export interface PlayerPhysicsStepArgs {
  player: Phaser.GameObjects.Image;
  data: PlayerControllerData;
  deltaSeconds: number;
  collidesBox(x: number, y: number, width: number, height: number): boolean;
  jump(): void;
}

export function stepPlayerPhysics(args: PlayerPhysicsStepArgs): void {
  const wasGrounded = args.data.grounded;
  args.data.velocity.y += GRAVITY * args.deltaSeconds;

  moveAxis(args, args.data.velocity.x * args.deltaSeconds, 0);
  args.data.grounded = false;
  moveAxis(args, 0, args.data.velocity.y * args.deltaSeconds);

  if (wasGrounded && !args.data.grounded) args.data.coyoteTimerSeconds = 0.1;
  if (args.data.coyoteTimerSeconds > 0) args.data.coyoteTimerSeconds -= args.deltaSeconds;

  if (args.data.jumpBufferTimerSeconds > 0 && (args.data.grounded || args.data.coyoteTimerSeconds > 0)) {
    args.jump();
    args.data.jumpBufferTimerSeconds = 0;
  }
}

function moveAxis(args: PlayerPhysicsStepArgs, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;

  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let i = 0; i < steps; i += 1) {
    const nextX = args.player.x + stepX;
    const nextY = args.player.y + stepY;
    if (!args.collidesBox(nextX, nextY, PLAYER_SIZE.w, PLAYER_SIZE.h)) {
      args.player.setPosition(nextX, nextY);
      continue;
    }

    if (dy > 0) args.data.grounded = true;
    if (dy !== 0) args.data.velocity.y = 0;
    if (dx !== 0) args.data.velocity.x = 0;
    break;
  }
}
