import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../../config/gameConfig';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';
import { GameWorldNode } from './GameWorldNode';

interface VisibilityStatsProvider {
  stats: { sightRadius: number };
  getDiscoveredTiles(): readonly string[];
  discoverTiles(tileKeys: readonly string[]): number;
}

interface DiscoveredTile {
  x: number;
  y: number;
}

const MASK_REFRESH_MS = 80;
const MASK_SCALE = 0.5;
const MASK_WIDTH = GAME_WIDTH * MASK_SCALE;
const MASK_HEIGHT = GAME_HEIGHT * MASK_SCALE;
const SHADOW_ALPHA = 0.985;

export class VisibilityFieldNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.VisibilityFieldNode;

  override readonly dependencies = ['World', 'PlayerState'] as const;
  private scene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: VisibilityStatsProvider;
  private maskTexture?: Phaser.Textures.CanvasTexture;
  private overlay?: Phaser.GameObjects.Image;
  private readonly textureKey: string;
  private readonly discoveredTiles = new Map<string, DiscoveredTile>();
  private trackedPlayer?: Phaser.GameObjects.Image;
  private lastPlayerTileKey?: string;
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
  }

  afterResolved(): void {
    this.maskTexture = this.scene.textures.createCanvas(this.textureKey, MASK_WIDTH, MASK_HEIGHT) ?? undefined;
    if (!this.maskTexture) throw new Error(`Could not create visibility mask '${this.textureKey}'`);

    this.overlay = this.scene.add.image(0, 0, this.textureKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.redrawMask();
  }

  update(deltaMs: number): void {
    const player = this.world.data.player;
    if (!player) return;
    if (player !== this.trackedPlayer) this.resetExploration(player);

    const discovered = this.discoverAround(player);
    this.refreshElapsedMs += deltaMs;
    if (!discovered && this.refreshElapsedMs < MASK_REFRESH_MS) return;
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
    this.discoveredTiles.clear();
    this.lastPlayerTileKey = undefined;
    this.trackedPlayer = undefined;
  }

  private resetExploration(player: Phaser.GameObjects.Image): void {
    this.discoveredTiles.clear();
    for (const key of this.playerState.getDiscoveredTiles()) {
      const tile = parseTileKey(key);
      if (tile) this.discoveredTiles.set(key, tile);
    }
    this.trackedPlayer = player;
    this.lastPlayerTileKey = undefined;
    this.refreshElapsedMs = MASK_REFRESH_MS;
    this.discoverAround(player);
  }

  private discoverAround(player: Phaser.GameObjects.Image): boolean {
    const centerX = Math.floor(player.x / TILE_SIZE);
    const centerY = Math.floor(player.y / TILE_SIZE);
    const playerTileKey = tileKey(centerX, centerY);
    if (playerTileKey === this.lastPlayerTileKey) return false;
    this.lastPlayerTileKey = playerTileKey;
    if (this.discoveredTiles.has(playerTileKey)) return false;
    this.discoveredTiles.set(playerTileKey, { x: centerX, y: centerY });
    this.playerState.discoverTiles([playerTileKey]);
    return true;
  }

  private redrawMask(): void {
    if (!this.maskTexture) return;
    const context = this.maskTexture.getContext();
    context.clearRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    context.fillStyle = `rgba(1,3,10,${SHADOW_ALPHA})`;
    context.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
    context.globalCompositeOperation = 'destination-out';

    const camera = this.scene.cameras.main;
    const zoom = camera.zoom;
    const sightRadius = Math.max(1, this.playerState.stats.sightRadius) * TILE_SIZE * zoom;
    for (const tile of this.discoveredTiles.values()) {
      this.drawLight(
        context,
        ((tile.x + 0.5) * TILE_SIZE - camera.worldView.x) * zoom * MASK_SCALE,
        ((tile.y + 0.5) * TILE_SIZE - camera.worldView.y) * zoom * MASK_SCALE,
        sightRadius * MASK_SCALE,
        1,
      );
    }

    const player = this.world.data.player;
    if (player) {
      this.drawLight(
        context,
        (player.x - camera.worldView.x) * zoom * MASK_SCALE,
        (player.y - camera.worldView.y) * zoom * MASK_SCALE,
        sightRadius * MASK_SCALE,
        1,
      );
    }
    context.globalCompositeOperation = 'source-over';
    this.maskTexture.refresh();
  }

  private drawLight(context: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number): void {
    if (x + radius < 0 || y + radius < 0 || x - radius > MASK_WIDTH || y - radius > MASK_HEIGHT) return;
    const gradient = context.createRadialGradient(x, y, radius * 0.48, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.62, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.84, `rgba(255,255,255,${alpha * 0.5})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function parseTileKey(key: string): DiscoveredTile | undefined {
  const match = /^(-?\d+):(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}
