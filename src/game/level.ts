export type TileType =
  | 'air'
  | 'dirt'
  | 'stone'
  | 'copper'
  | 'iron'
  | 'gold'
  | 'diamond'
  | 'bedrock'
  | 'sand'
  | 'clay'
  | 'gravel'
  | 'basalt';

export interface PlanetConfig {
  planet: {
    id: string;
    name: string;
    description?: string;
    base_config: {
      level_width: number;
      level_height_up: number;
      level_height_down: number;
      block_size: number;
    };
    core: {
      distance: { min: number; max: number };
      y_range: [number, number];
      radius: number;
    };
    spaceship?: {
      x_range: [number, number];
      y_range: [number, number];
      facing: string;
      clearance_width: number;
    };
    difficulty_scaling: Record<
      string,
      {
        mode: 'increase' | 'decrease';
        min: number;
        max: number;
        formula: 'linear' | 'exponential' | 'logarithmic';
      }
    >;
    resources: Record<string, Record<string, { chance: number; hardness: number }>>;
  };
}

export interface TileCell {
  x: number;
  y: number;
  type: TileType;
  health: number;
  maxHealth: number;
  boundary: boolean;
}

export interface LevelData {
  planetId: string;
  planetName: string;
  difficulty: number;
  seed: number;
  tileSize: number;
  width: number;
  heightUp: number;
  heightDown: number;
  core: { x: number; y: number; radius: number };
  spawn: { x: number; y: number };
  spaceshipRect: { x: number; y: number; w: number; h: number };
  tiles: Map<string, TileCell>;
  resources: Map<string, TileType>;
  generationTimeMs: number;
}

export const TILE_HEALTH: Record<TileType, number> = {
  air: 0,
  dirt: 20,
  sand: 15,
  clay: 25,
  gravel: 40,
  stone: 50,
  basalt: 55,
  copper: 60,
  iron: 70,
  gold: 80,
  diamond: 110,
  bedrock: 9999,
};

export const TILE_ATLAS_COORDS: Record<Exclude<TileType, 'air'>, [number, number]> = {
  basalt: [2, 0],
  bedrock: [3, 0],
  clay: [5, 0],
  copper: [6, 0],
  diamond: [0, 1],
  dirt: [1, 1],
  gold: [6, 1],
  gravel: [0, 2],
  iron: [2, 2],
  sand: [4, 4],
  stone: [6, 5],
};

const RESOURCE_TYPES = new Set<TileType>(['copper', 'iron', 'gold', 'diamond']);
const WORLD_MIN_X = -10;
const LEFT_BOUNDARY_THICKNESS = 2;
const SHIP_TUNNEL_LEFT_X = WORLD_MIN_X;
const SHIP_TUNNEL_TIP_X = 0;
const SHIP_TUNNEL_TOP_Y = -1;
const SHIP_TUNNEL_BOTTOM_Y = 2;
const SHIP_CEILING_Y = -2;
const SHIP_FLOOR_Y = 3;

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface WorldContext {
  config: PlanetConfig;
  difficulty: number;
  seed: number;
  scaled: Record<string, number>;
  width: number;
  heightUp: number;
  heightDown: number;
  tileSize: number;
  core: { x: number; y: number; radius: number };
  spawn: { x: number; y: number };
  spaceshipRect: { x: number; y: number; w: number; h: number };
}

interface ResourceProfile {
  type: Extract<TileType, 'copper' | 'iron' | 'gold' | 'diamond'>;
  minCoreRatio: number;
  maxCoreRatio: number;
  minAbsY: number;
  baseChance: number;
  veinMin: number;
  veinMax: number;
}

const RESOURCE_PROFILES: ResourceProfile[] = [
  { type: 'copper', minCoreRatio: 0.52, maxCoreRatio: Infinity, minAbsY: 0, baseChance: 0.018, veinMin: 2, veinMax: 5 },
  { type: 'iron', minCoreRatio: 0.38, maxCoreRatio: Infinity, minAbsY: 8, baseChance: 0.016, veinMin: 2, veinMax: 5 },
  { type: 'gold', minCoreRatio: 0.18, maxCoreRatio: 0.65, minAbsY: 16, baseChance: 0.011, veinMin: 1, veinMax: 4 },
  { type: 'diamond', minCoreRatio: 0.05, maxCoreRatio: 0.38, minAbsY: 26, baseChance: 0.006, veinMin: 1, veinMax: 3 },
];

type LevelReplacer = (context: WorldContext, tiles: Map<string, TileCell>) => void;

export class GravityDigLevelGenerator {
  private random: () => number = Math.random;

