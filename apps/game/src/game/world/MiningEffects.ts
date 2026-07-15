import Phaser from 'phaser';

export interface MiningDropCollector {
  x: number;
  y: number;
}

export interface MiningEffectsOptions {
  collidesBox(x: number, y: number, width: number, height: number): boolean;
  getCollector(): MiningDropCollector | undefined;
  collectItem(itemId: string): boolean;
  addLootObjects(objects: readonly Phaser.GameObjects.GameObject[]): void;
  addEffectObjects(objects: readonly Phaser.GameObjects.GameObject[]): void;
}

interface MiningParticle {
  fragment: Phaser.GameObjects.Rectangle;
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
const DROP_PICKUP_RADIUS = 58;
const DROP_GRAVITY = 1_700;
const PARTICLE_GRAVITY = 250;
const MATERIAL_COLORS: Record<string, number> = {
  dirt: 0x9a6334,
  sand: 0xd8b96f,
  clay: 0xb96849,
  gravel: 0x85878c,
  stone: 0x68717c,
  basalt: 0x3f3b45,
  copper: 0xd17a3d,
  iron: 0xb4bec8,
  gold: 0xf6c945,
  diamond: 0x69e7f2,
};

export class MiningEffects {
  private readonly particles: MiningParticle[] = [];
  private readonly drops: ResourceDrop[] = [];
  private readonly scene: Phaser.Scene;
  private readonly options: MiningEffectsOptions;

  constructor(scene: Phaser.Scene, options: MiningEffectsOptions) {
    this.scene = scene;
    this.options = options;
  }


  emitFragments(materialId: string, x: number, y: number, count = 3): void {
    const color = MATERIAL_COLORS[materialId] ?? 0x9a6334;
    for (let index = 0; index < count; index += 1) {
      const width = Phaser.Math.Between(9, 17);
      const height = Phaser.Math.Between(7, 14);
      const fragment = this.scene.add.rectangle(
        x + Phaser.Math.Between(-16, 16),
        y + Phaser.Math.Between(-16, 16),
        width,
        height,
        color,
        1,
      )
        .setStrokeStyle(1, 0xffe5a3, 0.8)
        .setAngle(Phaser.Math.Between(0, 359));
      this.options.addEffectObjects([fragment]);
      const lifetimeMs = Phaser.Math.Between(1_600, 2_100);
      this.particles.push({
        fragment,
        velocityX: Phaser.Math.Between(-180, 180),
        velocityY: Phaser.Math.Between(-180, -90),
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
    const image = this.scene.add.image(x, y, `item-${itemId}`)
      .setDisplaySize(DROP_SIZE, DROP_SIZE)
      .setAngle(Phaser.Math.Between(-18, 18));
    this.options.addLootObjects([marker, image]);
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
    for (const particle of this.particles) particle.fragment.destroy();
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
      particle.fragment.x += particle.velocityX * deltaSeconds;
      particle.fragment.y += particle.velocityY * deltaSeconds;
      particle.fragment.angle += particle.angularVelocity * deltaSeconds;
      particle.fragment.setAlpha(Math.max(0, particle.remainingMs / particle.lifetimeMs));
      if (particle.remainingMs > 0) continue;
      particle.fragment.destroy();
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
        if (this.scene.cache.audio.exists('resource-pickup')) {
          this.scene.sound.play('resource-pickup', {
            volume: 0.72,
            detune: Phaser.Math.Between(-65, 75),
          });
        }
      },
    });
    return true;
  }
}
