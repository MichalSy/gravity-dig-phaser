import Phaser from 'phaser';
import type { HudState } from '../HudState';
import { hudScaleForWidth, UI_ATLAS } from '../nodes/uiLayout';

export interface BottomHudLayout {
  atlasScale: number;
  x: number;
  dockY: number;
  energyPct: number;
  energy: { x: number; y: number; w: number; h: number };
  totalWidth: number;
}

export function computeBottomHudLayout(width: number, height: number, state: HudState): BottomHudLayout {
  const scale = hudScaleForWidth(width);
  const atlasScale = (UI_ATLAS.bottomDisplayHeight * scale) / UI_ATLAS.bottomHud.h;
  const maxSlotCount = state.cargo.slots.length;
  const visibleSlotCount = Math.max(0, Math.min(maxSlotCount, state.cargo.visibleSlots));
  const slotScale = atlasScale;
  const slotW = UI_ATLAS.inventoryFirstSlot.w * slotScale;
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
    totalWidth,
  };
}
