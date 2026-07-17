import type { UpgradeId } from '../PlayerState/types';

export type SkillTreeBranchId = 'movement' | 'vision' | 'mining' | 'utility';

export const CONSTELLATION_MAP_WIDTH = 2500;
export const CONSTELLATION_MAP_HEIGHT = 1500;
export const CONSTELLATION_ROOT = { x: 1250, y: 750 } as const;

// Uniform 180 px grid inspired by classic orthogonal talent trees. Consecutive
// nodes share either x or y, so every primary connector is perfectly straight.
const POSITIONS: Record<SkillTreeBranchId, ReadonlyArray<Readonly<{ x: number; y: number }>>> = {
  movement: [
    { x: 1070, y: 750 }, { x: 890, y: 750 }, { x: 710, y: 750 }, { x: 530, y: 750 },
    { x: 350, y: 750 }, { x: 170, y: 750 }, { x: 170, y: 570 }, { x: 350, y: 570 },
    { x: 530, y: 570 }, { x: 710, y: 570 }, { x: 890, y: 570 }, { x: 1070, y: 570 },
    { x: 1070, y: 390 },
  ],
  vision: [
    { x: 1250, y: 570 }, { x: 1430, y: 570 }, { x: 1610, y: 570 }, { x: 1790, y: 570 },
    { x: 1970, y: 570 }, { x: 2150, y: 570 }, { x: 2330, y: 570 }, { x: 2330, y: 390 },
    { x: 2150, y: 390 }, { x: 1970, y: 390 }, { x: 1790, y: 390 }, { x: 1610, y: 390 },
    { x: 1430, y: 390 },
  ],
  mining: [
    { x: 1430, y: 750 }, { x: 1610, y: 750 }, { x: 1790, y: 750 }, { x: 1970, y: 750 },
    { x: 2150, y: 750 }, { x: 2330, y: 750 }, { x: 2330, y: 930 }, { x: 2150, y: 930 },
    { x: 1970, y: 930 }, { x: 1790, y: 930 }, { x: 1610, y: 930 }, { x: 1430, y: 930 },
    { x: 1430, y: 1110 },
  ],
  utility: [
    { x: 1250, y: 930 }, { x: 1070, y: 930 }, { x: 890, y: 930 }, { x: 710, y: 930 },
    { x: 530, y: 930 }, { x: 350, y: 930 }, { x: 170, y: 930 }, { x: 170, y: 1110 },
    { x: 350, y: 1110 }, { x: 530, y: 1110 }, { x: 710, y: 1110 }, { x: 890, y: 1110 },
    { x: 1070, y: 1110 },
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