  generate(config: PlanetConfig, difficultyLevel = 1, customSeed: number | string = 'gravity-dig-phaser'): LevelData {
    const start = performance.now();
    const context = this.createWorldContext(config, difficultyLevel, customSeed);
    const tiles = this.generateBaseTerrain(context);

    this.spawnResources(context, tiles);
    this.applyReplacers(context, tiles, [
      this.applyStartAndShipChamber,
      this.applyCore,
      this.applyWorldBoundaries,
    ]);

    const resources = this.rebuildResources(tiles);

    return {
      planetId: config.planet.id,
      planetName: config.planet.name,
      difficulty: context.difficulty,
      seed: context.seed,
      tileSize: context.tileSize,
      width: context.width,
      heightUp: context.heightUp,
      heightDown: context.heightDown,
      core: context.core,
      spawn: context.spawn,
      spaceshipRect: context.spaceshipRect,
      tiles,
      resources,
      generationTimeMs: Math.round(performance.now() - start),
    };
  }

  key(x: number, y: number): string {
    return tileKey(x, y);
  }

  private createWorldContext(config: PlanetConfig, difficultyLevel: number, customSeed: number | string): WorldContext {
    const planet = config.planet;
    const difficulty = clamp(Math.round(difficultyLevel), 1, 10);
    const seed = hashSeed(customSeed);
    this.random = mulberry32(seed);

    const scaled = this.applyDifficultyScaling(config, difficulty);
    const radius = Math.round(scaled.core_radius ?? planet.core.radius);

    return {
      config,
      difficulty,
      seed,
      scaled,
      width: planet.base_config.level_width,
      heightUp: planet.base_config.level_height_up,
      heightDown: planet.base_config.level_height_down,
      tileSize: planet.base_config.block_size,
      core: { ...this.calculateCore(config, scaled), radius },
      spawn: { x: -2, y: 2 },
      // World-space tile rect for the drilled-in ship visual plus clearance.
      spaceshipRect: { x: SHIP_TUNNEL_LEFT_X, y: SHIP_CEILING_Y, w: SHIP_TUNNEL_TIP_X - SHIP_TUNNEL_LEFT_X + 1, h: SHIP_FLOOR_Y - SHIP_CEILING_Y + 1 },
    };
  }

  private applyDifficultyScaling(config: PlanetConfig, difficulty: number): Record<string, number> {
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

  private calculateCore(config: PlanetConfig, scaled: Record<string, number>): { x: number; y: number } {
    const coreDistance = scaled.core_distance ?? config.planet.core.distance.max;
    const [minY, maxY] = config.planet.core.y_range;
    return {
      x: Math.round(coreDistance),
      y: Math.round(minY + this.random() * (maxY - minY)),
    };
  }

  private generateBaseTerrain(context: WorldContext): Map<string, TileCell> {
    const tiles = new Map<string, TileCell>();

    for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
      for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
        const type = this.calculateBaseTile(context, x, y);
        this.setTile(tiles, x, y, type, false);
      }
    }

