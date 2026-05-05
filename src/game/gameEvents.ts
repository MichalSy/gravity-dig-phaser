import type Phaser from 'phaser';
import type { LevelData } from './level';

export const GAME_EVENTS = {
  gameplayMenuOpened: 'gameplay-menu:opened',
  gameplayMenuClosed: 'gameplay-menu:closed',
  worldLevelCreated: 'world:level-created',
  shipReturnCargo: 'ship:return-cargo',
  debugCollision: 'debug:collision',
} as const;

export interface GameEventPayloads {
  [GAME_EVENTS.gameplayMenuOpened]: void;
  [GAME_EVENTS.gameplayMenuClosed]: void;
  [GAME_EVENTS.worldLevelCreated]: LevelData;
  [GAME_EVENTS.shipReturnCargo]: void;
  [GAME_EVENTS.debugCollision]: boolean;
}

type EventName = keyof GameEventPayloads;
type Handler<T extends EventName> = GameEventPayloads[T] extends void ? () => void : (payload: GameEventPayloads[T]) => void;

export function emitGameEvent<T extends EventName>(scene: Phaser.Scene, eventName: T, ...payload: GameEventPayloads[T] extends void ? [] : [GameEventPayloads[T]]): void {
  scene.game.events.emit(eventName, ...payload);
}

export function onGameEvent<T extends EventName>(scene: Phaser.Scene, eventName: T, handler: Handler<T>, context?: unknown): void {
  scene.game.events.on(eventName, handler, context);
}

export function offGameEvent<T extends EventName>(scene: Phaser.Scene, eventName: T, handler: Handler<T>, context?: unknown): void {
  scene.game.events.off(eventName, handler, context);
}

export function onceGameEvent<T extends EventName>(scene: Phaser.Scene, eventName: T, handler: Handler<T>, context?: unknown): void {
  scene.game.events.once(eventName, handler, context);
}
