import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Between: (min: number, max: number) => Math.round((min + max) / 2),
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
  },
}));

import { CargoTransferEffects } from '../apps/game/src/game/world/CargoTransferEffects';

class FakeImage {
  x: number;
  y: number;
  angle = 0;
  destroyed = false;
  tint?: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  setDisplaySize() { return this; }
  setDepth() { return this; }
  setAngle(angle: number) { this.angle = angle; return this; }
  setScale() { return this; }
  setTint(tint: number) { this.tint = tint; return this; }
  destroy() { this.destroyed = true; }
}

describe('cargo transfer effects', () => {
  let images: FakeImage[];
  let sounds: string[];
  let effects: CargoTransferEffects;
  let effectObjects: FakeImage[];

  beforeEach(() => {
    images = [];
    sounds = [];
    effectObjects = [];
    const scene = {
      cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x, y }) } },
      textures: { exists: () => true },
      add: {
        image: (x: number, y: number) => {
          const image = new FakeImage(x, y);
          images.push(image);
          return image;
        },
      },
      cache: { audio: { exists: (key: string) => key === 'cargo-credit-chime' } },
      sound: { play: (key: string) => sounds.push(key) },
    };
    effects = new CargoTransferEffects(scene as never, (objects) => {
      for (const object of objects) effectObjects.push(object as unknown as FakeImage);
    });
  });

  it('flies an item on a curved path and pings exactly when it reaches the ship', () => {
    effects.launch('copper', 640, 680, -288, 240);
    expect(images).toHaveLength(1);
    expect(effectObjects).toEqual(images);
    expect(sounds).toEqual([]);

    effects.update(250);
    expect(images[0].x).not.toBe(640);
    expect(images[0].y).not.toBe(680);
    expect(images[0].destroyed).toBe(false);

    for (let index = 0; index < 30; index += 1) effects.update(50);
    expect(images[0].destroyed).toBe(true);
    expect(sounds).toEqual(['cargo-credit-chime']);
  });
});
