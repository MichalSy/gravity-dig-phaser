import { SHIP_CEILING_Y, SHIP_FLOOR_Y, SHIP_TUNNEL_LEFT_X, SHIP_TUNNEL_TIP_X } from './levelConstants';
import { clamp } from './math';
import { hashSeed, mulberry32 } from './random';
import type { PlanetConfig, WorldContext } from './types';

export interface WorldContextResult {
  context: WorldContext;
  random: () => number;
}

export function createWorldContext(config: PlanetConfig, difficultyLevel: number, customSeed: number | string): WorldContextResult {
  const planet = config.planet;
  const difficulty = clamp(Math.round(difficultyLevel), 1, 10);
  const seed = hashSeed(customSeed);
  const random = mulberry32(seed);
  const scaled = applyDifficultyScaling(config, difficulty);
  const radius = Math.round(scaled.core_radius ?? planet.core.radius);

  return {
    random,
    context: {
      config,
      difficulty,
      seed,
      scaled,
      width: planet.base_config.level_width,
      heightUp: planet.base_config.level_height_up,
      heightDown: planet.base_config.level_height_down,
      tileSize: planet.base_config.block_size,
      core: { ...calculateCore(config, scaled, random), radius },
      spawn: { x: -2, y: 2 },
      // World-space tile rect for the drilled-in ship visual plus clearance.
      spaceshipRect: { x: SHIP_TUNNEL_LEFT_X, y: SHIP_CEILING_Y, w: SHIP_TUNNEL_TIP_X - SHIP_TUNNEL_LEFT_X + 1, h: SHIP_FLOOR_Y - SHIP_CEILING_Y + 1 },
    },
  };
}

function applyDifficultyScaling(config: PlanetConfig, difficulty: number): Record<string, number> {
  const scaled: Record<string, number> = {};
  const normalized = (difficulty - 1) / 9;

  for (const [key, params] of Object.entries(config.planet.difficulty_scaling ?? {})) {
    let factor = normalized;
    if (params.formula === 'exponential') factor = normalized ** 2;
    if (params.formula === 'logarithmic') factor = Math.log(difficulty) / Math.log(10);

    scaled[key] =
      params.mode === 'decrease'
        ? params.max - (params.max - params.min) * factor
        : params.min + (params.max - params.min) * factor;
  }

  scaled.core_radius = config.planet.core.radius;
  return scaled;
}

function calculateCore(config: PlanetConfig, scaled: Record<string, number>, random: () => number): { x: number; y: number } {
  const coreDistance = scaled.core_distance ?? config.planet.core.distance.max;
  const [minY, maxY] = config.planet.core.y_range;
  return {
    x: Math.round(coreDistance),
    y: Math.round(minY + random() * (maxY - minY)),
  };
}
