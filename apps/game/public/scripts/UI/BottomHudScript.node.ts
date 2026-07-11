import * as Core from '@gravity-dig/game-core';

type CargoSlot = {
  itemId?: ItemId;
  quantity: number;
};

type PlayerStateLike = {
  stats: { cargoSlots: number; maxEnergy: number };
  getActiveRun(): { energy: number; cargo: { slots: CargoSlot[] } } | undefined;
};

type HudRoot = Core.GameNode & {
  position: { x: number; y: number };
  scaleX: number;
  scaleY: number;
  addChild<T extends Core.GameNode>(child: T): T;
  removeChild(child: Core.GameNode): void;
};

type SlotNode = Core.GameNode & {
  children: readonly Core.GameNode[];
};

type HudImageNode = Core.ImageNode & {
  image: {
    clearTint(): unknown;
    setTint(color: number): unknown;
    setCrop(x: number, y: number, width: number, height: number): unknown;
    setVisible(visible: boolean): unknown;
  };
  visible: boolean;
};

type HudTextNode = Core.TextNode & {
  resolution: number;
  setText?(text: string): unknown;
  text: string;
};

type ItemId = keyof typeof ITEM_SHORT_LABELS;

const SLOT_PREFAB = 'prefabs/inventory-slot.prefab.json';
const SLOT_ORIGIN_X = 362.93;
const SLOT_STEP_X = 150.698;
const SLOT_Y = 21.767;
const BOTTOM_HUD_WIDTH = 960 * 0.42;
const SLOT_WIDTH = 374 * 0.418605;
const ENERGY_FRAME_WIDTH = 300;
const FIRST_SLOT_ASSET = 'hud-hp-fuel-atlas#inventoryFirstSlot';

export default class BottomHudScript extends Core.ScriptNode {
  id = 'dynamic.bottom-hud';
  name = 'Bottom HUD Script';

  hudRootNodeId = Core.prop.nodeRef(null, { label: 'HUD Root' });
  energyFillNodeId = Core.prop.nodeRef(null, { label: 'Energy Fill' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  slotPrefab = Core.prop.string(SLOT_PREFAB, { label: 'Slot Prefab' });
  slotOriginX = Core.prop.number(SLOT_ORIGIN_X, { label: 'Slot Origin X', step: 0.001 });
  slotStepX = Core.prop.number(SLOT_STEP_X, { label: 'Slot Step X', step: 0.001 });
  slotY = Core.prop.number(SLOT_Y, { label: 'Slot Y', step: 0.001 });

  private hudRoot!: HudRoot;
  private energyFill!: HudImageNode;
  private playerState!: PlayerStateLike;
  private readonly slots: SlotNode[] = [];
  private readonly slotItems: HudImageNode[] = [];
  private readonly slotLabels: HudTextNode[] = [];

  resolve() {
    this.hudRoot = this.requireResolvedNode<HudRoot>(this.hudRootNodeId, 'UI.BottomHud');
    this.energyFill = this.requireResolvedNode<HudImageNode>(this.energyFillNodeId, 'UI.EnergyFill');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.syncSlotCount();
    this.updateHud();
  }

  update() {
    this.syncSlotCount();
    this.updateHud();
  }

  destroy() {
    while (this.slots.length > 0) this.removeLastSlot();
  }

  private syncSlotCount() {
    const targetCount = Math.max(0, Math.floor(this.playerState.stats.cargoSlots));

    while (this.slots.length < targetCount) this.addSlot(this.slots.length);
    while (this.slots.length > targetCount) this.removeLastSlot();

    const totalWidth = Math.max(BOTTOM_HUD_WIDTH, this.slotOriginX + Math.max(targetCount - 1, 0) * this.slotStepX + SLOT_WIDTH);
    const viewportScale = clamp(this.getViewportSize().width / 1280, 0.5, 1);
    this.hudRoot.scaleX = viewportScale;
    this.hudRoot.scaleY = viewportScale;
    this.hudRoot.position = { x: -(totalWidth * viewportScale) / 2, y: 0 };
  }

  private addSlot(index: number) {
    const slot = this.instantiatePrefab<SlotNode>(this.slotPrefab, {
      name: `UI.Slot${index}`,
      props: {
        position: { x: this.slotOriginX + index * this.slotStepX, y: this.slotY },
        ...(index === 0 ? { assetId: FIRST_SLOT_ASSET } : {}),
      },
    });
    this.hudRoot.addChild(slot);

    const item = this.requireChildByName<HudImageNode>(slot, 'Item');
    const label = this.requireChildByName<HudTextNode>(slot, 'Label');
    label.resolution = Math.max(2, window.devicePixelRatio || 1);

    this.slots.push(slot);
    this.slotItems.push(item);
    this.slotLabels.push(label);
  }

  private removeLastSlot() {
    const slot = this.slots.pop();
    this.slotItems.pop();
    this.slotLabels.pop();
    if (slot) this.hudRoot.removeChild(slot);
  }

  private updateHud() {
    const run = this.playerState.getActiveRun();
    const maxEnergy = Math.max(1, this.playerState.stats.maxEnergy);
    const energyPct = clamp((run?.energy ?? maxEnergy) / maxEnergy, 0, 1);
    const cropWidth = Math.max(1, Math.round(ENERGY_FRAME_WIDTH * energyPct));
    this.energyFill.visible = energyPct > 0;
    this.energyFill.image.setCrop(0, 0, cropWidth, 84);
    this.energyFill.image.setVisible(energyPct > 0);

    for (let index = 0; index < this.slots.length; index += 1) {
      const cargo = run?.cargo.slots[index];
      const item = this.slotItems[index];
      const label = this.slotLabels[index];
      if (cargo?.itemId) item.image.setTint(ITEM_TINTS[cargo.itemId]);
      else item.image.clearTint();
      const text = cargo?.itemId ? `${ITEM_SHORT_LABELS[cargo.itemId]} x${cargo.quantity}` : '';
      if (label.setText) label.setText(text);
      else label.text = text;
    }
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }

  private requireChildByName<T>(root: SlotNode, name: string): T {
    const child = root.children.find((node) => node.debugName() === name);
    if (!child) throw new Error(`Inventory slot is missing child '${name}'`);
    return child as T;
  }
}

const ITEM_SHORT_LABELS = {
  dirt: 'Er', sand: 'Sa', clay: 'Le', gravel: 'Ki', stone: 'St', basalt: 'Ba',
  copper: 'Cu', iron: 'Fe', gold: 'Au', diamond: 'Di',
  energy_cell: 'EZ', repair_kit: 'RK', teleport_bracelet: 'TP',
} as const;

const ITEM_TINTS: Record<ItemId, number> = {
  dirt: 0x9a6a45, sand: 0xd8bd78, clay: 0xb96855, gravel: 0x8f8b83, stone: 0x9ca3af,
  basalt: 0x4b5563, copper: 0xd97745, iron: 0x94a3b8, gold: 0xfacc15, diamond: 0x67e8f9,
  energy_cell: 0x84cc16, repair_kit: 0xef4444, teleport_bracelet: 0xc084fc,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
