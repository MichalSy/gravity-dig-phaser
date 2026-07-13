import * as Core from '@gravity-dig/game-core';
import { GravityDigLevelGenerator } from '../LevelGeneration/GravityDigLevelGenerator';
import { collidesBox, getCell, getCellAtWorld } from '../LevelGeneration/levelCollision';
import { clearTile } from '../LevelGeneration/tileMap';
import type { LevelData, PlanetConfig, TileCell } from '../LevelGeneration/types';

export default class LevelManager extends Core.ScriptNode {
  id = 'dynamic.level-manager';
  name = 'Level Manager';

  planetConfigAssetId = Core.prop.string('dev-planet', { label: 'Planet Config Asset ID' });
  defaultDifficulty = Core.prop.number(1, { label: 'Default Difficulty', min: 1, max: 10, step: 1 });
  defaultSeed = Core.prop.string('gravity-dig-phaser', { label: 'Default Seed' });

  private readonly generator = new GravityDigLevelGenerator();
  private planetConfig?: PlanetConfig;

  init() {
    this.planetConfig = this.requireJsonAsset<PlanetConfig>(this.planetConfigAssetId);
  }

  getConfig(): PlanetConfig {
    if (!this.planetConfig) throw new Error(`Planet config '${this.planetConfigAssetId}' is not initialized`);
    return this.planetConfig;
  }

  generateLevel(seed: number | string = this.defaultSeed, difficultyLevel = this.defaultDifficulty): LevelData {
    return this.generator.generate(this.getConfig(), difficultyLevel, seed);
  }

  getCell(level: LevelData, tileX: number, tileY: number): TileCell | undefined {
    return getCell(level, tileX, tileY);
  }

  getCellAtWorld(level: LevelData, worldX: number, worldY: number): TileCell | undefined {
    return getCellAtWorld(level, worldX, worldY);
  }

  collidesBox(level: LevelData, centerX: number, centerY: number, width: number, height: number): boolean {
    return collidesBox(level, centerX, centerY, width, height);
  }

  clearTile(level: LevelData, tileX: number, tileY: number): boolean {
    return clearTile(level, tileX, tileY);
  }
}
