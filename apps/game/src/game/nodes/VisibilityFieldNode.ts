import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';
import { GameWorldNode } from './GameWorldNode';

interface VisibilityStatsProvider {
  stats: { sightRadius: number };
  getDiscoveredTiles(): readonly string[];
  discoverTiles(tileKeys: readonly string[]): number;
}

interface GridTile {
  x: number;
  y: number;
}

const SHADOW_COLOR = 0x01030a;
const SHADOW_ALPHA = 0.985;
const VIEW_PADDING_TILES = 2;
const GRID_KEY_PREFIX = 'g:';

export class VisibilityFieldNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.VisibilityFieldNode;

  override readonly dependencies = ['World', 'PlayerState'] as const;
  private scene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: VisibilityStatsProvider;
  private overlay?: Phaser.GameObjects.Graphics;
  private readonly revealedTiles = new Set<string>();
  private trackedPlayer?: Phaser.GameObjects.Image;
  private lastPlayerTileKey?: string;
  private lastViewSignature = '';

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'VisibilityField', className: 'VisibilityFieldNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.scene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode('PlayerState') as unknown as VisibilityStatsProvider;
  }

  afterResolved(): void {
    this.overlay = this.scene.add.graphics().setScrollFactor(1);
    this.redrawGrid();
  }

  update(): void {
    const player = this.world.data.player;
    if (!player) return;
    if (player !== this.trackedPlayer) this.resetExploration(player);

    const discovered = this.discoverAround(player);
    const viewSignature = this.getViewSignature();
    if (!discovered && viewSignature === this.lastViewSignature) return;
    this.redrawGrid(viewSignature);
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.overlay ? [this.overlay] : [];
  }

  destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.revealedTiles.clear();
    this.lastPlayerTileKey = undefined;
    this.lastViewSignature = '';
    this.trackedPlayer = undefined;
  }

  private resetExploration(player: Phaser.GameObjects.Image): void {
    this.revealedTiles.clear();
    const migratedKeys: string[] = [];
    const sightRadius = this.getSightRadius();

    for (const savedKey of this.playerState.getDiscoveredTiles()) {
      const gridTile = parseGridKey(savedKey);
      if (gridTile) {
        this.revealedTiles.add(tileKey(gridTile.x, gridTile.y));
        continue;
      }

      // Versions 1.0.450–1.0.451 stored visited player centers. Expand them
      // once into the new permanent square grid representation.
      const legacyCenter = parseTileKey(savedKey);
      if (!legacyCenter) continue;
      this.revealSquare(legacyCenter.x, legacyCenter.y, sightRadius, migratedKeys);
    }

    this.trackedPlayer = player;
    this.lastPlayerTileKey = undefined;
    this.lastViewSignature = '';
    this.discoverAround(player, migratedKeys);
    if (migratedKeys.length > 0) this.playerState.discoverTiles(migratedKeys);
    this.redrawGrid();
  }

  private discoverAround(player: Phaser.GameObjects.Image, pendingKeys?: string[]): boolean {
    const centerX = Math.floor(player.x / TILE_SIZE);
    const centerY = Math.floor(player.y / TILE_SIZE);
    const playerTileKey = tileKey(centerX, centerY);
    if (playerTileKey === this.lastPlayerTileKey) return false;
    this.lastPlayerTileKey = playerTileKey;

    const keys = pendingKeys ?? [];
    const added = this.revealSquare(centerX, centerY, this.getSightRadius(), keys);
    if (!pendingKeys && keys.length > 0) this.playerState.discoverTiles(keys);
    return added;
  }

  private revealSquare(centerX: number, centerY: number, radius: number, persistedKeys: string[]): boolean {
    let added = false;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const key = tileKey(x, y);
        if (this.revealedTiles.has(key)) continue;
        this.revealedTiles.add(key);
        persistedKeys.push(gridKey(x, y));
        added = true;
      }
    }
    return added;
  }

  private redrawGrid(viewSignature = this.getViewSignature()): void {
    if (!this.overlay) return;
    const camera = this.scene.cameras.main;
    const worldView = camera.worldView;
    const minX = Math.floor(worldView.x / TILE_SIZE) - VIEW_PADDING_TILES;
    const minY = Math.floor(worldView.y / TILE_SIZE) - VIEW_PADDING_TILES;
    const maxX = Math.ceil((worldView.x + worldView.width) / TILE_SIZE) + VIEW_PADDING_TILES;
    const maxY = Math.ceil((worldView.y + worldView.height) / TILE_SIZE) + VIEW_PADDING_TILES;

    this.overlay.clear();
    this.overlay.fillStyle(SHADOW_COLOR, SHADOW_ALPHA);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (this.revealedTiles.has(tileKey(x, y))) continue;
        this.overlay.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
      }
    }
    this.lastViewSignature = viewSignature;
  }

  private getSightRadius(): number {
    return Math.max(1, Math.round(this.playerState.stats.sightRadius));
  }

  private getViewSignature(): string {
    const view = this.scene.cameras.main.worldView;
    return [
      Math.floor(view.x / TILE_SIZE),
      Math.floor(view.y / TILE_SIZE),
      Math.ceil((view.x + view.width) / TILE_SIZE),
      Math.ceil((view.y + view.height) / TILE_SIZE),
    ].join(':');
  }
}

function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function gridKey(x: number, y: number): string {
  return `${GRID_KEY_PREFIX}${x}:${y}`;
}

function parseTileKey(key: string): GridTile | undefined {
  const match = /^(-?\d+):(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function parseGridKey(key: string): GridTile | undefined {
  const match = /^g:(-?\d+):(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}
