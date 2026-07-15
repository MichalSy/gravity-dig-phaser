import * as Core from '@gravity-dig/game-core';

type PlayerBody = {
  x: number;
  y: number;
};

type WorldNodeLike = {
  player: PlayerBody;
  launchCargoTransfer(itemId: string, startScreenX: number, startScreenY: number, shipX: number, shipY: number): void;
};

type CargoSlot = {
  itemId?: string;
  quantity: number;
};

type CargoTransferItem = {
  itemId: string;
  slotIndex: number;
  credits: number;
};

type PlayerStateLike = {
  run: { energy: number; cargo: { slots: CargoSlot[] } };
  stats: { maxEnergy: number };
  save: { profile: { credits: number } };
  recoverEnergyAtShip(deltaSeconds: number): void;
  transferNextCargoItemToShip(): CargoTransferItem | undefined;
};

type BottomHudLike = {
  getCargoSlotScreenPosition(index: number): { x: number; y: number } | undefined;
};

type UpgradeDialogLike = {
  open(): void;
  isOpen(): boolean;
};

type GameplayInputLike = {
  getInputMode(): 'desktop' | 'touch' | 'gamepad';
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
const CARGO_TRANSFER_MIN_INTERVAL_MS = 120;
const CARGO_TRANSFER_MAX_INTERVAL_MS = 230;

export default class ShipScript extends Core.ScriptNode {
  id = 'dynamic.ship';
  name = 'Ship Script';

  worldNodeId = Core.prop.nodeRef(null, { label: 'World Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  shipImageNodeId = Core.prop.nodeRef(null, { label: 'Ship Image' });
  promptNodeId = Core.prop.nodeRef(null, { label: 'Prompt Text' });
  bottomHudNodeId = Core.prop.nodeRef(null, { label: 'Bottom HUD Behavior' });
  upgradeDialogNodeId = Core.prop.nodeRef(null, { label: 'Upgrade Dialog Behavior' });
  shipWidth = Core.prop.number(548.16, { label: 'Ship Width', min: 1, step: 1 });
  shipHeight = Core.prop.number(336, { label: 'Ship Height', min: 1, step: 1 });
  promptOffsetY = Core.prop.number(57.6, { label: 'Prompt Offset Y', min: 0, step: 1 });
  messageDurationMs = Core.prop.number(2200, { label: 'Message Duration', min: 0, step: 100 });

  private world!: WorldNodeLike;
  private playerState!: PlayerStateLike;
  private shipImage!: ShipImageLike;
  private promptText!: ShipPromptLike;
  private bottomHud!: BottomHudLike;
  private upgradeDialog!: UpgradeDialogLike;
  private gameplayInput!: GameplayInputLike;
  private lastMessage = '';
  private lastMessageTimerMs = 0;
  private transferTimerMs = 0;

  resolve() {
    this.world = this.requireResolvedNode<WorldNodeLike>(this.worldNodeId, 'World');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.shipImage = this.requireResolvedNode<ShipImageLike>(this.shipImageNodeId, 'ShipImage');
    this.promptText = this.requireResolvedNode<ShipPromptLike>(this.promptNodeId, 'ShipPrompt');
    this.bottomHud = this.requireResolvedNode<BottomHudLike>(this.bottomHudNodeId, 'BottomHudBehavior');
    this.upgradeDialog = this.requireResolvedNode<UpgradeDialogLike>(this.upgradeDialogNodeId, 'UpgradeDialogBehavior');
    this.gameplayInput = this.requireResolvedNode<GameplayInputLike>(null, 'GameplayInput');
    this.layoutShipImage();
    this.resetPrompt();
  }

  update(deltaMs: number) {
    this.layoutShipImage();
    this.lastMessageTimerMs = Math.max(0, this.lastMessageTimerMs - deltaMs);

    const player = this.world.player;
    const atDock = this.isAtDock(player);
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (atDock) {
      this.playerState.recoverEnergyAtShip(deltaMs / 1_000);
      this.updateCargoTransfer(deltaMs);
    } else {
      this.transferTimerMs = 0;
    }

    const upgradePrompt = this.gameplayInput.getInputMode() === 'touch' ? 'UPGRADES VERFÜGBAR' : '[E] UPGRADES';
    const message = this.upgradeDialog.isOpen()
      ? ''
      : this.lastMessageTimerMs > 0
      ? this.lastMessage
      : atDock
        ? `${upgradePrompt}\n${hasCargo ? 'Cargo wird automatisch verladen' : 'Energie wird aufgeladen'} · ${this.playerState.save.profile.credits} C`
        : '';

    this.promptText.setText?.(message);
    this.promptText.position = this.promptText.worldToLocalPosition({ x: player.x, y: player.y - this.promptOffsetY });
    this.promptText.visible = Boolean(message);
  }

  interact() {
    if (!this.isAtDock(this.world.player)) {
      this.showMessage('Zu weit vom Schiff entfernt');
      return;
    }
    this.upgradeDialog.open();
  }

  isPlayerAtDock() {
    return this.isAtDock(this.world.player);
  }

  resetPrompt() {
    this.lastMessage = '';
    this.lastMessageTimerMs = 0;
    this.transferTimerMs = 0;
    this.promptText?.setText?.('');
    if (this.promptText) this.promptText.visible = false;
  }

  private updateCargoTransfer(deltaMs: number) {
    this.transferTimerMs = Math.max(0, this.transferTimerMs - deltaMs);
    if (this.transferTimerMs > 0) return;
    const slotIndex = this.playerState.run.cargo.slots.findIndex((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (slotIndex < 0) return;
    const start = this.bottomHud.getCargoSlotScreenPosition(slotIndex);
    if (!start) return;
    const transfer = this.playerState.transferNextCargoItemToShip();
    if (!transfer) return;
    this.world.launchCargoTransfer(transfer.itemId, start.x, start.y, SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y);
    this.transferTimerMs = CARGO_TRANSFER_MIN_INTERVAL_MS
      + Math.random() * (CARGO_TRANSFER_MAX_INTERVAL_MS - CARGO_TRANSFER_MIN_INTERVAL_MS);
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
