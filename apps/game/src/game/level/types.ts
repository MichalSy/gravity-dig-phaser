export interface TileCell {
  x: number;
  y: number;
  type: string;
  health: number;
  maxHealth: number;
  boundary: boolean;
  solid: boolean;
  foregroundFrame: number;
  backwallFrame: number;
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
  resources: Map<string, string>;
  generationTimeMs: number;
}
