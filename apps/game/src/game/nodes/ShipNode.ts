import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { ImageNode, TextNode, TransformNode, type NodeContext } from '../../nodes';
import { buildShipDockPrompt, isAtShipDock, playerPromptY } from '../gameplayLogic';
import { GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { createShipData, type ShipData } from '../nodeData';
import { SHIP_DOCK_CENTER_X } from '../world/worldGeometry';
import { GameWorldNode } from './GameWorldNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

const SHIP_BOTTOM_Y = TILE_SIZE * 3;
const SHIP_DISPLAY_WIDTH = TILE_SIZE * 5.71;
const SHIP_DISPLAY_HEIGHT = TILE_SIZE * 3.5;

export class ShipNode extends TransformNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private readonly shipImage: ImageNode;
  private readonly promptText: TextNode;
  override readonly dependencies = ['World', 'PlayerState'] as const;
  readonly data: ShipData = createShipData();

  constructor() {
    super({ name: 'Ship', className: 'ShipNode', position: { x: SHIP_DOCK_CENTER_X, y: SHIP_BOTTOM_Y }, sizeMode: 'explicit' });
    this.size = { width: SHIP_DISPLAY_WIDTH, height: SHIP_DISPLAY_HEIGHT };
    this.origin = { x: 0.5, y: 1 };

    this.shipImage = this.addChild(new ImageNode({
      name: 'ShipImage',
      assetId: 'ship',
      parentAnchor: 'bottom-center',
      origin: { x: 0.5, y: 1 },
    }));
    this.promptText = this.addChild(new TextNode({
      name: 'ShipPrompt',
      text: '',
      origin: { x: 0.5, y: 1 },
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: '900',
        color: '#e0f2fe',
        backgroundColor: 'rgba(2,6,23,0.72)',
        padding: { x: 10, y: 6 },
      },
      visible: false,
    }));
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    onGameEvent(this.phaserScene, GAME_EVENTS.playerInteractRequested, this.tryReturnCargoToShip, this);
    onGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetPrompt, this);
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.layoutShipImage();
    this.resetPrompt();
  }

  destroy(): void {
    offGameEvent(this.phaserScene, GAME_EVENTS.playerInteractRequested, this.tryReturnCargoToShip, this);
    offGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetPrompt, this);
  }

  update(deltaMs: number): void {
    this.layoutShipImage();
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

    this.promptText.text = message;
    this.promptText.position = this.promptText.worldToLocalPosition({ x: player.x, y: playerPromptY(player.y) });
    this.promptText.visible = Boolean(message);
  }

  private layoutShipImage(): void {
    const frame = this.shipImage.image.frame;
    this.shipImage.scaleX = SHIP_DISPLAY_WIDTH / frame.width;
    this.shipImage.scaleY = SHIP_DISPLAY_HEIGHT / frame.height;
  }

  private resetPrompt(): void {
    this.data.lastMessage = '';
    this.data.lastMessageTimerMs = 0;
    this.promptText.text = '';
    this.promptText.visible = false;
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
