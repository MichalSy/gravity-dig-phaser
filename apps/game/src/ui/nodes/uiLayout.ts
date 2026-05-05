import Phaser from 'phaser';

interface HudTextStyle extends Phaser.Types.GameObjects.Text.TextStyle {
  fontFamily: string;
  fontSize: string;
  color: string;
}

export const TEXT = {
  label: { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: '800', color: '#cbd5e1' } satisfies HudTextStyle,
  value: { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: '800', color: '#f8fafc' } satisfies HudTextStyle,
  small: { fontFamily: 'Arial, sans-serif', fontSize: '11px', fontStyle: '800', color: '#94a3b8' } satisfies HudTextStyle,
};

export const UI_ATLAS = {
  topHud: { x: 34, y: 34, w: 1242, h: 554 },
  hpBar: { x: 112, y: 650, w: 655, h: 95 },
  fuelBar: { x: 124, y: 818, w: 632, h: 81 },
  hpSlot: { x: 385 - 34, y: 200 - 34, w: 655, h: 95 },
  fuelSlot: { x: 395 - 34, y: 406 - 34, w: 637, h: 85 },
  topDisplayWidth: 400,
  bottomHud: { x: 55, y: 1002, w: 1194, h: 442 },
  energyBar: { x: 139, y: 1495, w: 401, h: 108 },
  energySlot: { x: 360 - 55, y: 1194 - 1002, w: 395, h: 125 },
  repeatSlot: { x: 866, y: 607, w: 374, h: 372 },
  extraSlotOrigin: { x: 1160, y: 65 },
  firstSlotCenter: { x: 1010, y: 265 },
  slotContentSize: 128,
  repeatSlotHeight: 372,
  repeatSlotStep: 360,
  bottomDisplayHeight: 180,
} as const;

export const UI_DEPTH = 1000;

export function hudScaleForWidth(width: number): number {
  return Phaser.Math.Clamp(width / 1280, 0.5, 1);
}

export function bottomHudDisplayHeight(width: number): number {
  return UI_ATLAS.bottomDisplayHeight * hudScaleForWidth(width);
}

export function placeAtlasRegion(
  image: Phaser.GameObjects.Image,
  source: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  scale: number,
): void {
  image
    .setPosition(x - source.x * scale, y - source.y * scale)
    .setCrop(source.x, source.y, source.w, source.h)
    .setScale(scale)
    .setVisible(true);
}

export function placeAtlasBar(
  bar: Phaser.GameObjects.Image,
  source: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  width: number,
  height: number,
  pct: number,
): void {
  const safePct = Phaser.Math.Clamp(pct, 0, 1);
  const cropWidth = Math.max(1, Math.round(source.w * safePct));
  const scaleX = width / source.w;
  const scaleY = height / source.h;

  bar
    .setPosition(x - source.x * scaleX, y - source.y * scaleY)
    .setCrop(source.x, source.y, cropWidth, source.h)
    .setScale(scaleX, scaleY)
    .setVisible(safePct > 0);
}
