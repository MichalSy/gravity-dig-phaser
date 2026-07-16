export type SkillTreeBranchId = 'movement' | 'vision' | 'mining' | 'utility';

export const CONSTELLATION_MAP_WIDTH = 2600;
export const CONSTELLATION_MAP_HEIGHT = 1800;
export const CONSTELLATION_ROOT = {
  x: CONSTELLATION_MAP_WIDTH / 2,
  y: CONSTELLATION_MAP_HEIGHT / 2,
} as const;

export const CONSTELLATION_BRANCH_ANGLES: Record<SkillTreeBranchId, number> = {
  movement: -2.55,
  vision: -0.95,
  mining: 0.52,
  utility: 2.15,
};

const TIER_SIDE_OFFSETS = [0, -68, 72, -108, 24, 116, -62, 128, -118, 58, 4, -84, 88] as const;

export function getConstellationNodePosition(branch: SkillTreeBranchId, tier: number): { x: number; y: number } {
  if (tier < 1 || tier > TIER_SIDE_OFFSETS.length) throw new Error(`Invalid constellation tier: ${tier}`);
  const angle = CONSTELLATION_BRANCH_ANGLES[branch];
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const radius = 180 + tier * 56;
  const sideOffset = TIER_SIDE_OFFSETS[tier - 1];
  const clusterOffset = tier % 3 === 0 ? 0 : Math.sin(tier * 1.7) * 24;
  return {
    x: CONSTELLATION_ROOT.x + directionX * radius + perpendicularX * (sideOffset + clusterOffset),
    y: CONSTELLATION_ROOT.y + directionY * radius + perpendicularY * (sideOffset + clusterOffset),
  };
}

export function getConstellationRegionPosition(branch: SkillTreeBranchId): { x: number; y: number } {
  const angle = CONSTELLATION_BRANCH_ANGLES[branch];
  const radius = 780;
  return {
    x: CONSTELLATION_ROOT.x + Math.cos(angle) * radius,
    y: CONSTELLATION_ROOT.y + Math.sin(angle) * radius,
  };
}
