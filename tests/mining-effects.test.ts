import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Between: (min: number, max: number) => Math.round((min + max) / 2),
      Distance: { Between: (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by) },
    },
  },
}));

import { MiningEffects } from '../apps/game/src/game/world/MiningEffects';

class FakeImage {
  x: number;
  y: number;
  angle = 0;
  alpha = 1;
  depthCalls = 0;
  destroyed = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  setCrop() { return this; }
  setDisplaySize() { return this; }
  setStrokeStyle() { return this; }
  setDepth() { this.depthCalls += 1; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setAngle(value: number) { this.angle = value; return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  destroy() { this.destroyed = true; }
}

describe('mining drops and fragments', () => {
  let images: FakeImage[];
  let collector = { x: 1_000, y: 1_000 };
  let cargoHasSpace = false;
  let collected: string[];
  let sounds: string[];
  let lootObjects: FakeImage[];
  let effects: MiningEffects;

  beforeEach(() => {
    images = [];
    collector = { x: 1_000, y: 1_000 };
    cargoHasSpace = false;
    collected = [];
    sounds = [];
    lootObjects = [];
    const scene = {
      add: {
        circle: (x: number, y: number) => new FakeImage(x, y),
        rectangle: (x: number, y: number) => {
          const fragment = new FakeImage(x, y);
          images.push(fragment);
          return fragment;
        },
        image: (x: number, y: number) => {
          const image = new FakeImage(x, y);
          images.push(image);
          return image;
        },
      },
      tweens: {
        add: (options: { targets: FakeImage; onComplete(): void }) => options.onComplete(),
      },
      cache: { audio: { exists: (key: string) => key === 'resource-pickup' } },
      sound: { play: (key: string) => sounds.push(key) },
    };
    effects = new MiningEffects(scene as never, {
      collidesBox: (_x, y) => y >= 100,
      getCollector: () => collector,
      collectItem: (itemId) => {
        if (!cargoHasSpace) return false;
        collected.push(itemId);
        return true;
      },
      addLootObjects: (objects) => {
        for (const object of objects) lootObjects.push(object as unknown as FakeImage);
      },
    });
  });

  it('lets fragments fly away and cleans them up', () => {
    effects.emitFragments('dirt', 20, 20, 3);
    expect(images).toHaveLength(3);
    for (let index = 0; index < 50; index += 1) effects.update(50);
    expect(images.every((image) => image.destroyed)).toBe(true);
  });

  it('leaves a resource on the ground while cargo is full and collects it later', () => {
    effects.spawnDrop('copper', 6, 0, 0);
    const drop = images[0];
    expect(lootObjects).toHaveLength(2);
    expect(lootObjects).toContain(drop);
    expect(lootObjects.every((object) => object.depthCalls === 0)).toBe(true);
    for (let index = 0; index < 40; index += 1) effects.update(50);
    expect(drop.destroyed).toBe(false);
    expect(drop.y).toBeLessThan(100);

    collector = { x: drop.x, y: drop.y };
    effects.update(50);
    expect(drop.destroyed).toBe(false);
    expect(collected).toEqual([]);

    cargoHasSpace = true;
    effects.update(50);
    expect(drop.destroyed).toBe(true);
    expect(collected).toEqual(['copper']);
    expect(sounds).toEqual(['resource-pickup']);
  });
});
