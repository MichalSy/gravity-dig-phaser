import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RESOURCE_ITEMS = ['sand', 'clay', 'gravel', 'stone', 'basalt', 'copper', 'iron', 'gold', 'diamond'] as const;

describe('resource item icon consistency', () => {
  it('loads one canonical item texture per resource for drops, cargo flights, and HUD slots', () => {
    const manifest = JSON.parse(readFileSync('apps/game/public/assets/assets.manifest.json', 'utf8')) as {
      groups: { gameplay: { images: Array<{ key: string }> } };
    };
    const keys = new Set(manifest.groups.gameplay.images.map((image) => image.key));
    const hudSource = readFileSync('apps/game/public/scripts/UI/BottomHudScript.node.ts', 'utf8');
    const dropSource = readFileSync('apps/game/src/game/world/MiningEffects.ts', 'utf8');
    const transferSource = readFileSync('apps/game/src/game/world/CargoTransferEffects.ts', 'utf8');

    for (const itemId of RESOURCE_ITEMS) {
      expect(keys.has(`item-${itemId}`)).toBe(true);
      expect(hudSource).toContain(`${itemId}: 'item-${itemId}'`);
    }
    expect(dropSource).toContain('`item-${itemId}`');
    expect(transferSource).toContain('`item-${itemId}`');
    expect(hudSource).toContain("item.setAssetId(ITEM_ASSETS[cargo.itemId] ?? 'hud-item-rock')");
  });
});
