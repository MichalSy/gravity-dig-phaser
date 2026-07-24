import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
    Display: {
      Color: {
        HexStringToColor: (value: string) => ({ color: Number.parseInt(value.replace('#', ''), 16) }),
      },
    },
  },
}));

import { CircleNode } from '../packages/game-core/src/nodes/CircleNode';
import { ImageNode } from '../packages/game-core/src/nodes/ImageNode';
import { RoundedRectangleNode } from '../packages/game-core/src/nodes/RoundedRectangleNode';

class GraphicsStub {
  clearCount = 0;
  destroyed = false;
  clear() { this.clearCount += 1; return this; }
  fillStyle() { return this; }
  fillRoundedRect() { return this; }
  strokeRoundedRect() { return this; }
  fillCircle() { return this; }
  strokeCircle() { return this; }
  lineStyle() { return this; }
  setPosition() { return this; }
  setRotation() { return this; }
  setScale() { return this; }
  setVisible() { return this; }
  setScrollFactor() { return this; }
  destroy() { this.destroyed = true; }
}

class ImageStub {
  frame = { width: 128, height: 128 };
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  rotation = 0;
  visible = true;
  flipX = false;
  alpha = 1;
  isTinted = false;
  tintTopLeft = 0xffffff;
  setFlipX(value: boolean) { this.flipX = value; return this; }
  setOrigin() { return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setRotation(value: number) { this.rotation = value; return this; }
  setScale(x: number, y: number) { this.scaleX = x; this.scaleY = y; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setScrollFactor() { return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  setTint(value: number) { this.isTinted = true; this.tintTopLeft = value; return this; }
  clearTint() { this.isTinted = false; this.tintTopLeft = 0xffffff; return this; }
  setTexture() { return this; }
  destroy() {}
}

function shapeContext(graphics: GraphicsStub) {
  return { phaserScene: { add: { graphics: () => graphics } } } as never;
}

function imageContext(image: ImageStub) {
  return {
    phaserScene: { add: { image: () => image } },
    assets: {
      image: () => ({ id: 'test-image', kind: 'image', textureKey: 'test-image', width: 128, height: 128 }),
    },
  } as never;
}

describe('reusable Core shape nodes', () => {
  it.each([
    ['rounded rectangle', () => new RoundedRectangleNode({ size: { width: 88, height: 88 }, radius: 12, fillAlpha: 1 })],
    ['circle', () => new CircleNode({ size: { width: 10, height: 10 }, fillAlpha: 1 })],
  ] as const)('%s redraws only when presentation geometry changes', (_label, createNode) => {
    const graphics = new GraphicsStub();
    const node = createNode();
    node.init(shapeContext(graphics));
    expect(graphics.clearCount).toBe(1);

    node.coreUpdate();
    node.coreUpdate();
    expect(graphics.clearCount).toBe(1);

    node.applySceneProps({ position: { x: 12, y: 18 }, scale: { x: 0.5, y: 0.5 } });
    node.coreUpdate();
    expect(graphics.clearCount).toBe(1);

    node.applySceneProps({ fillColor: '#123456' });
    expect(graphics.clearCount).toBe(2);

    node.applySceneProps({ size: { width: 20, height: 20 } });
    node.coreUpdate();
    expect(graphics.clearCount).toBe(3);

    node.destroy();
    expect(graphics.destroyed).toBe(true);
  });
});

describe('ImageNode presentation props', () => {
  it('applies clamped alpha and tint and can clear tint', () => {
    const image = new ImageStub();
    const node = new ImageNode({ assetId: 'test-image' });
    node.init(imageContext(image));

    node.applySceneProps({ alpha: 2, tint: '#123456' });
    expect(node.alpha).toBe(1);
    expect(image.alpha).toBe(1);
    expect(image.isTinted).toBe(true);
    expect(image.tintTopLeft).toBe(0x123456);

    node.applySceneProps({ alpha: -1, tint: '#ffffff' });
    expect(node.alpha).toBe(0);
    expect(image.alpha).toBe(0);
    expect(image.isTinted).toBe(false);
  });

  it('synchronizes external alpha and uniform tint in object-to-node mode', () => {
    const image = new ImageStub();
    const node = new ImageNode({ assetId: 'test-image', syncMode: 'object-to-node' });
    node.init(imageContext(image));

    image.alpha = 0.4;
    image.isTinted = true;
    image.tintTopLeft = 0x0a2b4c;
    node.coreUpdate();
    expect(node.alpha).toBe(0.4);
    expect(node.tint).toBe('#0a2b4c');

    image.alpha = 0.75;
    image.isTinted = false;
    node.coreUpdate();
    expect(node.alpha).toBe(0.75);
    expect(node.tint).toBe('#ffffff');
  });
});
