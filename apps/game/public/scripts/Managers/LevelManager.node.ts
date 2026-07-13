import * as Core from '@gravity-dig/game-core';
import { GravityDigLevelGenerator } from '../LevelGeneration/GravityDigLevelGenerator';
import type { LevelData, PlanetConfig } from '../LevelGeneration/types';

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
}
