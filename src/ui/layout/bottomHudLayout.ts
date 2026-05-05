import Phaser from 'phaser';
import type { HudState } from '../HudState';
import { hudScaleForWidth, UI_ATLAS } from '../nodes/uiLayout';

export interface BottomHudLayout {
  atlasScale: number;
  x: number;
  dockY: number;
  energyPct: number;
  energy: { x: number; y: number; w: number; h: number };
  extraSlotCount: number;
  slotScale: number;
  repeatSlotW: number;
  repeatSlotH: number;
  firstExtraX: number;
  extraY: number;
  itemSize: number;
}

export interface BottomHudSlotLayout {
  active: boolean;
  hasItem: boolean;
  isExtraSlot: boolean;
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
  const extraSlotCount = Math.max(0, Math.min(3, state.cargo.visibleSlots - 1));
  const frameW = (UI_ATLAS.bottomHud.w + extraSlotCount * UI_ATLAS.repeatSlotStep) * atlasScale;
  const x = width / 2 - frameW / 2;
  const dockY = height - UI_ATLAS.bottomHud.h * atlasScale - 10 * scale;
  const slotScale = (UI_ATLAS.repeatSlotHeight * atlasScale) / UI_ATLAS.repeatSlot.h;

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
    extraSlotCount,
    slotScale,
    repeatSlotW: UI_ATLAS.repeatSlot.w * slotScale,
    repeatSlotH: UI_ATLAS.repeatSlot.h * slotScale,
    firstExtraX: x + UI_ATLAS.extraSlotOrigin.x * atlasScale,
    extraY: dockY + UI_ATLAS.extraSlotOrigin.y * atlasScale,
    itemSize: UI_ATLAS.slotContentSize * atlasScale,
  };
}

export function computeBottomHudSlotLayout(layout: BottomHudLayout, state: HudState, index: number): BottomHudSlotLayout {
  const active = index < state.cargo.visibleSlots;
  const slot = state.cargo.slots[index];
  const isExtraSlot = index > 0 && index <= layout.extraSlotCount;
  const frameX = layout.firstExtraX + (index - 1) * UI_ATLAS.repeatSlotStep * layout.atlasScale;
  const frameY = layout.extraY;
  const centerX = frameX + layout.repeatSlotW / 2;
  const centerY = frameY + layout.repeatSlotH / 2;
  const itemX = index === 0 ? layout.x + UI_ATLAS.firstSlotCenter.x * layout.atlasScale : centerX;
  const itemY = index === 0 ? layout.dockY + UI_ATLAS.firstSlotCenter.y * layout.atlasScale : centerY;

  return {
    active,
    hasItem: Boolean(active && slot?.itemId && slot.quantity > 0),
    isExtraSlot,
    frameDepth: 10.8 + (layout.extraSlotCount - index) * 0.01,
    frameX,
    frameY,
    itemX,
    itemY,
    itemSize: layout.itemSize,
    labelX: itemX + layout.itemSize / 2 - 4 * layout.atlasScale,
    labelY: itemY + layout.itemSize / 2 - 4 * layout.atlasScale,
    labelScale: layout.atlasScale * 4.05,
  };
}
