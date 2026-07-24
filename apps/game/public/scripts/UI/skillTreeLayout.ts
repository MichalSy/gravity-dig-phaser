import type { UpgradeId } from '../PlayerState/types';

export type SkillTreeBranchId = 'movement' | 'vision' | 'mining' | 'utility';

export const CONSTELLATION_MAP_WIDTH = 2680;
export const CONSTELLATION_MAP_HEIGHT = 1980;
export const CONSTELLATION_ROOT = { x: 1340, y: 990 } as const;

const GRID_STEP = 180;
const TOP_ROWS = [450, 630, 810] as const;
const BOTTOM_ROWS = [1170, 1350, 1530] as const;

function branchGrid(side: 'left' | 'right', rows: readonly [number, number, number]): ReadonlyArray<Readonly<{ x: number; y: number }>> {
  const direction = side === 'left' ? -1 : 1;
  const column = (depth: number) => CONSTELLATION_ROOT.x + direction * GRID_STEP * depth;
  const middle = rows[1];
  return [
    { x: column(1), y: middle },
    { x: column(2), y: rows[0] },
    { x: column(2), y: rows[1] },
    { x: column(2), y: rows[2] },
    { x: column(3), y: rows[0] },
    { x: column(3), y: rows[1] },
    { x: column(3), y: rows[2] },
    { x: column(4), y: rows[0] },
    { x: column(4), y: rows[1] },
    { x: column(4), y: rows[2] },
    { x: column(5), y: rows[0] },
    { x: column(5), y: rows[1] },
    { x: column(5), y: rows[2] },
  ];
}

const POSITIONS: Record<SkillTreeBranchId, ReadonlyArray<Readonly<{ x: number; y: number }>>> = {
  movement: branchGrid('left', TOP_ROWS),
  vision: branchGrid('right', TOP_ROWS),
  mining: branchGrid('right', BOTTOM_ROWS),
  utility: branchGrid('left', BOTTOM_ROWS),
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