    return tiles;
  }

  private calculateBaseTile(context: WorldContext, x: number, y: number): TileType {
    const distanceRatio = this.distanceToCore(context, x, y) / this.referenceCoreDistance(context);
    const absY = Math.abs(y);
    const roll = this.random();

    if (distanceRatio < 0.2) {
      if (roll < 0.62) return 'basalt';
      if (roll < 0.93) return 'stone';
      return absY < 24 ? 'gravel' : 'basalt';
    }

    if (distanceRatio < 0.4) {
      if (roll < 0.46) return 'stone';
      if (roll < 0.76) return 'basalt';
      if (roll < 0.88) return 'gravel';
      return 'dirt';
    }

    if (distanceRatio < 0.7) {
      if (roll < 0.45) return 'stone';
      if (roll < 0.65) return 'dirt';
      if (roll < 0.78) return 'gravel';
      if (roll < 0.9) return absY < 22 ? 'clay' : 'stone';
      return 'sand';
    }

    if (roll < 0.52) return 'dirt';
    if (roll < 0.68) return 'sand';
    if (roll < 0.8) return 'clay';
    if (roll < 0.9) return 'gravel';
    return 'stone';
  }

  private spawnResources(context: WorldContext, tiles: Map<string, TileCell>): void {
    const richness = context.scaled.resource_richness ?? 1;

    for (const cell of tiles.values()) {
      if (!this.canReplaceWithResource(cell)) continue;
      if (this.distanceToStart(context, cell.x, cell.y) < 16) continue;

      const profile = this.pickResourceForCell(context, cell, richness);
      if (!profile) continue;

      const veinSize = this.randomInt(profile.veinMin, profile.veinMax);
      this.spawnVein(cell.x, cell.y, profile.type, veinSize, context, tiles);
    }
  }

  private pickResourceForCell(context: WorldContext, cell: TileCell, richness: number): ResourceProfile | undefined {
    const coreDistance = this.distanceToCore(context, cell.x, cell.y);
    const coreRatio = coreDistance / this.referenceCoreDistance(context);
    const absY = Math.abs(cell.y);
    const possible = RESOURCE_PROFILES.filter(
      (profile) =>
        coreRatio >= profile.minCoreRatio &&
        coreRatio <= profile.maxCoreRatio &&
        absY >= profile.minAbsY,
    );

    if (possible.length === 0) return undefined;

    const zonePressure = clamp(1.55 - coreRatio, 0.55, 1.45);
    const depthPressure = clamp(0.75 + absY / 160, 0.75, 1.6);

    for (const profile of possible) {
      const rarityFactor = profile.type === 'diamond' ? 0.68 : profile.type === 'gold' ? 0.84 : 1;
      const chance = profile.baseChance * richness * zonePressure * depthPressure * rarityFactor;
      if (this.random() < chance) return profile;
    }

    return undefined;
  }

  private spawnVein(
    startX: number,
    startY: number,
    type: ResourceProfile['type'],
    size: number,
    context: WorldContext,
    tiles: Map<string, TileCell>,
  ): void {
    let x = startX;
    let y = startY;

    for (let i = 0; i < size; i += 1) {
      const cell = tiles.get(tileKey(x, y));
      if (cell && this.canReplaceWithResource(cell) && this.distanceToStart(context, x, y) >= 16) {
        this.setTile(tiles, x, y, type, false);
      }

      x += this.randomInt(-1, 1);
      y += this.randomInt(-1, 1);
    }
  }

  private canReplaceWithResource(cell: TileCell): boolean {
    return (cell.type === 'dirt' || cell.type === 'stone' || cell.type === 'basalt') && !cell.boundary;
  }

  private applyReplacers(context: WorldContext, tiles: Map<string, TileCell>, replacers: LevelReplacer[]): void {
    for (const replacer of replacers) replacer.call(this, context, tiles);
  }

  private applyStartAndShipChamber(_context: WorldContext, tiles: Map<string, TileCell>): void {
    // The Bucket drilled in from the left: carve only the hot bore tunnel up to the drill tip.
    // The ceiling and floor remain fused bedrock, so the ship reads as embedded in the planet.
    for (let x = SHIP_TUNNEL_LEFT_X; x <= SHIP_TUNNEL_TIP_X; x += 1) {
      this.setTile(tiles, x, SHIP_CEILING_Y, 'bedrock', true);
      this.setTile(tiles, x, SHIP_FLOOR_Y, 'bedrock', true);

      for (let y = SHIP_TUNNEL_TOP_Y; y <= SHIP_TUNNEL_BOTTOM_Y; y += 1) {
        this.setTile(tiles, x, y, 'air', false);
      }
    }
  }

  private applyCore(context: WorldContext, tiles: Map<string, TileCell>): void {
    const { x: cx, y: cy, radius } = context.core;
    const radiusSq = radius ** 2;

    for (let x = cx - radius; x <= cx + radius; x += 1) {
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSq) {
          this.setTile(tiles, x, y, 'bedrock', true);
        }
      }
    }
  }

  private applyWorldBoundaries(context: WorldContext, tiles: Map<string, TileCell>): void {
    for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
      this.setTile(tiles, x, context.heightUp + 1, 'bedrock', true);
      this.setTile(tiles, x, -context.heightDown - 1, 'bedrock', true);
    }

    for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
      for (let x = WORLD_MIN_X; x < WORLD_MIN_X + LEFT_BOUNDARY_THICKNESS; x += 1) {
        if (y >= SHIP_TUNNEL_TOP_Y && y <= SHIP_TUNNEL_BOTTOM_Y) continue;
        this.setTile(tiles, x, y, 'bedrock', true);
      }
      this.setTile(tiles, context.width + 1, y, 'bedrock', true);
    }
  }

  private rebuildResources(tiles: Map<string, TileCell>): Map<string, TileType> {
    const resources = new Map<string, TileType>();

    for (const cell of tiles.values()) {
      if (isResourceTile(cell.type)) resources.set(tileKey(cell.x, cell.y), cell.type);
    }

    return resources;
  }

  private distanceToCore(context: WorldContext, x: number, y: number): number {
    return Math.hypot(x - context.core.x, y - context.core.y);
  }

  private referenceCoreDistance(context: WorldContext): number {
    return Math.max(1, Math.hypot(context.core.x - context.spawn.x, context.core.y - context.spawn.y));
  }

  private distanceToStart(context: WorldContext, x: number, y: number): number {
    return Math.hypot(x - context.spawn.x, y - context.spawn.y);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  private setTile(tiles: Map<string, TileCell>, x: number, y: number, type: TileType, boundary: boolean): void {
    tiles.set(tileKey(x, y), {
      x,
      y,
      type,
      health: TILE_HEALTH[type],
      maxHealth: TILE_HEALTH[type],
      boundary,
    });
  }
}

export function isResourceTile(type: TileType): boolean {
  return RESOURCE_TYPES.has(type);
}
