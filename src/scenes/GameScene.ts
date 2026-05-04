import Phaser from 'phaser';
import {
  GRAVITY,
  PLAYER_SIZE,
  TILE_SIZE,
} from '../config/gameConfig';
import { UIScene, type HudState, type InputMode } from './UIScene';
import {
  GravityDigLevelGenerator,
  type LevelData,
  type PlanetConfig,
  type TileCell,
  type TileType,
  isResourceTile,
} from '../game/level';
import { atlasFrameForTile, backwallFrameForTile, tileKey, worldToTile } from '../utils/tileMath';
import { loadGameAssets } from '../assets/AssetLoader';
import { ITEM_DEFINITIONS } from '../player/catalogs/items';
import { addItem } from '../player/inventory';
import { createRunState, normalizeRunState } from '../player/RunState';
import { loadSaveGame, saveGame } from '../player/saveGame';
import { computeEffectiveStats } from '../player/stats';
import type { EffectivePlayerStats, ItemId, RunState, SaveGame } from '../player/types';

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;
type Facing = 'east' | 'west';

const START_TUNNEL_LEFT_TILE = -10;
const START_TUNNEL_TOP_TILE = -2;
const START_TUNNEL_WIDTH_TILES = 12;
const START_TUNNEL_HEIGHT_TILES = 6;
const SHIP_DOCK_CENTER_X = -3 * TILE_SIZE;
const SHIP_DOCK_CENTER_Y = 2 * TILE_SIZE;
const SHIP_DOCK_RADIUS = TILE_SIZE * 2.35;

export class GameScene extends Phaser.Scene {
  private generator = new GravityDigLevelGenerator();
  private level!: LevelData;
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private tileLayer?: Phaser.Tilemaps.TilemapLayer;
  private backwallTilemap?: Phaser.Tilemaps.Tilemap;
  private backwallLayer?: Phaser.Tilemaps.TilemapLayer;
  private crackOverlays = new Map<string, Phaser.GameObjects.Image>();
  private mapOffsetX = 0;
  private mapOffsetY = 0;
  private player!: Phaser.GameObjects.Image;
  private cursors!: CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private velocity = new Phaser.Math.Vector2(0, 0);
  private grounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private touchJumpHeld = false;
  private gravityEnabled = true;
  private facing: Facing = 'east';
  private walkTimer = 0;
  private walkFrame = 0;
  private save!: SaveGame;
  private runState!: RunState;
  private effectiveStats!: EffectivePlayerStats;
  private saveTimer = 0;
  private miningTarget?: TileCell;
  private laser!: Phaser.GameObjects.Graphics;
  private collisionDebug!: Phaser.GameObjects.Graphics;
  private startDecor: Phaser.GameObjects.GameObject[] = [];
  private debugZoomOffset = 0;
  private collisionDebugEnabled = false;
  private gameplayInputBlocked = false;
  private targetMarker!: Phaser.GameObjects.Rectangle;
  private uiScene!: UIScene;
  private currentAimWorld = new Phaser.Math.Vector2(1, 0);
  private laserOrigin = new Phaser.Math.Vector2(0, 0);
  private gamepadAim = new Phaser.Math.Vector2(1, 0);
  private laserSound?: Phaser.Sound.BaseSound;
  private walkSoundIndex = 0;
  private lastFootstepFrame = -1;
  private shipPrompt!: Phaser.GameObjects.Text;
  private lastCargoReturnMessage = '';
  private lastCargoReturnTimer = 0;

  constructor() {
    super('game');
  }

  preload(): void {
    if (!this.textures.exists('tiles')) {
      loadGameAssets(this);
    }
  }

