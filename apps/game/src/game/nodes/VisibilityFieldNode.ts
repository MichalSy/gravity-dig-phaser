import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../../config/gameConfig';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';
import { GameWorldNode } from './GameWorldNode';

interface VisibilityStatsProvider {
  stats: { sightRadius: number };
}

interface TrailPoint {
  x: number;
  y: number;
  ageMs: number;
}

const MASK_REFRESH_MS = 80;
const MASK_SCALE = 0.5;
const MASK_WIDTH = GAME_WIDTH * MASK_SCALE;
const MASK_HEIGHT = GAME_HEIGHT * MASK_SCALE;
const TRAIL_SAMPLE_DISTANCE = TILE_SIZE * 0.3;
const TRAIL_LIFETIME_MS = 2_200;
const TRAIL_RADIUS_FACTOR = 0.82;
const SHADOW_ALPHA = 0.985;

export class VisibilityFieldNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.VisibilityFieldNode;

  override readonly dependencies = ['World', 'PlayerState', 'UIRoot'] as const;
  private scene!: Phaser.Scene;
  private world!: GameWorldNode;
  private uiRoot!: GameNode;
  private playerState!: VisibilityStatsProvider;
  private maskTexture?: Phaser.Textures.CanvasTexture;
  private overlay?: Phaser.GameObjects.Image;
  private readonly textureKey: string;
  private readonly trail: TrailPoint[] = [];
  private lastSample?: { x: number; y: number };
  private trackedPlayer?: Phaser.GameObjects.Image;
  private refreshElapsedMs = 0;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'VisibilityField', className: 'VisibilityFieldNode', ...options });
    this.textureKey = `visibility-mask-${this.instanceId}`;
  }

  init(ctx: NodeContext): void {
    this.scene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode('PlayerState') as unknown as VisibilityStatsProvider;
    this.uiRoot = this.requireNode<GameNode>('UIRoot');
  }

  afterResolved(): void {
    this.maskTexture = this.scene.textures.createCanvas(this.textureKey, MASK_WIDTH, MASK_HEIGHT) ?? undefined;
    if (!this.maskTexture) throw new Error(`Could not create visibility mask '${this.textureKey}'`);

    const overlay = this.scene.add.image(0, 0, this.textureKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.overlay = overlay;
    this.redrawMask();

    for (const object of this.uiRoot.getSceneObjectsInHierarchy()) {
      if (this.scene.children.exists(object)) this.scene.children.bringToTop(object);
    }
  }

  update(deltaMs: number): void {
    const player = this.world.data.player;
    if (!player) return;
    if (player !== this.trackedPlayer) this.resetTrail(player);

    for (const point of this.trail) point.ageMs += deltaMs;
    while (this.trail[0]?.ageMs >= TRAIL_LIFETIME_MS) this.trail.shift();

    if (!this.lastSample || Phaser.Math.Distance.Between(this.lastSample.x, this.lastSample.y, player.x, player.y) >= TRAIL_SAMPLE_DISTANCE) {
      this.trail.push({ x: player.x, y: player.y, ageMs: 0 });
      this.lastSample = { x: player.x, y: player.y };
    }

    this.refreshElapsedMs += deltaMs;
    if (this.refreshElapsedMs < MASK_REFRESH_MS) return;
    this.refreshElapsedMs %= MASK_REFRESH_MS;
    this.redrawMask();
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.overlay ? [this.overlay] : [];
  }

  destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    if (this.maskTexture) {
      this.scene.textures.remove(this.textureKey);
      this.maskTexture = undefined;
    }
    this.trail.length = 0;
    this.lastSample = undefined;
    this.trackedPlayer = undefined;
  }

  private resetTrail(player: Phaser.GameObjects.Image): void {
    this.trail.length = 0;
    this.trackedPlayer = player;
    this.lastSample = { x: player.x, y: player.y };
    this.trail.push({ x: player.x, y: player.y, ageMs: 0 });
    this.refreshElapsedMs = MASK_REFRESH_MS;
  }

  private redrawMask(): void {
    if (!this.maskTexture) return;
    const context = this.maskTexture.getContext();
    context.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    context.fillStyle = `rgba(1,3,10,${SHADOW_ALPHA})`;
    context.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    context.globalCompositeOperation = 'destination-out';

    const camera = this.scene.cameras.main;
    const radius = Math.max(1, this.playerState?.stats.sightRadius ?? 3) * TILE_SIZE * camera.zoom;
    for (const point of this.trail) {
      const life = Math.max(0, 1 - point.ageMs / TRAIL_LIFETIME_MS);
      if (life <= 0) continue;
      this.drawLight(
        context,
        (point.x - camera.worldView.x) * camera.zoom * MASK_SCALE,
        (point.y - camera.worldView.y) * camera.zoom * MASK_SCALE,
        radius * TRAIL_RADIUS_FACTOR * MASK_SCALE,
        Math.pow(life, 1.8) * 0.72,
      );
    }

    const player = this.world?.data.player;
    if (player) {
      this.drawLight(
        context,
        (player.x - camera.worldView.x) * camera.zoom * MASK_SCALE,
        (player.y - camera.worldView.y) * camera.zoom * MASK_SCALE,
        radius * MASK_SCALE,
        1,
      );
    }
    context.globalCompositeOperation = 'source-over';
    this.maskTexture.refresh();
  }

  private drawLight(context: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number): void {
    if (x + radius < 0 || y + radius < 0 || x - radius > MASK_WIDTH || y - radius > MASK_HEIGHT) return;
    const gradient = context.createRadialGradient(x, y, radius * 0.42, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.56, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.82, `rgba(255,255,255,${alpha * 0.42})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}
