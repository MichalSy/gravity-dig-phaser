import type { UpgradeId } from '../PlayerState/types';

export type SkillTreeBranchId = 'movement' | 'vision' | 'mining' | 'utility';

export const CONSTELLATION_MAP_WIDTH = 2500;
export const CONSTELLATION_MAP_HEIGHT = 1500;
export const CONSTELLATION_ROOT = { x: 1250, y: 750 } as const;

const POSITIONS: Record<SkillTreeBranchId, ReadonlyArray<Readonly<{ x: number; y: number }>>> = {
  movement: [
    { x: 1080, y: 720 }, { x: 840, y: 650 }, { x: 650, y: 760 }, { x: 900, y: 470 },
    { x: 620, y: 460 }, { x: 390, y: 550 }, { x: 330, y: 330 }, { x: 580, y: 250 },
    { x: 830, y: 260 }, { x: 1030, y: 360 }, { x: 1130, y: 180 }, { x: 1380, y: 250 },
    { x: 1580, y: 170 },
  ],
  vision: [
    { x: 1260, y: 560 }, { x: 1380, y: 420 }, { x: 1650, y: 400 }, { x: 1750, y: 530 },
    { x: 1940, y: 410 }, { x: 2110, y: 560 }, { x: 2200, y: 350 }, { x: 2350, y: 480 },
    { x: 2310, y: 720 }, { x: 2100, y: 720 }, { x: 1980, y: 850 }, { x: 2210, y: 940 },
    { x: 2350, y: 1090 },
  ],
  mining: [
    { x: 1400, y: 760 }, { x: 1480, y: 900 }, { x: 1710, y: 790 }, { x: 1900, y: 990 },
    { x: 1620, y: 1010 }, { x: 1790, y: 1140 }, { x: 2050, y: 1140 }, { x: 2260, y: 1240 },
    { x: 1960, y: 1350 }, { x: 1710, y: 1330 }, { x: 1450, y: 1200 }, { x: 1230, y: 1330 },
    { x: 980, y: 1310 },
  ],
  utility: [
    { x: 1130, y: 900 }, { x: 900, y: 980 }, { x: 600, y: 880 }, { x: 530, y: 1030 },
    { x: 730, y: 1160 }, { x: 500, y: 1280 }, { x: 260, y: 1200 }, { x: 260, y: 970 },
    { x: 390, y: 820 }, { x: 520, y: 680 }, { x: 300, y: 650 }, { x: 260, y: 440 },
    { x: 730, y: 1370 },
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
