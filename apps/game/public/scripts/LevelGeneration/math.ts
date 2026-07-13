import type { WorldContext } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceToCore(context: WorldContext, x: number, y: number): number {
  return Math.hypot(x - context.core.x, y - context.core.y);
}

export function referenceCoreDistance(context: WorldContext): number {
  return Math.max(1, Math.hypot(context.core.x - context.spawn.x, context.core.y - context.spawn.y));
}

export function distanceToStart(context: WorldContext, x: number, y: number): number {
  return Math.hypot(x - context.spawn.x, y - context.spawn.y);
}
