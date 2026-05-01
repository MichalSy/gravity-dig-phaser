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

interface ResourceProfile {
  type: Extract<TileType, 'copper' | 'iron' | 'gold' | 'diamond'>;
  minDepth: number;
  maxDepth: number;
  baseChance: number;
  veinMin: number;
  veinMax: number;
}

const RESOURCE_PROFILES: ResourceProfile[] = [
  { type: 'copper', minDepth: -8, maxDepth: 50, baseChance: 0.028, veinMin: 2, veinMax: 5 },
  { type: 'iron', minDepth: -28, maxDepth: 42, baseChance: 0.022, veinMin: 2, veinMax: 5 },
  { type: 'gold', minDepth: -50, maxDepth: 12, baseChance: 0.014, veinMin: 1, veinMax: 4 },
  { type: 'diamond', minDepth: -50, maxDepth: -12, baseChance: 0.007, veinMin: 1, veinMax: 3 },
];

export class GravityDigLevelGenerator {
  private random: () => number = Math.random;

  generate(config: PlanetConfig, difficultyLevel = 1, customSeed: number | string = 'gravity-dig-phaser'): LevelData {
    const start = performance.now();
    const planet = config.planet;
    const difficulty = clamp(Math.round(difficultyLevel), 1, 10);
    const seed = hashSeed(customSeed);
    this.random = mulberry32(seed);

    const scaled = this.applyDifficultyScaling(config, difficulty);
    const width = planet.base_config.level_width;
    const heightUp = planet.base_config.level_height_up;
    const heightDown = planet.base_config.level_height_down;
    const tileSize = planet.base_config.block_size;
    const core = this.calculateCore(config, scaled);
    const tiles = new Map<string, TileCell>();
    const resources = new Map<string, TileType>();

    for (let x = -10; x <= width; x += 1) {
      for (let y = -heightDown; y <= heightUp; y += 1) {
        const type = this.blockForDepth(y);
        this.setTile(tiles, x, y, type, false);
      }
    }

    this.spawnResources(config, scaled.resource_richness ?? 1, core, tiles, resources);
    this.clearSpawnAreas(tiles);
    this.createBoundaries(width, heightUp, heightDown, tiles);
    this.clearStartArea(tiles);

    return {
      planetId: planet.id,
      planetName: planet.name,
      difficulty,
      seed,
      tileSize,
      width,
      heightUp,
      heightDown,
      core: { ...core, radius: scaled.core_radius ?? planet.core.radius },
      spawn: { x: 1, y: -2 },
      spaceshipRect: { x: -5, y: -5, w: 6, h: 8 },
      tiles,
      resources,
      generationTimeMs: Math.round(performance.now() - start),
    };
  }

  key(x: number, y: number): string {
    return tileKey(x, y);
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

  private blockForDepth(y: number): TileType {
    if (y > 35) return 'stone';
    if (y > 18) return 'dirt';
    if (y > -18) return 'dirt';
    if (y > -35) return 'stone';
    return 'basalt';
  }

  private spawnResources(
    _config: PlanetConfig,
    richness: number,
    core: { x: number; y: number },
    tiles: Map<string, TileCell>,
    resources: Map<string, TileType>,
  ): void {
    for (const cell of tiles.values()) {
      if (!this.canReplaceWithResource(cell)) continue;

      const profile = this.pickResourceForCell(cell, core, richness);
      if (!profile) continue;

      const veinSize = this.randomInt(profile.veinMin, profile.veinMax);
      this.spawnVein(cell.x, cell.y, profile.type, veinSize, tiles, resources);
    }
  }

  private pickResourceForCell(cell: TileCell, core: { x: number; y: number }, richness: number): ResourceProfile | undefined {
    const possible = RESOURCE_PROFILES.filter((profile) => cell.y >= profile.minDepth && cell.y <= profile.maxDepth);
    if (possible.length === 0) return undefined;

    const depthFactor = Math.min(1.8, 0.75 + Math.abs(cell.y) / 45);
    const coreDistance = Math.hypot(cell.x - core.x, cell.y - core.y);
    const distanceFactor = clamp(coreDistance / 85, 0.65, 1.45);

    for (const profile of possible) {
      const rarityFactor = profile.type === 'diamond' ? 0.72 : profile.type === 'gold' ? 0.86 : 1;
      const chance = profile.baseChance * richness * depthFactor * distanceFactor * rarityFactor;
      if (this.random() < chance) return profile;
    }

    return undefined;
  }

  private spawnVein(
    startX: number,
    startY: number,
    type: ResourceProfile['type'],
    size: number,
    tiles: Map<string, TileCell>,
    resources: Map<string, TileType>,
  ): void {
    let x = startX;
    let y = startY;

    for (let i = 0; i < size; i += 1) {
      const cell = tiles.get(tileKey(x, y));
      if (cell && this.canReplaceWithResource(cell)) {
        cell.type = type;
        cell.health = TILE_HEALTH[type];
        cell.maxHealth = TILE_HEALTH[type];
        resources.set(tileKey(cell.x, cell.y), type);
      }

      x += this.randomInt(-1, 1);
      y += this.randomInt(-1, 1);
    }
  }

  private canReplaceWithResource(cell: TileCell): boolean {
    return (cell.type === 'dirt' || cell.type === 'stone' || cell.type === 'basalt') && !cell.boundary;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  private clearSpawnAreas(tiles: Map<string, TileCell>): void {
    for (let x = -6; x < 2; x += 1) {
      for (let y = -6; y < 4; y += 1) {
        this.setTile(tiles, x, y, 'air', false);
      }
    }

    for (let x = -1; x < 5; x += 1) {
      for (let y = -3; y < 4; y += 1) {
        this.setTile(tiles, x, y, 'air', false);
      }
    }
  }

  private clearStartArea(tiles: Map<string, TileCell>): void {
    for (let x = 0; x < 3; x += 1) {
      for (let y = -1; y < 2; y += 1) {
        this.setTile(tiles, x, y, 'air', false);
      }
    }
  }

  private createBoundaries(width: number, heightUp: number, heightDown: number, tiles: Map<string, TileCell>): void {
    for (let x = -10; x <= width; x += 1) {
      this.setTile(tiles, x, heightUp + 1, 'bedrock', true);
      this.setTile(tiles, x, -heightDown - 1, 'bedrock', true);
    }

    for (let y = -heightDown; y <= heightUp; y += 1) {
      this.setTile(tiles, -10, y, 'bedrock', true);
      this.setTile(tiles, -9, y, 'bedrock', true);
      this.setTile(tiles, width + 1, y, 'bedrock', true);
    }

    for (let x = -4; x < 0; x += 1) {
      this.setTile(tiles, x, 2, 'bedrock', true);
      this.setTile(tiles, x, -5, 'bedrock', true);
    }
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
