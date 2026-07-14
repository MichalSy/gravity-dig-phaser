import Phaser from 'phaser';

export interface MiningDropCollector {
  x: number;
  y: number;
}

export interface MiningEffectsOptions {
  collidesBox(x: number, y: number, width: number, height: number): boolean;
  getCollector(): MiningDropCollector | undefined;
  collectItem(itemId: string): boolean;
}

interface MiningParticle {
  image: Phaser.GameObjects.Image;
  velocityX: number;
  velocityY: number;
  angularVelocity: number;
  remainingMs: number;
  lifetimeMs: number;
}

interface ResourceDrop {
  marker: Phaser.GameObjects.Arc;
  image: Phaser.GameObjects.Image;
  itemId: string;
  velocityX: number;
  velocityY: number;
  pickupDelayMs: number;
  resting: boolean;
}

const DROP_SIZE = 30;
const TILE_SIZE = 96;
const TILE_ATLAS_COLUMNS = 8;
const DROP_PICKUP_RADIUS = 58;
const DROP_GRAVITY = 1_700;
const PARTICLE_GRAVITY = 720;

export class MiningEffects {
  private readonly particles: MiningParticle[] = [];
  private readonly drops: ResourceDrop[] = [];
  private readonly scene: Phaser.Scene;
  private readonly options: MiningEffectsOptions;

  constructor(scene: Phaser.Scene, options: MiningEffectsOptions) {
    this.scene = scene;
    this.options = options;
  }

  getSceneObjects(): Phaser.GameObjects.GameObject[] {
    return [
      ...this.particles.map((particle) => particle.image),
      ...this.drops.map((drop) => drop.marker),
      ...this.drops.map((drop) => drop.image),
    ];
  }

  emitFragments(frame: number, x: number, y: number, count = 2): void {
    if (frame < 0) return;
    for (let index = 0; index < count; index += 1) {
      const size = Phaser.Math.Between(5, 11);
      const image = this.scene.add.image(
        x + Phaser.Math.Between(-16, 16),
        y + Phaser.Math.Between(-16, 16),
        'tiles',
      )
        .setCrop((frame % TILE_ATLAS_COLUMNS) * TILE_SIZE, Math.floor(frame / TILE_ATLAS_COLUMNS) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
        .setDisplaySize(size, size)
        .setAngle(Phaser.Math.Between(0, 359));
      const lifetimeMs = Phaser.Math.Between(380, 620);
      this.particles.push({
        image,
        velocityX: Phaser.Math.Between(-190, 190),
        velocityY: Phaser.Math.Between(-270, -90),
        angularVelocity: Phaser.Math.Between(-540, 540),
        remainingMs: lifetimeMs,
        lifetimeMs,
      });
    }
  }

  spawnDrop(itemId: string, frame: number, x: number, y: number): void {
    if (frame < 0) return;
    const marker = this.scene.add.circle(x, y, DROP_SIZE * 0.64, 0xfbbf24, 0.18)
      .setStrokeStyle(2, 0xfde68a, 0.92);
    const image = this.scene.add.image(x, y, 'tiles')
      .setCrop((frame % TILE_ATLAS_COLUMNS) * TILE_SIZE, Math.floor(frame / TILE_ATLAS_COLUMNS) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      .setDisplaySize(DROP_SIZE, DROP_SIZE)
      .setAngle(Phaser.Math.Between(-18, 18));
    this.drops.push({
      marker,
      image,
      itemId,
      velocityX: Phaser.Math.Between(-145, 145),
      velocityY: Phaser.Math.Between(-430, -260),
      pickupDelayMs: 280,
      resting: false,
    });
  }

  update(deltaMs: number): void {
    const elapsedMs = Math.min(Math.max(deltaMs, 0), 50);
    const deltaSeconds = elapsedMs / 1_000;
    this.updateParticles(elapsedMs, deltaSeconds);
    this.updateDrops(elapsedMs, deltaSeconds);
  }

  clear(): void {
    for (const particle of this.particles) particle.image.destroy();
    for (const drop of this.drops) {
      drop.marker.destroy();
      drop.image.destroy();
    }
    this.particles.length = 0;
    this.drops.length = 0;
  }

  destroy(): void {
    this.clear();
  }

  private updateParticles(elapsedMs: number, deltaSeconds: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.remainingMs -= elapsedMs;
      particle.velocityY += PARTICLE_GRAVITY * deltaSeconds;
      particle.image.x += particle.velocityX * deltaSeconds;
      particle.image.y += particle.velocityY * deltaSeconds;
      particle.image.angle += particle.angularVelocity * deltaSeconds;
      particle.image.setAlpha(Math.max(0, particle.remainingMs / particle.lifetimeMs));
      if (particle.remainingMs > 0) continue;
      particle.image.destroy();
      this.particles.splice(index, 1);
    }
  }

  private updateDrops(elapsedMs: number, deltaSeconds: number): void {
    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      drop.pickupDelayMs = Math.max(0, drop.pickupDelayMs - elapsedMs);
      this.moveDrop(drop, deltaSeconds);
      drop.marker.setPosition(drop.image.x, drop.image.y);
      if (drop.pickupDelayMs > 0 || !this.collectDrop(drop)) continue;
      this.drops.splice(index, 1);
    }
  }

  private moveDrop(drop: ResourceDrop, deltaSeconds: number): void {
    const image = drop.image;
    if (drop.resting && this.options.collidesBox(image.x, image.y + 2, DROP_SIZE * 0.72, DROP_SIZE)) return;
    drop.resting = false;
    drop.velocityY += DROP_GRAVITY * deltaSeconds;

    const nextX = image.x + drop.velocityX * deltaSeconds;
    if (this.options.collidesBox(nextX, image.y, DROP_SIZE * 0.72, DROP_SIZE * 0.72)) drop.velocityX *= -0.28;
    else image.x = nextX;

    const nextY = image.y + drop.velocityY * deltaSeconds;
    if (!this.options.collidesBox(image.x, nextY, DROP_SIZE * 0.72, DROP_SIZE)) {
      image.y = nextY;
      image.angle += drop.velocityX * deltaSeconds * 0.35;
      return;
    }
    if (drop.velocityY > 0) {
      drop.resting = true;
      drop.velocityX *= 0.45;
    }
    drop.velocityY = 0;
  }

  private collectDrop(drop: ResourceDrop): boolean {
    const collector = this.options.getCollector();
    if (!collector || Phaser.Math.Distance.Between(drop.image.x, drop.image.y, collector.x, collector.y) > DROP_PICKUP_RADIUS) return false;
    if (!this.options.collectItem(drop.itemId)) return false;

    this.scene.tweens.add({
      targets: [drop.marker, drop.image],
      x: collector.x,
      y: collector.y,
      scaleX: 0.15,
      scaleY: 0.15,
      alpha: 0,
      duration: 120,
      ease: 'Quad.easeIn',
      onComplete: () => {
        drop.marker.destroy();
        drop.image.destroy();
      },
    });
    return true;
  }
}
