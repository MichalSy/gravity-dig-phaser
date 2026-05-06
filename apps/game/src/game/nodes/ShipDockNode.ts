import Phaser from 'phaser';
import { PLAYER_SIZE } from '../../config/gameConfig';
import { GameNode, type NodeContext } from '../../nodes';
import { buildShipDockPrompt, isAtShipDock, playerPromptY } from '../gameplayLogic';
import { GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { createShipDockData, type ShipDockData } from '../nodeData';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';
import { GameWorldNode } from './GameWorldNode';

export class ShipDockNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private shipPrompt?: Phaser.GameObjects.Text;
  override readonly dependencies = ['World', 'PlayerState'] as const;
  readonly data: ShipDockData = createShipDockData();

  constructor() {
    super({ name: 'ShipDock', className: 'ShipDockNode' });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    onGameEvent(this.phaserScene, GAME_EVENTS.playerInteractRequested, this.tryReturnCargoToShip, this);
    onGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetPrompt, this);
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.resetPrompt();
  }

  destroy(): void {
    offGameEvent(this.phaserScene, GAME_EVENTS.playerInteractRequested, this.tryReturnCargoToShip, this);
    offGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetPrompt, this);
    this.shipPrompt?.destroy();
  }

  update(deltaMs: number): void {
    if (!this.shipPrompt) this.resetPrompt();
    if (!this.shipPrompt) return;

    this.data.lastMessageTimerMs = Math.max(0, this.data.lastMessageTimerMs - deltaMs);
    const player = this.world.player;
    const atDock = isAtShipDock(player.x, player.y);
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    const message = buildShipDockPrompt({
      atDock,
      hasCargo,
      credits: this.playerState.save.profile.credits,
      overrideMessage: this.data.lastMessageTimerMs > 0 ? this.data.lastMessage : undefined,
    });

    this.shipPrompt
      .setText(message)
      .setPosition(player.x, playerPromptY(player.y))
      .setVisible(Boolean(message));
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.shipPrompt ? [this.shipPrompt] : [];
  }

  private resetPrompt(): void {
    if (!this.world) return;
    this.shipPrompt?.destroy();
    this.shipPrompt = this.phaserScene.add
      .text(this.world.player.x, this.world.player.y - PLAYER_SIZE.h, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: '900',
        color: '#e0f2fe',
        backgroundColor: 'rgba(2,6,23,0.72)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 1)
            .setVisible(false);
  }

  private tryReturnCargoToShip(): void {
    const player = this.world.player;
    if (!isAtShipDock(player.x, player.y)) {
      this.showShipMessage('Zu weit vom Schiff entfernt');
      return;
    }

    const result = this.playerState.returnCargoToShip();
    this.showShipMessage(result.message);
  }

  private showShipMessage(message: string): void {
    this.data.lastMessage = message;
    this.data.lastMessageTimerMs = 2200;
  }
}
