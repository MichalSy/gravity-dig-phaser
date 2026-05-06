import Phaser from 'phaser';
import type { HudState } from '../HudState';
import { hudScaleForWidth, UI_ATLAS } from '../nodes/uiLayout';

export interface BottomHudLayout {
  atlasScale: number;
  x: number;
  dockY: number;
  energyPct: number;
  energy: { x: number; y: number; w: number; h: number };
  visibleSlotCount: number;
  slotScale: number;
  slotW: number;
  slotH: number;
  firstSlotX: number;
  slotY: number;
  totalWidth: number;
  itemSize: number;
}

export interface BottomHudSlotLayout {
  active: boolean;
  hasItem: boolean;
  isFirstSlot: boolean;
  frameDepth: number;
  frameX: number;
  frameY: number;
  itemX: number;
  itemY: number;
  itemSize: number;
  labelX: number;
  labelY: number;
  labelScale: number;
}

export function computeBottomHudLayout(width: number, height: number, state: HudState): BottomHudLayout {
  const scale = hudScaleForWidth(width);
  const atlasScale = (UI_ATLAS.bottomDisplayHeight * scale) / UI_ATLAS.bottomHud.h;
  const maxSlotCount = state.cargo.slots.length;
  const visibleSlotCount = Math.max(0, Math.min(maxSlotCount, state.cargo.visibleSlots));
  const slotScale = atlasScale;
  const slotW = UI_ATLAS.inventoryFirstSlot.w * slotScale;
  const slotH = UI_ATLAS.inventoryFirstSlot.h * slotScale;
  const totalWidth = Math.max(
    UI_ATLAS.bottomHud.w * atlasScale,
    UI_ATLAS.inventorySlotOrigin.x * atlasScale + (Math.max(visibleSlotCount, 1) - 1) * UI_ATLAS.inventorySlotStep * atlasScale + slotW,
  );
  const x = width / 2 - totalWidth / 2;
  const dockY = height - UI_ATLAS.bottomHud.h * atlasScale - 10 * scale;

  return {
    atlasScale,
    x,
    dockY,
    energyPct: Phaser.Math.Clamp(state.energy.current / state.energy.max, 0, 1),
    energy: {
      x: x + UI_ATLAS.energySlot.x * atlasScale,
      y: dockY + UI_ATLAS.energySlot.y * atlasScale,
      w: UI_ATLAS.energySlot.w * atlasScale,
      h: UI_ATLAS.energySlot.h * atlasScale,
    },
    visibleSlotCount,
    slotScale,
    slotW,
    slotH,
    firstSlotX: x + UI_ATLAS.inventorySlotOrigin.x * atlasScale,
    slotY: dockY + UI_ATLAS.inventorySlotOrigin.y * atlasScale,
    totalWidth,
    itemSize: UI_ATLAS.slotContentSize * atlasScale,
  };
}

export function computeBottomHudSlotLayout(layout: BottomHudLayout, state: HudState, index: number): BottomHudSlotLayout {
  const active = index < layout.visibleSlotCount;
  const slot = state.cargo.slots[index];
  const frameX = layout.firstSlotX + index * UI_ATLAS.inventorySlotStep * layout.atlasScale;
  const frameY = layout.slotY;
  const centerX = frameX + layout.slotW / 2;
  const centerY = frameY + layout.slotH / 2;

  return {
    active,
    hasItem: Boolean(active && slot?.itemId && slot.quantity > 0),
    isFirstSlot: index === 0,
    frameDepth: 10.8 + (layout.visibleSlotCount - index) * 0.01,
    frameX,
    frameY,
    itemX: centerX,
    itemY: centerY,
    itemSize: layout.itemSize,
    labelX: centerX + layout.itemSize / 2 - 4 * layout.atlasScale,
    labelY: centerY + layout.itemSize / 2 - 4 * layout.atlasScale,
    labelScale: layout.atlasScale * 4.05,
  };
}
