import Phaser from 'phaser';

interface CargoFlight {
  image: Phaser.GameObjects.Image;
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  elapsedMs: number;
  durationMs: number;
  rotationSpeed: number;
}

const ITEM_SIZE = 38;
const ARRIVAL_SOUND_KEY = 'cargo-arrival-ping';
const ITEM_TINTS: Record<string, number> = {
  dirt: 0x9a6a45, sand: 0xd8bd78, clay: 0xb96855, gravel: 0x8f8b83, stone: 0x9ca3af,
  basalt: 0x4b5563, copper: 0xd97745, iron: 0x94a3b8, gold: 0xfacc15, diamond: 0x67e8f9,
};

export class CargoTransferEffects {
  private readonly flights: CargoFlight[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getSceneObjects(): Phaser.GameObjects.GameObject[] {
    return this.flights.map((flight) => flight.image);
  }

  launch(itemId: string, startScreenX: number, startScreenY: number, endX: number, endY: number): void {
    const start = this.scene.cameras.main.getWorldPoint(startScreenX, startScreenY);
    const deltaX = endX - start.x;
    const deltaY = endY - start.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const speed = Phaser.Math.Between(620, 980);
    const durationMs = Phaser.Math.Clamp(distance / speed * 1_000, 420, 950);
    const normalX = -deltaY / distance;
    const normalY = deltaX / distance;
    const sideArc = Phaser.Math.Between(-150, 150);
    const lift = Phaser.Math.Between(90, 190);
    const controlX = start.x + deltaX * 0.5 + normalX * sideArc;
    const controlY = start.y + deltaY * 0.5 + normalY * sideArc - lift;
    const itemTexture = `item-${itemId}`;
    const hasItemTexture = this.scene.textures.exists(itemTexture);
    const image = this.scene.add.image(start.x, start.y, hasItemTexture ? itemTexture : 'hud-item-rock')
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
      .setDepth(80)
      .setAngle(Phaser.Math.Between(0, 359));
    if (!hasItemTexture) image.setTint(ITEM_TINTS[itemId] ?? 0xffffff);

    this.flights.push({
      image,
      startX: start.x,
      startY: start.y,
      controlX,
      controlY,
      endX,
      endY,
      elapsedMs: 0,
      durationMs,
      rotationSpeed: Phaser.Math.Between(-520, 520),
    });
  }

  update(deltaMs: number): void {
    const elapsedMs = Math.min(Math.max(deltaMs, 0), 50);
    for (let index = this.flights.length - 1; index >= 0; index -= 1) {
      const flight = this.flights[index];
      flight.elapsedMs += elapsedMs;
      const progress = Phaser.Math.Clamp(flight.elapsedMs / flight.durationMs, 0, 1);
      const inverse = 1 - progress;
      flight.image.x = inverse * inverse * flight.startX + 2 * inverse * progress * flight.controlX + progress * progress * flight.endX;
      flight.image.y = inverse * inverse * flight.startY + 2 * inverse * progress * flight.controlY + progress * progress * flight.endY;
      flight.image.angle += flight.rotationSpeed * elapsedMs / 1_000;
      flight.image.setScale(1 - progress * 0.48);
      if (progress < 1) continue;
      flight.image.destroy();
      this.flights.splice(index, 1);
      if (this.scene.cache.audio.exists(ARRIVAL_SOUND_KEY)) {
        this.scene.sound.play(ARRIVAL_SOUND_KEY, {
          volume: 0.5,
          detune: Phaser.Math.Between(-80, 90),
        });
      }
    }
  }

  clear(): void {
    for (const flight of this.flights) flight.image.destroy();
    this.flights.length = 0;
  }

  destroy(): void {
    this.clear();
  }
}