  create(): void {
    this.save = loadSaveGame();
    this.effectiveStats = computeEffectiveStats(this.save.profile);
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');
    this.createLevel();
    this.scene.launch('ui');
    this.uiScene = this.scene.get('ui') as UIScene;
    this.configureUiVisibilityDuringLoading();
    this.createControls();
    this.laserSound = this.sound.add('laser-loop', { loop: true, volume: 0.28 });
    this.game.events.on('debug:collision', this.setCollisionDebug, this);
    this.game.events.on('gameplay-menu:opened', this.blockGameplayInput, this);
    this.game.events.on('gameplay-menu:closed', this.unblockGameplayInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('debug:collision', this.setCollisionDebug, this);
      this.game.events.off('gameplay-menu:opened', this.blockGameplayInput, this);
      this.game.events.off('gameplay-menu:closed', this.unblockGameplayInput, this);
      this.scale.off('resize', this.updateCameraZoom, this);
    });
    this.updateCameraZoom();

    this.scale.on('resize', this.updateCameraZoom, this);
    this.input.on('wheel', this.handleDebugZoomWheel, this);
    this.time.delayedCall(0, () => this.game.events.emit('game:ready'));
  }

  update(_time: number, deltaMs: number): void {
    const delta = deltaMs / 1000;
    this.handleInput(delta);
    this.applyPhysics(delta);
    this.updateMining(delta);
    this.updateRunRecovery(delta);
    this.updateAnimation(deltaMs);
    this.updateCollisionDebug();
    this.updateSaveTimer(deltaMs);
    this.updateShipPrompt(deltaMs);
    this.updateHud();
  }

  private createLevel(seed = this.save.activeRun?.seed ?? 'gravity-dig-phaser', restoreActiveRun = true): void {
    for (const overlay of this.crackOverlays.values()) overlay.destroy();
    this.crackOverlays.clear();
    for (const object of this.startDecor) object.destroy();
    this.startDecor = [];
    this.tileLayer?.destroy();
    this.backwallLayer?.destroy();
    this.tilemap?.destroy();
    this.backwallTilemap?.destroy();
    this.laser?.destroy();
    this.collisionDebug?.destroy();
    this.targetMarker?.destroy();
    this.tileLayer = undefined;
    this.backwallLayer = undefined;
    this.tilemap = undefined;
    this.backwallTilemap = undefined;

    const config = this.cache.json.get('dev-planet') as PlanetConfig;
    this.level = this.generator.generate(config, 1, seed);
    const activeRun = restoreActiveRun && this.save.activeRun?.planetId === this.level.planetId && this.save.activeRun.seed === String(seed)
      ? this.save.activeRun
      : undefined;
    this.runState = activeRun
      ? normalizeRunState(activeRun, this.effectiveStats)
      : createRunState(this.level.planetId, String(seed), this.effectiveStats);
    this.save.activeRun = this.runState;
    saveGame(this.save);

    this.addBackground();
    this.drawTiles();
    this.addStartTunnelBackground();
    this.addShip();
    this.addCoreMarker();
    this.addPlayer();
    this.laser = this.add.graphics().setDepth(30);
    this.collisionDebug = this.add.graphics().setDepth(45);
    this.targetMarker = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE).setStrokeStyle(3, 0xf97316, 0.95).setVisible(false).setDepth(25);
  }

  private addBackground(): void {
    const stars = this.add.graphics().setDepth(-19).setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(this.level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
  }

  private drawTiles(): void {
    const minX = Math.min(...[...this.level.tiles.values()].map((cell) => cell.x));
    const maxX = Math.max(...[...this.level.tiles.values()].map((cell) => cell.x));
    const minY = Math.min(...[...this.level.tiles.values()].map((cell) => cell.y));
    const maxY = Math.max(...[...this.level.tiles.values()].map((cell) => cell.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const data = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));
    const backwallData = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));

    this.mapOffsetX = minX;
    this.mapOffsetY = minY;

    for (const cell of this.level.tiles.values()) {
      if (cell.type === 'air') continue;
      const localX = cell.x - minX;
      const localY = cell.y - minY;

      if (!cell.boundary) {
        backwallData[localY][localX] = backwallFrameForTile(cell.x, cell.y);
      }
      data[localY][localX] = atlasFrameForTile(cell.type, cell.x, cell.y);
    }

    this.backwallTilemap = this.make.tilemap({ data: backwallData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const backwallTileset = this.backwallTilemap.addTilesetImage('backwall-tiles', 'backwall-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!backwallTileset) throw new Error('Failed to create backwall tileset');
    const backwallLayer = this.backwallTilemap.createLayer(0, backwallTileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!backwallLayer || backwallLayer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create backwall tile layer');
    this.backwallLayer = backwallLayer.setDepth(0.6).setAlpha(0.88);

    this.tilemap = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.tilemap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Failed to create tileset');

    const layer = this.tilemap.createLayer(0, tileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!layer || layer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create tile layer');
    this.tileLayer = layer.setDepth(2);
  }

  private addStartTunnelBackground(): void {
    const tunnelLeftX = START_TUNNEL_LEFT_TILE * TILE_SIZE;
    const tunnelTopY = (START_TUNNEL_TOP_TILE + 1) * TILE_SIZE;
    const tunnelWidth = (START_TUNNEL_WIDTH_TILES - 1) * TILE_SIZE;
    const tunnelHeight = (START_TUNNEL_HEIGHT_TILES - 2) * TILE_SIZE;

    const background = this.add
      .image(tunnelLeftX + tunnelWidth / 2, tunnelTopY + tunnelHeight / 2, 'drill-tunnel-bg')
      .setOrigin(0.5)
      .setDepth(1.5)
      .setDisplaySize(tunnelWidth, tunnelHeight)
      .setAlpha(0.96);

    this.startDecor.push(background);
  }

  private addShip(): void {
    const shipBottomY = TILE_SIZE * 3;
    const shipCenterX = -3 * TILE_SIZE;

    const ship = this.add
      .image(shipCenterX, shipBottomY, 'ship')
      .setOrigin(0.5, 1)
      .setDepth(8)
      .setDisplaySize(TILE_SIZE * 5.71, TILE_SIZE * 3.5)
      .setAlpha(0.96);

    this.startDecor.push(ship);
  }

  private addCoreMarker(): void {
    const { x, y, radius } = this.level.core;
    this.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, radius * TILE_SIZE, 0x7c3aed, 0.08).setDepth(1);
    this.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 18, 0xf0abfc, 0.85).setDepth(5);
  }

  private addPlayer(): void {
    const spawnX = this.level.spawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = this.level.spawn.y * TILE_SIZE + TILE_SIZE / 2;

    if (this.player) this.player.destroy();
    this.player = this.add.image(spawnX, spawnY, 'player-idle-0').setDepth(20).setScale(0.9);
    this.shipPrompt?.destroy();
    this.shipPrompt = this.add
      .text(spawnX, spawnY - PLAYER_SIZE.h, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: '900',
        color: '#e0f2fe',
        backgroundColor: 'rgba(2,6,23,0.72)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setVisible(false);
    this.velocity.set(0, 0);

    const worldLeft = -10 * TILE_SIZE;
    const worldTop = (-this.level.heightDown - 1) * TILE_SIZE;
    const worldWidth = (this.level.width + 12) * TILE_SIZE;
    const worldHeight = (this.level.heightUp + this.level.heightDown + 2) * TILE_SIZE;
    this.cameras.main.setBounds(worldLeft, worldTop, worldWidth, worldHeight);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 0.18, 0.18);
    this.updateCameraZoom();
  }

  private createControls(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input unavailable');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,R,G,E') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  private configureUiVisibilityDuringLoading(): void {
    const loadingActive = this.scene.isActive('loading') || this.scene.isVisible('loading');
    this.scene.setVisible(!loadingActive, 'ui');

    if (loadingActive) {
      this.game.events.once('loading:complete', () => {
        this.scene.setVisible(true, 'ui');
        this.scene.bringToTop('ui');
      });
      return;
    }

    this.scene.bringToTop('ui');
  }

  private updateCameraZoom(): void {
    if (!this.cameras?.main) return;
    const baseZoom = 1;
    this.cameras.main.setZoom(Phaser.Math.Clamp(baseZoom + this.debugZoomOffset, 0.65, 5));
  }

  private handleDebugZoomWheel(_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    if (this.gameplayInputBlocked) return;
    this.debugZoomOffset = Phaser.Math.Clamp(this.debugZoomOffset + (deltaY > 0 ? -0.15 : 0.15), -1.2, 2.5);
    this.updateCameraZoom();
  }

  private handleInput(delta: number): void {
    if (this.gameplayInputBlocked) {
      this.velocity.x = 0;
      this.touchJumpHeld = false;
      this.jumpBufferTimer = 0;
      return;
    }

    const mode = this.uiScene.getInputMode();
    const joy = this.uiScene.getMoveVector();
    const gamepad = mode === 'gamepad' ? this.getGamepad() : undefined;
    const gamepadX = gamepad ? this.axis(gamepad, 0) : 0;
    const gamepadY = gamepad ? this.axis(gamepad, 1) : 0;
    const desktop = mode === 'desktop';
    const touch = mode === 'touch';
    const gamepadMode = mode === 'gamepad';

    const left = (desktop && (this.cursors.left?.isDown || this.keys.A.isDown)) || (touch && joy.x < -0.22) || (gamepadMode && gamepadX < -0.22);
    const right = (desktop && (this.cursors.right?.isDown || this.keys.D.isDown)) || (touch && joy.x > 0.22) || (gamepadMode && gamepadX > 0.22);
    const joyUp = touch && joy.y < -0.56;
    const joyDown = touch && joy.y > 0.56;
    const gamepadUp = gamepadMode && (gamepadY < -0.56 || this.button(gamepad, 0));
    const gamepadDown = gamepadMode && gamepadY > 0.56;
    const up = (desktop && (this.cursors.up?.isDown || this.keys.W.isDown || this.keys.SPACE.isDown)) || joyUp || gamepadUp;
    const down = (desktop && (this.cursors.down?.isDown || this.keys.S.isDown)) || joyDown || gamepadDown;

    this.velocity.x = 0;
    if (left) this.velocity.x -= this.effectiveStats.moveSpeed * this.inputStrength(mode, joy.x, gamepadX, -1);
    if (right) this.velocity.x += this.effectiveStats.moveSpeed * this.inputStrength(mode, joy.x, gamepadX, 1);

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.G)) {
      this.gravityEnabled = !this.gravityEnabled;
      this.velocity.y = 0;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.createLevel(`gravity-dig-phaser-${Date.now()}`, false);
      return;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.tryReturnCargoToShip();
    }

    if (up && !this.gravityEnabled) this.velocity.y = -this.effectiveStats.moveSpeed;
    if (down && !this.gravityEnabled) this.velocity.y = this.effectiveStats.moveSpeed;
    if (!up && !down && !this.gravityEnabled) this.velocity.y = 0;

    const keyboardJump = desktop && (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.W));
    const touchJump = joyUp && !this.touchJumpHeld;
    const gamepadJump = gamepadMode && this.button(gamepad, 0) && !this.touchJumpHeld;
    this.touchJumpHeld = joyUp || (gamepadMode && this.button(gamepad, 0));

    if (keyboardJump || touchJump || gamepadJump) {
      if (this.grounded || this.coyoteTimer > 0) {
        this.jump();
      } else {
        this.jumpBufferTimer = 0.1;
      }
    }

    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= delta;
  }

  private applyPhysics(delta: number): void {
    const wasGrounded = this.grounded;
    if (this.gravityEnabled) this.velocity.y += GRAVITY * delta;

    this.moveAxis(this.velocity.x * delta, 0);
    this.grounded = false;
    this.moveAxis(0, this.velocity.y * delta);

    if (wasGrounded && !this.grounded) this.coyoteTimer = 0.1;
    if (this.coyoteTimer > 0) this.coyoteTimer -= delta;

    if (this.jumpBufferTimer > 0 && (this.grounded || this.coyoteTimer > 0)) {
      this.jump();
      this.jumpBufferTimer = 0;
    }
  }

  private jump(): void {
    this.velocity.y = this.effectiveStats.jumpVelocity;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) });
  }

  private moveAxis(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;

    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + stepX;
      const nextY = this.player.y + stepY;
      if (!this.collides(nextX, nextY)) {
        this.player.setPosition(nextX, nextY);
        continue;
      }

      if (dy > 0) this.grounded = true;
      if (dy !== 0) this.velocity.y = 0;
      if (dx !== 0) this.velocity.x = 0;
      break;
    }
  }

  private collides(cx: number, cy: number): boolean {
    return this.getCollisionProbePoints(cx, cy).some(([x, y]) => this.isSolidAtWorld(x, y));
  }

  private getCollisionProbePoints(cx: number, cy: number): [number, number][] {
    const halfW = PLAYER_SIZE.w / 2;
    const halfH = PLAYER_SIZE.h / 2;
    return [
      [cx - halfW, cy - halfH],
      [cx + halfW, cy - halfH],
      [cx - halfW, cy + halfH],
      [cx + halfW, cy + halfH],
    ];
  }

  private isSolidAtWorld(x: number, y: number): boolean {
    if (this.isBehindShipNozzleWall(x, y)) return true;

    const tx = worldToTile(x);
    const ty = worldToTile(y);
    const cell = this.level.tiles.get(tileKey(tx, ty));
    return !!cell && cell.type !== 'air';
  }

  private isBehindShipNozzleWall(x: number, y: number): boolean {
    return x < -8.65 * TILE_SIZE && y >= -1.4 * TILE_SIZE && y <= 2.95 * TILE_SIZE;
  }

  private blockGameplayInput(): void {
    this.gameplayInputBlocked = true;
    this.velocity.x = 0;
    this.touchJumpHeld = false;
    this.jumpBufferTimer = 0;
    this.setLaserSound(false);
  }

  private unblockGameplayInput(): void {
    this.gameplayInputBlocked = false;
  }

  private setCollisionDebug(enabled: boolean): void {
    this.collisionDebugEnabled = enabled;
    if (!enabled) this.collisionDebug?.clear();
  }

  private updateCollisionDebug(): void {
    if (!this.collisionDebug) return;
    this.collisionDebug.clear();
    if (!this.collisionDebugEnabled) return;

    const halfW = PLAYER_SIZE.w / 2;
    const halfH = PLAYER_SIZE.h / 2;
    const left = this.player.x - halfW;
    const top = this.player.y - halfH;
    const probes = this.getCollisionProbePoints(this.player.x, this.player.y);

    this.collisionDebug.lineStyle(2, 0x22c55e, 1);
    this.collisionDebug.strokeRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);
    this.collisionDebug.fillStyle(0x22c55e, 0.35);
    this.collisionDebug.fillRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);

    for (const [x, y] of probes) {
      const hit = this.isSolidAtWorld(x, y);
      this.collisionDebug.fillStyle(hit ? 0xef4444 : 0xfacc15, 1);
      this.collisionDebug.fillCircle(x, y, 4);
    }

    const minTx = worldToTile(this.player.x - TILE_SIZE * 2);
    const maxTx = worldToTile(this.player.x + TILE_SIZE * 2);
    const minTy = worldToTile(this.player.y - TILE_SIZE * 2);
    const maxTy = worldToTile(this.player.y + TILE_SIZE * 2);
    this.collisionDebug.lineStyle(1, 0xef4444, 0.5);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const cell = this.level.tiles.get(tileKey(tx, ty));
        if (!cell || cell.type === 'air') continue;
        this.collisionDebug.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private updateMining(delta: number): void {
    const aimWorld = this.getAimWorldPoint();
    const target = this.findFirstMineableTile(aimWorld);
    const firing = this.isMiningPressed();

    this.laser.clear();
    this.targetMarker.setVisible(false);
    this.miningTarget = target;

    if (!target) {
      this.setLaserSound(false);
      return;
    }

    const origin = this.getLaserOrigin();
    this.targetMarker.setPosition(target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2).setVisible(true);
    this.laser.lineStyle(firing ? 4 : 2, firing ? 0xf43f5e : 0xfb7185, firing ? 0.95 : 0.5);
    this.laser.lineBetween(origin.x, origin.y, target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2);

    if (!firing || this.runState.energy <= 0) {
      this.setLaserSound(false);
      return;
    }

    this.setLaserSound(true);
    this.runState.energy = Math.max(0, this.runState.energy - this.effectiveStats.energyCostPerSec * delta);
    target.health -= this.effectiveStats.miningDamagePerSec * delta;
    this.updateCrackOverlay(target);

    if (target.health <= 0) {
      const destroyedType = target.type;
      this.mineTile(target);
      this.playBlockBreakSound(destroyedType);
    }
  }

  private getAimWorldPoint(): Phaser.Math.Vector2 {
    const origin = this.getLaserOrigin();

    if (this.uiScene.getInputMode() === 'gamepad') {
      const gamepad = this.getGamepad();
      const aimX = gamepad ? this.axis(gamepad, 2) : 0;
      const aimY = gamepad ? this.axis(gamepad, 3) : 0;
      if (Math.hypot(aimX, aimY) > 0.22) this.gamepadAim.set(aimX, aimY).normalize();
      this.currentAimWorld.set(
        origin.x + this.gamepadAim.x * this.effectiveStats.miningRange,
        origin.y + this.gamepadAim.y * this.effectiveStats.miningRange,
      );
      return this.currentAimWorld;
    }

    if (this.uiScene.isAiming()) {
      const aim = this.uiScene.getAimVector();
      this.currentAimWorld.set(
        origin.x + aim.x * this.effectiveStats.miningRange,
        origin.y + aim.y * this.effectiveStats.miningRange,
      );
      return this.currentAimWorld;
    }

    if (this.uiScene.getInputMode() === 'desktop') {
      const pointer = this.input.activePointer;
      this.currentAimWorld.copy(pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2);
    }
    return this.currentAimWorld;
  }

  private isMiningPressed(): boolean {
    if (this.gameplayInputBlocked) return false;
    const mode = this.uiScene.getInputMode();
    if (mode === 'touch') return this.uiScene.isAiming();
    if (mode === 'gamepad') {
      const gamepad = this.getGamepad();
      return this.button(gamepad, 7) || this.button(gamepad, 5);
    }
    const pointer = this.input.activePointer;
    return pointer.isDown;
  }

  private findFirstMineableTile(aimWorld: Phaser.Math.Vector2): TileCell | undefined {
    const origin = this.getLaserOrigin();
    const dir = aimWorld.clone().subtract(origin);
    if (dir.lengthSq() <= 1) return undefined;
    dir.normalize();

    for (let distance = 8; distance <= this.effectiveStats.miningRange; distance += 8) {
      const x = origin.x + dir.x * distance;
      const y = origin.y + dir.y * distance;
      const cell = this.level.tiles.get(tileKey(worldToTile(x), worldToTile(y)));
      if (cell?.type && cell.type !== 'air') {
        return cell.type === 'bedrock' ? undefined : cell;
      }
    }
    return undefined;
  }

  private getLaserOrigin(): Phaser.Math.Vector2 {
    return this.laserOrigin.set(this.player.x, this.player.y + PLAYER_SIZE.h * 0.18);
  }

  private setLaserSound(active: boolean): void {
    if (!this.laserSound) return;
    if (active) {
      if (!this.laserSound.isPlaying) this.laserSound.play();
      return;
    }
    if (this.laserSound.isPlaying) this.laserSound.stop();
  }

  private updateCrackOverlay(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const damage = Phaser.Math.Clamp(1 - cell.health / cell.maxHealth, 0, 1);
    const stage = Math.min(4, Math.max(1, Math.ceil(damage * 4)));
    let overlay = this.crackOverlays.get(key);

    if (!overlay) {
      overlay = this.add
        .image(cell.x * TILE_SIZE + TILE_SIZE / 2, cell.y * TILE_SIZE + TILE_SIZE / 2, `crack-${stage}`)
        .setOrigin(0.5)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setDepth(6);
      this.crackOverlays.set(key, overlay);
      return;
    }

    overlay.setTexture(`crack-${stage}`);
  }

  private mineTile(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const localX = cell.x - this.mapOffsetX;
    const localY = cell.y - this.mapOffsetY;
    this.tilemap?.putTileAt(-1, localX, localY, false, this.tileLayer);
    this.crackOverlays.get(key)?.destroy();
    this.crackOverlays.delete(key);

    if (isResourceTile(cell.type)) {
      addItem(this.runState.cargo, cell.type as ItemId, 1);
      this.save.profile.stats.resourcesMined += 1;
    }

    this.save.profile.stats.blocksMined += 1;
    this.save.activeRun = this.runState;
    saveGame(this.save);

    cell.type = 'air';
    cell.health = 0;
    this.level.resources.delete(key);
  }

  private playBlockBreakSound(type: TileType): void {
    const isGemBreak = isResourceTile(type);
    this.sound.play(isGemBreak ? 'block-break-gem' : 'block-break-dirt', {
      volume: isGemBreak ? 0.52 : 0.42,
      detune: Phaser.Math.Between(-45, 45),
    });
  }

  private updateAnimation(deltaMs: number): void {
    if (this.isMiningPressed()) {
      const aim = this.getAimWorldPoint();
      if (Math.abs(aim.x - this.player.x) > 10) this.facing = aim.x >= this.player.x ? 'east' : 'west';
    } else if (Math.abs(this.velocity.x) > 1) {
      this.facing = this.velocity.x > 0 ? 'east' : 'west';
    }

    this.walkTimer += deltaMs;
    if (this.walkTimer > 120) {
      this.walkFrame += 1;
      this.walkTimer = 0;
    }

    const airborne = this.gravityEnabled && !this.grounded;
    const moving = Math.abs(this.velocity.x) > 1 || (!this.gravityEnabled && Math.abs(this.velocity.y) > 1);
    const prefix = airborne ? 'player-jump' : moving ? 'player-walk' : 'player-idle';
    const frame = airborne ? (this.velocity.y < 0 ? 0 : 1) : this.walkFrame % (moving ? 6 : 4);
    this.player.setTexture(`${prefix}-${frame}`).setFlipX(this.facing === 'west');

    if (!airborne && moving && this.grounded && (frame === 1 || frame === 4) && frame !== this.lastFootstepFrame) {
      this.playFootstep();
      this.lastFootstepFrame = frame;
    } else if (!moving || !this.grounded) {
      this.lastFootstepFrame = -1;
    }
  }

  private playFootstep(): void {
    this.walkSoundIndex = (this.walkSoundIndex % 3) + 1;
    this.sound.play(`walk-${this.walkSoundIndex}`, {
      volume: 0.16,
      detune: Phaser.Math.Between(-30, 30),
    });
  }

  private getGamepad(): Gamepad | undefined {
    return navigator.getGamepads?.().find((pad): pad is Gamepad => Boolean(pad)) ?? undefined;
  }

  private axis(gamepad: Gamepad | undefined, index: number): number {
    const value = gamepad?.axes[index] ?? 0;
    return Math.abs(value) < 0.18 ? 0 : value;
  }

  private button(gamepad: Gamepad | undefined, index: number): boolean {
    const button = gamepad?.buttons[index];
    return Boolean(button?.pressed || (button?.value ?? 0) > 0.35);
  }

  private inputStrength(mode: InputMode, touchAxis: number, gamepadAxis: number, direction: -1 | 1): number {
    if (mode === 'touch') return Math.max(0.45, Math.abs(touchAxis));
    if (mode === 'gamepad') return Math.max(0.45, Math.abs(gamepadAxis));
    return direction ? 1 : 0;
  }

  private updateHud(): void {
    const tile = this.miningTarget;
    const inputMode = this.uiScene.getInputMode();
    const controls = inputMode === 'touch'
      ? 'Touch: linker Stick laufen/springen · rechter Stick zielen & minen'
      : inputMode === 'gamepad'
        ? 'Gamepad: Left Stick laufen · A springen · Right Stick zielen · RT/RB minen'
        : 'Desktop: A/D laufen · W/Space springen · Maus Laser · G Gravity · R Seed';
    const hudState: HudState = {
      title: 'GRAVITY DIG — Mobile Phaser-Port',
      planet: `Planet: ${this.level.planetName} | Seed: ${this.level.seed} | Gen: ${this.level.generationTimeMs}ms`,
      health: { current: this.runState.health, max: this.effectiveStats.maxHealth },
      energy: { current: this.runState.energy, max: this.effectiveStats.maxEnergy },
      fuel: { current: this.runState.fuel, max: 100 },
      cargo: {
        slots: this.runState.cargo.slots,
        visibleSlots: this.runState.cargo.slots.length,
        stackLimit: this.runState.cargo.stackLimit,
      },
      debug: controls,
      zoom: `Zoom: ${this.cameras.main.zoom.toFixed(2)} (Offset: ${this.debugZoomOffset >= 0 ? '+' : ''}${this.debugZoomOffset.toFixed(2)})`,
      target: tile ? `Target: ${tile.type} (${Math.max(0, Math.ceil(tile.health))}/${tile.maxHealth}) @ ${tile.x},${tile.y}` : 'Target: keines in Reichweite',
      inputMode,
    };
    this.game.events.emit('hud:update', hudState);
  }

  private updateRunRecovery(delta: number): void {
    if (this.isMiningPressed()) return;
    this.runState.energy = Math.min(this.effectiveStats.maxEnergy, this.runState.energy + this.effectiveStats.energyRegenPerSec * delta);
  }

  private tryReturnCargoToShip(): void {
    if (!this.isAtShipDock()) {
      this.showShipMessage('Zu weit vom Schiff entfernt');
      return;
    }

    const cargo = this.runState.cargo.slots.filter((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (cargo.length === 0) {
      this.runState.energy = this.effectiveStats.maxEnergy;
      this.save.activeRun = this.runState;
      saveGame(this.save);
      this.showShipMessage('Schiffsdock: Energie aufgefüllt');
      return;
    }

    let credits = 0;
    let transferred = 0;
    for (const slot of cargo) {
      if (!slot.itemId) continue;
      const itemId = slot.itemId;
      const definition = ITEM_DEFINITIONS[itemId];
      const quantity = slot.quantity;
      addItem(this.save.profile.inventory, itemId, quantity);
      credits += definition.value * quantity;
      transferred += quantity;
      delete slot.itemId;
      slot.quantity = 0;
    }

    this.save.profile.credits += credits;
    this.save.profile.stats.creditsEarned += credits;
    this.runState.energy = this.effectiveStats.maxEnergy;
    this.save.activeRun = this.runState;
    saveGame(this.save);
    this.showShipMessage(`Cargo gesichert: ${transferred} Items · +${credits} Credits`);
  }

  private updateShipPrompt(deltaMs: number): void {
    if (!this.shipPrompt) return;
    this.lastCargoReturnTimer = Math.max(0, this.lastCargoReturnTimer - deltaMs);

    const atDock = this.isAtShipDock();
    const hasCargo = this.runState.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    const message = this.lastCargoReturnTimer > 0
      ? this.lastCargoReturnMessage
      : atDock
        ? `${hasCargo ? 'E: Cargo sichern & verkaufen' : 'E: Energie am Schiff auffüllen'} · Credits: ${this.save.profile.credits}`
        : '';

    this.shipPrompt
      .setText(message)
      .setPosition(this.player.x, this.player.y - PLAYER_SIZE.h * 0.9)
      .setVisible(Boolean(message));
  }

  private showShipMessage(message: string): void {
    this.lastCargoReturnMessage = message;
    this.lastCargoReturnTimer = 2200;
  }

  private isAtShipDock(): boolean {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y) <= SHIP_DOCK_RADIUS;
  }

  private updateSaveTimer(deltaMs: number): void {
    this.saveTimer += deltaMs;
    if (this.saveTimer < 1000) return;

    this.saveTimer = 0;
    this.save.activeRun = this.runState;
    saveGame(this.save);
  }
}

