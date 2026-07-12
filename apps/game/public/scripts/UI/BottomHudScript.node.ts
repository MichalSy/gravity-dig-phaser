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

const SLOT_PREFAB_ID = 'fc891d95-3efb-567e-81d1-7fb0a446ebf5';
const SLOT_ORIGIN_X = 362.93;
const SLOT_STEP_X = 150.698;
const SLOT_Y = 21.767;
const FIRST_SLOT_ASSET = 'hud-hp-fuel-atlas#inventoryFirstSlot';

export default class BottomHudScript extends Core.ScriptNode {
  id = 'dynamic.bottom-hud';
  name = 'Bottom HUD Script';

  hudRootNodeId = Core.prop.nodeRef(null, { label: 'HUD Root' });
  energyFillNodeId = Core.prop.nodeRef(null, { label: 'Energy Fill' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State' });
  slotPrefabId = Core.prop.string(SLOT_PREFAB_ID, { label: 'Slot Prefab ID' });
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

  editorUpdate() {
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

  }

  private addSlot(index: number) {
    const slot = this.instantiatePrefab<SlotNode>(this.slotPrefabId, {
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
    this.energyFill.setHorizontalFill(energyPct);

    for (let index = 0; index < this.slots.length; index += 1) {
      const cargo = run?.cargo.slots[index];
      const item = this.slotItems[index];
      const label = this.slotLabels[index];
      const hasItem = Boolean(cargo?.itemId && cargo.quantity > 0);
      item.visible = hasItem;
      item.image.setVisible(hasItem);
      if (cargo?.itemId && cargo.quantity > 0) item.image.setTint(ITEM_TINTS[cargo.itemId]);
      else item.image.clearTint();
      const text = cargo?.itemId && cargo.quantity > 0 ? `${ITEM_SHORT_LABELS[cargo.itemId]} x${cargo.quantity}` : '';
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
