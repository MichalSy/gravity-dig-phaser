import { rebuildResources, spawnResources } from './resourceGenerator';
import { generateBaseTerrain } from './terrainGenerator';
import { tileKey } from './tileMap';
import type { LevelData, PlanetConfig } from './types';
import { createWorldContext } from './worldContext';
import { applyWorldReplacers } from './worldReplacers';

export class GravityDigLevelGenerator {
  generate(config: PlanetConfig, difficultyLevel = 1, customSeed: number | string = 'gravity-dig-phaser'): LevelData {
    const start = performance.now();
    const { context, random } = createWorldContext(config, difficultyLevel, customSeed);
    const tiles = generateBaseTerrain(context, random);

    spawnResources(context, tiles, random);
    applyWorldReplacers(context, tiles);

    const resources = rebuildResources(tiles);

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
}
