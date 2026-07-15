import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';
import { GameWorldNode } from './GameWorldNode';
import { LevelNode } from './LevelNode';

interface VisibilityStatsProvider {
  stats: { sightRadius: number; oreScannerRadius: number };
  getDiscoveredTiles(): readonly string[];
  discoverTiles(tileKeys: readonly string[]): number;
}

interface GridTile {
  x: number;
  y: number;
}

interface RevealAnimation extends GridTile {
  elapsedMs: number;
  startAlpha: number;
}

const SHADOW_COLOR = 0x01030a;
const INNER_SHADOW_ALPHA = 0.3;
const OUTER_SHADOW_ALPHA = 0.6;
const EXPLORED_SHADOW_ALPHA = 0;
const UNEXPLORED_SHADOW_ALPHA = 0.985;
const VIEW_PADDING_TILES = 2;
const GRID_KEY_PREFIX = 'g:';
const REVEAL_DURATION_MS = 360;
const REVEAL_WAVE_DELAY_MS = 34;
const CIRCLE_EDGE_TILES = 0.35;
const SCANNER_COLORS: Record<string, number> = { copper: 0xfb923c, iron: 0xcbd5e1, gold: 0xfacc15, diamond: 0x67e8f9 };

export class VisibilityFieldNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.VisibilityFieldNode;

  override readonly dependencies = ['World', 'PlayerState', 'Level'] as const;
  private scene!: Phaser.Scene;
  private world!: GameWorldNode;
  private level!: LevelNode;
  private playerState!: VisibilityStatsProvider;
  private overlay?: Phaser.GameObjects.Graphics;
  private animationOverlay?: Phaser.GameObjects.Graphics;
  private scannerOverlay?: Phaser.GameObjects.Graphics;
  private readonly revealedTiles = new Set<string>();
  private readonly rememberedShadowAlphas = new Map<string, number>();
  private readonly revealAnimations = new Map<string, RevealAnimation>();
  private trackedPlayer?: Phaser.GameObjects.Image;
  private currentPlayerTile?: GridTile;
  private lastPlayerTileKey?: string;
  private lastViewSignature = '';
  private scannerTimerMs = 0;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'VisibilityField', className: 'VisibilityFieldNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.scene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.level = this.requireNode<LevelNode>('Level');
    this.playerState = this.requireNode('PlayerState') as unknown as VisibilityStatsProvider;
  }

  afterResolved(): void {
    this.overlay = this.scene.add.graphics().setScrollFactor(1);
    this.animationOverlay = this.scene.add.graphics().setScrollFactor(1);
    this.scannerOverlay = this.scene.add.graphics().setScrollFactor(1);
    this.redrawGrid();
  }

  update(deltaMs: number): void {
    const player = this.world.data.player;
    if (!player) return;
    if (player !== this.trackedPlayer) this.resetExploration(player);

    const discovered = this.discoverAround(player);
    const animating = this.updateRevealAnimations(deltaMs);
    this.scannerTimerMs += deltaMs;
    const viewSignature = this.getViewSignature();
    if (discovered || viewSignature !== this.lastViewSignature) this.redrawGrid(viewSignature);
    if (animating) this.redrawAnimations();
    if (discovered || this.scannerTimerMs >= 240) {
      this.scannerTimerMs = 0;
      this.redrawScanner();
    }
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return [this.overlay, this.animationOverlay, this.scannerOverlay].filter(
      (object): object is Phaser.GameObjects.Graphics => object !== undefined,
    );
  }

  destroy(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    this.animationOverlay?.destroy();
    this.animationOverlay = undefined;
    this.scannerOverlay?.destroy();
    this.scannerOverlay = undefined;
    this.revealedTiles.clear();
    this.rememberedShadowAlphas.clear();
    this.revealAnimations.clear();
    this.lastPlayerTileKey = undefined;
    this.currentPlayerTile = undefined;
    this.lastViewSignature = '';
    this.scannerTimerMs = 0;
    this.trackedPlayer = undefined;
  }

  private resetExploration(player: Phaser.GameObjects.Image): void {
    this.revealedTiles.clear();
    this.rememberedShadowAlphas.clear();
    this.revealAnimations.clear();
    const migratedKeys: string[] = [];
    const sightRadius = this.getSightRadius();

    for (const savedKey of this.playerState.getDiscoveredTiles()) {
      const visibilityTile = parseVisibilityGridKey(savedKey);
      if (visibilityTile) {
        const key = tileKey(visibilityTile.x, visibilityTile.y);
        if (visibilityTile.alpha === EXPLORED_SHADOW_ALPHA) {
          this.revealedTiles.add(key);
          this.rememberedShadowAlphas.delete(key);
        } else if (!this.revealedTiles.has(key)) {
          const previous = this.rememberedShadowAlphas.get(key) ?? UNEXPLORED_SHADOW_ALPHA;
          this.rememberedShadowAlphas.set(key, Math.min(previous, visibilityTile.alpha));
        }
        continue;
      }

      // Versions 1.0.450–1.0.451 stored visited player centers. Expand them
      // once into the current permanent circular grid representation.
      const legacyCenter = parseTileKey(savedKey);
      if (!legacyCenter) continue;
      this.revealCircle(legacyCenter.x, legacyCenter.y, sightRadius, migratedKeys, false);
    }

    this.trackedPlayer = player;
    this.lastPlayerTileKey = undefined;
    this.currentPlayerTile = undefined;
    this.lastViewSignature = '';
    this.discoverAround(player, migratedKeys, false);
    if (migratedKeys.length > 0) this.playerState.discoverTiles(migratedKeys);
    this.redrawGrid();
    this.redrawAnimations();
  }

  private discoverAround(
    player: Phaser.GameObjects.Image,
    pendingKeys?: string[],
    animate = true,
  ): boolean {
    const centerX = Math.floor(player.x / TILE_SIZE);
    const centerY = Math.floor(player.y / TILE_SIZE);
    const playerTileKey = tileKey(centerX, centerY);
    if (playerTileKey === this.lastPlayerTileKey) return false;
    this.lastPlayerTileKey = playerTileKey;

    const keys = pendingKeys ?? [];
    this.rememberVisibilityAround(centerX, centerY, keys, animate);
    this.currentPlayerTile = { x: centerX, y: centerY };
    if (!pendingKeys && keys.length > 0) this.playerState.discoverTiles(keys);
    return true;
  }

  private rememberVisibilityAround(
    centerX: number,
    centerY: number,
    persistedKeys: string[],
    animate: boolean,
  ): void {
    const outerRadius = this.getSightRadius() + 2;
    const radiusSquared = (outerRadius + CIRCLE_EDGE_TILES) ** 2;
    for (let y = centerY - outerRadius; y <= centerY + outerRadius; y += 1) {
      for (let x = centerX - outerRadius; x <= centerX + outerRadius; x += 1) {
        const distanceSquared = (x - centerX) ** 2 + (y - centerY) ** 2;
        if (distanceSquared > radiusSquared) continue;
        const targetAlpha = this.getDistanceShadowAlpha(distanceSquared);
        const key = tileKey(x, y);
        const previousMaximum = this.getRememberedShadowAlpha(key);
        if (targetAlpha >= previousMaximum) continue;

        const startAlpha = this.getTargetShadowAlpha(x, y);
        if (targetAlpha === EXPLORED_SHADOW_ALPHA) {
          this.revealedTiles.add(key);
          this.rememberedShadowAlphas.delete(key);
        } else {
          this.rememberedShadowAlphas.set(key, targetAlpha);
        }
        persistedKeys.push(visibilityGridKey(x, y, targetAlpha));

        if (animate && targetAlpha === EXPLORED_SHADOW_ALPHA && startAlpha > 0) {
          this.revealAnimations.set(key, {
            x,
            y,
            elapsedMs: -Math.sqrt(distanceSquared) * REVEAL_WAVE_DELAY_MS,
            startAlpha,
          });
        }
      }
    }
  }

  private revealCircle(
    centerX: number,
    centerY: number,
    radius: number,
    persistedKeys: string[],
    animate: boolean,
  ): boolean {
    let added = false;
    const radiusSquared = (radius + CIRCLE_EDGE_TILES) ** 2;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        const distanceSquared = (x - centerX) ** 2 + (y - centerY) ** 2;
        if (distanceSquared > radiusSquared) continue;
        const key = tileKey(x, y);
        if (this.revealedTiles.has(key)) continue;
        const startAlpha = this.getTargetShadowAlpha(x, y);
        this.revealedTiles.add(key);
        this.rememberedShadowAlphas.delete(key);
        persistedKeys.push(gridKey(x, y));
        if (animate && startAlpha > 0) {
          this.revealAnimations.set(key, {
            x,
            y,
            elapsedMs: -Math.sqrt(distanceSquared) * REVEAL_WAVE_DELAY_MS,
            startAlpha,
          });
        }
        added = true;
      }
    }
    return added;
  }

  private updateRevealAnimations(deltaMs: number): boolean {
    if (this.revealAnimations.size === 0) return false;
    for (const [key, animation] of this.revealAnimations) {
      animation.elapsedMs += deltaMs;
      if (animation.elapsedMs >= REVEAL_DURATION_MS) this.revealAnimations.delete(key);
    }
    return true;
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
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const alpha = this.getTargetShadowAlpha(x, y);
        if (alpha <= 0) continue;
        this.overlay.fillStyle(SHADOW_COLOR, alpha);
        this.overlay.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
      }
    }

    this.lastViewSignature = viewSignature;
  }

  private redrawAnimations(): void {
    if (!this.animationOverlay) return;
    this.animationOverlay.clear();
    for (const animation of this.revealAnimations.values()) {
      if (animation.elapsedMs < 0) {
        this.animationOverlay.fillStyle(SHADOW_COLOR, animation.startAlpha);
        this.animationOverlay.fillRect(
          animation.x * TILE_SIZE,
          animation.y * TILE_SIZE,
          TILE_SIZE + 0.5,
          TILE_SIZE + 0.5,
        );
        continue;
      }
      const progress = Phaser.Math.Clamp(animation.elapsedMs / REVEAL_DURATION_MS, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      const size = TILE_SIZE * (1 - eased);
      const alpha = animation.startAlpha * (1 - progress);
      this.animationOverlay.fillStyle(SHADOW_COLOR, alpha);
      this.animationOverlay.fillRect(
        (animation.x + 0.5) * TILE_SIZE - size / 2,
        (animation.y + 0.5) * TILE_SIZE - size / 2,
        size,
        size,
      );
    }
  }

  private redrawScanner(): void {
    if (!this.scannerOverlay) return;
    this.scannerOverlay.clear();
    const center = this.currentPlayerTile;
    const radius = Math.max(0, Math.round(this.playerState.stats.oreScannerRadius));
    if (!center || radius === 0) return;
    const radiusSquared = (radius + CIRCLE_EDGE_TILES) ** 2;
    const pulse = 0.62 + Math.sin(this.scene.time.now / 180) * 0.18;
    for (let y = center.y - radius; y <= center.y + radius; y += 1) {
      for (let x = center.x - radius; x <= center.x + radius; x += 1) {
        if ((x - center.x) ** 2 + (y - center.y) ** 2 > radiusSquared) continue;
        const cell = this.level.getCell(x, y);
        const color = cell ? SCANNER_COLORS[cell.type] : undefined;
        if (color === undefined) continue;
        this.scannerOverlay.lineStyle(3, color, pulse);
        this.scannerOverlay.strokeRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        this.scannerOverlay.fillStyle(color, 0.08);
        this.scannerOverlay.fillCircle((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, 8);
      }
    }
  }

  private getTargetShadowAlpha(x: number, y: number): number {
    const key = tileKey(x, y);
    const rememberedAlpha = this.getRememberedShadowAlpha(key);
    const center = this.currentPlayerTile;
    if (!center) return rememberedAlpha;
    const distanceSquared = (x - center.x) ** 2 + (y - center.y) ** 2;
    return Math.min(rememberedAlpha, this.getDistanceShadowAlpha(distanceSquared));
  }

  private getRememberedShadowAlpha(key: string): number {
    if (this.revealedTiles.has(key)) return EXPLORED_SHADOW_ALPHA;
    return this.rememberedShadowAlphas.get(key) ?? UNEXPLORED_SHADOW_ALPHA;
  }

  private getDistanceShadowAlpha(distanceSquared: number): number {
    const sightRadius = this.getSightRadius() + CIRCLE_EDGE_TILES;
    if (distanceSquared <= sightRadius ** 2) return EXPLORED_SHADOW_ALPHA;
    const innerRadius = this.getSightRadius() + 1 + CIRCLE_EDGE_TILES;
    if (distanceSquared <= innerRadius ** 2) return INNER_SHADOW_ALPHA;
    const outerRadius = this.getSightRadius() + 2 + CIRCLE_EDGE_TILES;
    if (distanceSquared <= outerRadius ** 2) return OUTER_SHADOW_ALPHA;
    return UNEXPLORED_SHADOW_ALPHA;
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

function visibilityGridKey(x: number, y: number, alpha: number): string {
  if (alpha <= EXPLORED_SHADOW_ALPHA) return gridKey(x, y);
  return `g${alpha <= INNER_SHADOW_ALPHA ? '30' : '60'}:${x}:${y}`;
}

function parseTileKey(key: string): GridTile | undefined {
  const match = /^(-?\d+):(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function parseVisibilityGridKey(key: string): (GridTile & { alpha: number }) | undefined {
  const match = /^g(?:(30|60))?:(-?\d+):(-?\d+)$/.exec(key);
  if (!match) return undefined;
  const alpha = match[1] === '30' ? INNER_SHADOW_ALPHA : match[1] === '60' ? OUTER_SHADOW_ALPHA : 0;
  return { x: Number(match[2]), y: Number(match[3]), alpha };
}
