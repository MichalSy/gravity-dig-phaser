import * as Core from '@gravity-dig/game-core';

type PlayerBody = {
  x: number;
  y: number;
};

type WorldNodeLike = {
  player: PlayerBody;
};

type CargoSlot = {
  itemId?: string;
  quantity: number;
};

type PlayerStateLike = {
  run: { cargo: { slots: CargoSlot[] } };
  save: { profile: { credits: number } };
  returnCargoToShip(): { message: string };
};

type ShipImageLike = Core.ImageNode & {
  image: { frame: { width: number; height: number } };
  scaleX: number;
  scaleY: number;
};

type ShipPromptLike = Core.TextNode & {
  position: { x: number; y: number };
  visible: boolean;
  worldToLocalPosition(position: { x: number; y: number }): { x: number; y: number };
};

const SHIP_DOCK_CENTER_X = -288;
const SHIP_DOCK_CENTER_Y = 240;
const SHIP_DOCK_RADIUS = 120;

export default class ShipScript extends Core.ScriptNode {
  id = 'dynamic.ship';
  name = 'Ship Script';

  worldNodeId = Core.prop.nodeRef(null, { label: 'World Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  shipImageNodeId = Core.prop.nodeRef(null, { label: 'Ship Image' });
  promptNodeId = Core.prop.nodeRef(null, { label: 'Prompt Text' });
  shipWidth = Core.prop.number(548.16, { label: 'Ship Width', min: 1, step: 1 });
  shipHeight = Core.prop.number(336, { label: 'Ship Height', min: 1, step: 1 });
  promptOffsetY = Core.prop.number(57.6, { label: 'Prompt Offset Y', min: 0, step: 1 });
  messageDurationMs = Core.prop.number(2200, { label: 'Message Duration', min: 0, step: 100 });

  private world!: WorldNodeLike;
  private playerState!: PlayerStateLike;
  private shipImage!: ShipImageLike;
  private promptText!: ShipPromptLike;
  private lastMessage = '';
  private lastMessageTimerMs = 0;

  resolve() {
    this.world = this.requireResolvedNode<WorldNodeLike>(this.worldNodeId, 'World');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.shipImage = this.requireResolvedNode<ShipImageLike>(this.shipImageNodeId, 'ShipImage');
    this.promptText = this.requireResolvedNode<ShipPromptLike>(this.promptNodeId, 'ShipPrompt');
    this.layoutShipImage();
    this.resetPrompt();
  }

  update(deltaMs: number) {
    this.layoutShipImage();
    this.lastMessageTimerMs = Math.max(0, this.lastMessageTimerMs - deltaMs);

    const player = this.world.player;
    const atDock = this.isAtDock(player);
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    const message = this.lastMessageTimerMs > 0
      ? this.lastMessage
      : atDock
        ? `${hasCargo ? 'E: Cargo sichern & verkaufen' : 'E: Energie am Schiff auffüllen'} · Credits: ${this.playerState.save.profile.credits}`
        : '';

    this.promptText.setText?.(message);
    this.promptText.position = this.promptText.worldToLocalPosition({ x: player.x, y: player.y - this.promptOffsetY });
    this.promptText.visible = Boolean(message);
  }

  interact() {
    const player = this.world.player;
    if (!this.isAtDock(player)) {
      this.showMessage('Zu weit vom Schiff entfernt');
      return;
    }
    this.showMessage(this.playerState.returnCargoToShip().message);
  }

  resetPrompt() {
    this.lastMessage = '';
    this.lastMessageTimerMs = 0;
    this.promptText?.setText?.('');
    if (this.promptText) this.promptText.visible = false;
  }

  private layoutShipImage() {
    const frame = this.shipImage.image.frame;
    if (frame.width <= 0 || frame.height <= 0) return;
    this.shipImage.scaleX = this.shipWidth / frame.width;
    this.shipImage.scaleY = this.shipHeight / frame.height;
  }

  private isAtDock(player: PlayerBody) {
    return Math.hypot(player.x - SHIP_DOCK_CENTER_X, player.y - SHIP_DOCK_CENTER_Y) <= SHIP_DOCK_RADIUS;
  }

  private showMessage(message: string) {
    this.lastMessage = message;
    this.lastMessageTimerMs = this.messageDurationMs;
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}
