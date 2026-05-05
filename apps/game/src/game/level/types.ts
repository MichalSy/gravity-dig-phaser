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

export interface WorldContext {
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

export interface ResourceProfile {
  type: Extract<TileType, 'copper' | 'iron' | 'gold' | 'diamond'>;
  minCoreRatio: number;
  maxCoreRatio: number;
  minAbsY: number;
  baseChance: number;
  veinMin: number;
  veinMax: number;
}
