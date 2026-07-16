import type { UpgradeId } from '../PlayerState/types';

export type SkillTreeBranchId = 'movement' | 'vision' | 'mining' | 'utility';

export const CONSTELLATION_MAP_WIDTH = 2500;
export const CONSTELLATION_MAP_HEIGHT = 1500;
export const CONSTELLATION_ROOT = { x: 1250, y: 750 } as const;

// Four readable research lanes wrap around The Bucket. Each lane follows one
// continuous ribbon from the core to its outer capstone instead of scattering
// tiers across the whole map.
const POSITIONS: Record<SkillTreeBranchId, ReadonlyArray<Readonly<{ x: number; y: number }>>> = {
  movement: [
    { x: 1080, y: 660 }, { x: 850, y: 580 }, { x: 600, y: 520 }, { x: 360, y: 450 },
    { x: 180, y: 340 }, { x: 360, y: 230 }, { x: 600, y: 220 }, { x: 820, y: 250 },
    { x: 1010, y: 310 }, { x: 1080, y: 160 }, { x: 850, y: 100 }, { x: 600, y: 100 },
    { x: 350, y: 110 },
  ],
  vision: [
    { x: 1420, y: 660 }, { x: 1650, y: 580 }, { x: 1950, y: 510 }, { x: 2230, y: 430 },
    { x: 2360, y: 320 }, { x: 2190, y: 220 }, { x: 1950, y: 200 }, { x: 1720, y: 230 },
    { x: 1510, y: 300 }, { x: 1450, y: 150 }, { x: 1680, y: 90 }, { x: 1930, y: 90 },
    { x: 2180, y: 100 },
  ],
  mining: [
    { x: 1420, y: 840 }, { x: 1640, y: 900 }, { x: 1940, y: 980 }, { x: 2240, y: 1050 },
    { x: 2360, y: 1170 }, { x: 2190, y: 1280 }, { x: 1950, y: 1300 }, { x: 1720, y: 1270 },
    { x: 1510, y: 1200 }, { x: 1440, y: 1350 }, { x: 1680, y: 1430 }, { x: 1930, y: 1430 },
    { x: 2180, y: 1400 },
  ],
  utility: [
    { x: 1080, y: 840 }, { x: 820, y: 920 }, { x: 560, y: 1000 }, { x: 300, y: 1080 },
    { x: 160, y: 1200 }, { x: 340, y: 1320 }, { x: 580, y: 1350 }, { x: 820, y: 1320 },
    { x: 1020, y: 1250 }, { x: 1080, y: 1390 }, { x: 850, y: 1450 }, { x: 600, y: 1450 },
    { x: 350, y: 1380 },
  ],
};

const MILESTONES = new Set<UpgradeId>([
  'micro_jetpack',
  'xray_potato',
  'storm_subscription',
  'pocket_wormhole',
  'reality_premium',
]);

const REPEATABLE_RANKS: Partial<Record<UpgradeId, number>> = {
  moonwalk_insurance: 1,
  turbo_snail: 2,
  chrono_shoelaces: 3,
  wide_visor: 1,
  spectrum_monocle: 2,
  fog_coupon: 3,
  laser_focus: 1,
  arc_apprentice: 2,
  ore_blender: 3,
  cargo_tetris: 1,
  cargo_origami: 2,
  portable_shipyard: 3,
};

export function getConstellationNodePosition(branch: SkillTreeBranchId, tier: number): { x: number; y: number } {
  const position = POSITIONS[branch][tier - 1];
  if (!position) throw new Error(`Invalid research-map tier: ${branch} ${tier}`);
  return { x: position.x, y: position.y };
}

export function getConstellationRegionPosition(branch: SkillTreeBranchId): { x: number; y: number } {
  const positions = POSITIONS[branch];
  return {
    x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
    y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
  };
}

export function isSkillTreeMilestone(upgradeId: UpgradeId): boolean {
  return MILESTONES.has(upgradeId);
}

export function getSkillTreeRank(upgradeId: UpgradeId): number | undefined {
  return REPEATABLE_RANKS[upgradeId];
}

export function getSkillIconKey(upgradeId: UpgradeId): string {
  return `research-skill-${upgradeId}`;
}
