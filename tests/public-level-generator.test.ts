import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GravityDigLevelGenerator } from '../apps/game/public/scripts/LevelGeneration/GravityDigLevelGenerator';
import { collidesBox } from '../apps/game/public/scripts/LevelGeneration/levelCollision';
import { clearTile } from '../apps/game/public/scripts/LevelGeneration/tileMap';
import type { LevelData, PlanetConfig } from '../apps/game/public/scripts/LevelGeneration/types';

const config = JSON.parse(readFileSync(new URL('../apps/game/public/config/planets/dev_planet.json', import.meta.url), 'utf8')) as PlanetConfig;

function levelHash(level: LevelData): string {
  const stable = {
    planetId: level.planetId,
    difficulty: level.difficulty,
    seed: level.seed,
    core: level.core,
    spawn: level.spawn,
    spaceshipRect: level.spaceshipRect,
    tiles: [...level.tiles.entries()].sort(([left], [right]) => left.localeCompare(right)),
    resources: [...level.resources.entries()].sort(([left], [right]) => left.localeCompare(right)),
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

describe('public GravityDigLevelGenerator', () => {
  it('is deterministic and produces valid spawn, boundaries, and resources', () => {
    const generator = new GravityDigLevelGenerator();
    const first = generator.generate(config, 2, 'repository-regression-seed');
    const second = generator.generate(config, 2, 'repository-regression-seed');
    const different = generator.generate(config, 2, 'different-seed');

    expect(levelHash(first)).toBe(levelHash(second));
    expect(levelHash(first)).not.toBe(levelHash(different));
    expect(first.tiles.get(generator.key(first.spawn.x, first.spawn.y))?.type).toBe('air');
    expect(first.resources.size).toBeGreaterThan(0);

    const boundaryTiles = [...first.tiles.values()].filter(({ boundary }) => boundary);
    expect(boundaryTiles.length).toBeGreaterThan(0);
    expect(boundaryTiles.every(({ type }) => type === 'bedrock')).toBe(true);

    for (const [key, resourceType] of first.resources) {
      const tile = first.tiles.get(key);
      expect(tile?.type).toBe(resourceType);
      expect(['copper', 'iron', 'gold', 'diamond']).toContain(resourceType);
    }

    expect([...first.tiles.values()].every((cell) => cell.foregroundFrame >= -1 && cell.backwallFrame >= -1)).toBe(true);
    expect([...first.tiles.values()].every((cell) => cell.solid === (cell.type !== 'air'))).toBe(true);
    expect(collidesBox(first, (first.spaceshipRect.x + 0.5) * first.tileSize, first.spawn.y * first.tileSize, 4, 4)).toBe(true);
  });

  it('keeps tile mutation and resource ownership in the public level manager', () => {
    const level = new GravityDigLevelGenerator().generate(config, 2, 'public-mutation-seed');
    const [resourceKey] = level.resources.keys();
    const resource = level.tiles.get(resourceKey)!;

    expect(clearTile(level, resource.x, resource.y)).toBe(true);
    expect(resource.type).toBe('air');
    expect(resource.health).toBe(0);
    expect(resource.solid).toBe(false);
    expect(resource.foregroundFrame).toBe(-1);
    expect(level.resources.has(resourceKey)).toBe(false);

    const boundary = [...level.tiles.values()].find((cell) => cell.boundary)!;
    expect(clearTile(level, boundary.x, boundary.y)).toBe(false);
    expect(boundary.type).toBe('bedrock');
  });
});
