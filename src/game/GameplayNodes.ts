import Phaser from 'phaser';
import { PLAYER_SIZE, TILE_SIZE } from '../config/gameConfig';
import { GameNode, type NodeContext } from '../nodes';
import type { HudState } from '../ui/HudState';
import type { UIScene } from '../scenes/UIScene';
import { worldToTile } from '../utils/tileMath';
import type { LevelData } from './level';
import { LevelNode } from './LevelNodes';
import { MiningToolNode } from './MiningToolNode';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

type Facing = 'east' | 'west';

const START_TUNNEL_LEFT_TILE = -10;
const START_TUNNEL_TOP_TILE = -2;
const START_TUNNEL_WIDTH_TILES = 12;
const START_TUNNEL_HEIGHT_TILES = 6;
const SHIP_DOCK_CENTER_X = -3 * TILE_SIZE;
const SHIP_DOCK_CENTER_Y = 2 * TILE_SIZE;
const SHIP_DOCK_RADIUS = TILE_SIZE * 2.35;

export class CameraZoomNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private playerController!: PlayerControllerNode;
  private debugZoomOffset = 0;

  constructor() {
    super({ name: 'cameraZoom', order: 1 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.input.on('wheel', this.handleDebugZoomWheel, this);
    this.phaserScene.scale.on('resize', this.updateCameraZoom, this);
  }

  resolve(): void {
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
  }

  destroy(): void {
    this.phaserScene.input.off('wheel', this.handleDebugZoomWheel, this);
    this.phaserScene.scale.off('resize', this.updateCameraZoom, this);
  }

  get zoomLabel(): string {
    const offset = this.debugZoomOffset >= 0 ? `+${this.debugZoomOffset.toFixed(2)}` : this.debugZoomOffset.toFixed(2);
    return `Zoom: ${this.phaserScene.cameras.main.zoom.toFixed(2)} (Offset: ${offset})`;
  }

  updateCameraZoom(): void {
    const baseZoom = 1;
    this.phaserScene.cameras.main.setZoom(Phaser.Math.Clamp(baseZoom + this.debugZoomOffset, 0.65, 5));
  }

  private handleDebugZoomWheel(_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    if (this.playerController.inputBlocked) return;
    this.debugZoomOffset = Phaser.Math.Clamp(this.debugZoomOffset + (deltaY > 0 ? -0.15 : 0.15), -1.2, 2.5);
    this.updateCameraZoom();
  }
}

export class GameWorldNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private playerController!: PlayerControllerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  private currentLevel?: LevelData;
  private playerObject?: Phaser.GameObjects.Image;
  private readonly startDecor: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ name: 'world', order: 5 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
    this.createLevel();
  }

  destroy(): void {
    this.clearSceneObjects();
    this.playerObject?.destroy();
    this.playerObject = undefined;
  }

  get level(): LevelData {
    if (!this.currentLevel) throw new Error('Level has not been created yet');
    return this.currentLevel;
  }

  get player(): Phaser.GameObjects.Image {
    if (!this.playerObject) throw new Error('Player has not been created yet');
    return this.playerObject;
  }

  createLevel(seed = this.playerState.getActiveRunSeed('gravity-dig-phaser'), restoreActiveRun = true): void {
    this.clearSceneObjects();

    this.currentLevel = this.levelNode.generate(seed);
    this.miningTool.resetForLevel();
    this.playerState.startRun(this.currentLevel.planetId, String(seed), restoreActiveRun);

    this.addBackground();
    this.addStartTunnelBackground();
    this.addShip();
    this.addCoreMarker();
    this.addPlayer();

    this.phaserScene.game.events.emit('world:level-created', this.currentLevel);
  }

  private clearSceneObjects(): void {
    for (const object of this.startDecor) object.destroy();
    this.startDecor.length = 0;
  }

  private addBackground(): void {
    const stars = this.phaserScene.add.graphics().setDepth(-19).setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(this.level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
    this.startDecor.push(stars);
  }

  private addStartTunnelBackground(): void {
    const tunnelLeftX = START_TUNNEL_LEFT_TILE * TILE_SIZE;
    const tunnelTopY = (START_TUNNEL_TOP_TILE + 1) * TILE_SIZE;
    const tunnelWidth = (START_TUNNEL_WIDTH_TILES - 1) * TILE_SIZE;
    const tunnelHeight = (START_TUNNEL_HEIGHT_TILES - 2) * TILE_SIZE;

    const background = this.phaserScene.add
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

    const ship = this.phaserScene.add
      .image(shipCenterX, shipBottomY, 'ship')
      .setOrigin(0.5, 1)
      .setDepth(8)
      .setDisplaySize(TILE_SIZE * 5.71, TILE_SIZE * 3.5)
      .setAlpha(0.96);

    this.startDecor.push(ship);
  }

  private addCoreMarker(): void {
    const { x, y, radius } = this.level.core;
    this.startDecor.push(
      this.phaserScene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, radius * TILE_SIZE, 0x7c3aed, 0.08).setDepth(1),
      this.phaserScene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 18, 0xf0abfc, 0.85).setDepth(5),
    );
  }

  private addPlayer(): void {
    const spawnX = this.level.spawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = this.level.spawn.y * TILE_SIZE + TILE_SIZE / 2;

    this.playerObject?.destroy();
    this.playerObject = this.phaserScene.add.image(spawnX, spawnY, 'player-idle-0').setDepth(20).setScale(0.9);
    this.playerController.setPlayer(this.playerObject);

    const worldLeft = -10 * TILE_SIZE;
    const worldTop = (-this.level.heightDown - 1) * TILE_SIZE;
    const worldWidth = (this.level.width + 12) * TILE_SIZE;
    const worldHeight = (this.level.heightUp + this.level.heightDown + 2) * TILE_SIZE;
    this.phaserScene.cameras.main.setBounds(worldLeft, worldTop, worldWidth, worldHeight);
    this.phaserScene.cameras.main.setRoundPixels(true);
    this.phaserScene.cameras.main.startFollow(this.playerObject, true, 0.18, 0.18);
    this.cameraZoom.updateCameraZoom();
  }
}

export class PlayerPresentationNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerController!: PlayerControllerNode;
  private miningTool!: MiningToolNode;
  private facing: Facing = 'east';
  private walkTimer = 0;
  private walkFrame = 0;
  private walkSoundIndex = 0;
  private lastFootstepFrame = -1;

  constructor() {
    super({ name: 'playerPresentation', order: 30 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
  }

  update(deltaMs: number): void {
    const player = this.world.player;
    if (this.miningTool.isMiningPressed()) {
      const aim = this.miningTool.getAimWorldPoint();
      if (Math.abs(aim.x - player.x) > 10) this.facing = aim.x >= player.x ? 'east' : 'west';
    } else if (Math.abs(this.playerController.velocity.x) > 1) {
      this.facing = this.playerController.velocity.x > 0 ? 'east' : 'west';
    }

    this.walkTimer += deltaMs;
    if (this.walkTimer > 120) {
      this.walkFrame += 1;
      this.walkTimer = 0;
    }

    const airborne = this.playerController.gravityEnabled && !this.playerController.grounded;
    const moving = Math.abs(this.playerController.velocity.x) > 1 || (!this.playerController.gravityEnabled && Math.abs(this.playerController.velocity.y) > 1);
    const prefix = airborne ? 'player-jump' : moving ? 'player-walk' : 'player-idle';
    const frame = airborne ? (this.playerController.velocity.y < 0 ? 0 : 1) : this.walkFrame % (moving ? 6 : 4);
    player.setTexture(`${prefix}-${frame}`).setFlipX(this.facing === 'west');

    if (!airborne && moving && this.playerController.grounded && (frame === 1 || frame === 4) && frame !== this.lastFootstepFrame) {
      this.playFootstep();
      this.lastFootstepFrame = frame;
    } else if (!moving || !this.playerController.grounded) {
      this.lastFootstepFrame = -1;
    }
  }

  private playFootstep(): void {
    this.walkSoundIndex = (this.walkSoundIndex % 3) + 1;
    this.phaserScene.sound.play(`walk-${this.walkSoundIndex}`, {
      volume: 0.16,
      detune: Phaser.Math.Between(-30, 30),
    });
  }
}

export class CollisionDebugNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private levelNode!: LevelNode;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  private enabled = false;

  constructor() {
    super({ name: 'collisionDebug', order: 40 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.debugGraphics = this.phaserScene.add.graphics().setDepth(45);
    this.phaserScene.game.events.on('debug:collision', this.setEnabled, this);
    this.phaserScene.game.events.on('world:level-created', this.resetForLevel, this);
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.levelNode = this.requireNode<LevelNode>('level');
  }

  destroy(): void {
    this.phaserScene.game.events.off('debug:collision', this.setEnabled, this);
    this.phaserScene.game.events.off('world:level-created', this.resetForLevel, this);
    this.debugGraphics?.destroy();
  }

  update(): void {
    if (!this.debugGraphics) return;
    this.debugGraphics.clear();
    if (!this.enabled) return;

    const player = this.world.player;
    const halfW = PLAYER_SIZE.w / 2;
    const halfH = PLAYER_SIZE.h / 2;
    const left = player.x - halfW;
    const top = player.y - halfH;
    const probes = this.levelNode.getBoxProbePoints(player.x, player.y, PLAYER_SIZE.w, PLAYER_SIZE.h);

    this.debugGraphics.lineStyle(2, 0x22c55e, 1);
    this.debugGraphics.strokeRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);
    this.debugGraphics.fillStyle(0x22c55e, 0.35);
    this.debugGraphics.fillRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);

    for (const [x, y] of probes) {
      const hit = this.levelNode.isSolidAtWorld(x, y);
      this.debugGraphics.fillStyle(hit ? 0xef4444 : 0xfacc15, 1);
      this.debugGraphics.fillCircle(x, y, 4);
    }

    const minTx = worldToTile(player.x - TILE_SIZE * 2);
    const maxTx = worldToTile(player.x + TILE_SIZE * 2);
    const minTy = worldToTile(player.y - TILE_SIZE * 2);
    const maxTy = worldToTile(player.y + TILE_SIZE * 2);
    this.debugGraphics.lineStyle(1, 0xef4444, 0.5);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const cell = this.levelNode.getCell(tx, ty);
        if (!cell || cell.type === 'air') continue;
        this.debugGraphics.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.debugGraphics?.clear();
  }

  private resetForLevel(): void {
    this.debugGraphics?.clear();
  }
}

export class HudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;

  constructor() {
    super({ name: 'hud', order: 60 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
  }

  update(): void {
    const uiScene = this.uiScene;
    const tile = this.miningTool.target;
    const inputMode = uiScene.getInputMode();
    const controls = inputMode === 'touch'
      ? 'Touch: linker Stick laufen/springen · rechter Stick zielen & minen'
      : inputMode === 'gamepad'
        ? 'Gamepad: Left Stick laufen · A springen · Right Stick zielen · RT/RB minen'
        : 'Desktop: A/D laufen · W/Space springen · Maus Laser · G Gravity · R Seed';
    const hudState: HudState = {
      title: 'GRAVITY DIG — Mobile Phaser-Port',
      planet: `Planet: ${this.world.level.planetName} | Seed: ${this.world.level.seed} | Gen: ${this.world.level.generationTimeMs}ms`,
      health: { current: this.playerState.run.health, max: this.playerState.stats.maxHealth },
      energy: { current: this.playerState.run.energy, max: this.playerState.stats.maxEnergy },
      fuel: { current: this.playerState.run.fuel, max: 100 },
      cargo: {
        slots: this.playerState.run.cargo.slots,
        visibleSlots: this.playerState.run.cargo.slots.length,
        stackLimit: this.playerState.run.cargo.stackLimit,
      },
      debug: controls,
      zoom: this.cameraZoom.zoomLabel,
      target: tile ? `Target: ${tile.type} (${Math.max(0, Math.ceil(tile.health))}/${tile.maxHealth}) @ ${tile.x},${tile.y}` : 'Target: keines in Reichweite',
      inputMode,
    };
    this.phaserScene.game.events.emit('hud:update', hudState);
  }

  private get uiScene(): UIScene {
    return this.phaserScene.scene.get('ui') as UIScene;
  }
}

export class RunRecoveryNode extends GameNode {
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;

  constructor() {
    super({ name: 'runRecovery', order: 50 });
  }

  resolve(): void {
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
  }

  update(deltaMs: number): void {
    if (this.miningTool.isMiningPressed()) return;
    this.playerState.recoverEnergy(deltaMs / 1000);
  }
}

export class ShipDockNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private shipPrompt?: Phaser.GameObjects.Text;
  private lastCargoReturnMessage = '';
  private lastCargoReturnTimer = 0;

  constructor() {
    super({ name: 'shipDock', order: 80 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.game.events.on('ship:return-cargo', this.tryReturnCargoToShip, this);
    this.phaserScene.game.events.on('world:level-created', this.resetPrompt, this);
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.resetPrompt();
  }

  destroy(): void {
    this.phaserScene.game.events.off('ship:return-cargo', this.tryReturnCargoToShip, this);
    this.phaserScene.game.events.off('world:level-created', this.resetPrompt, this);
    this.shipPrompt?.destroy();
  }

  update(deltaMs: number): void {
    if (!this.shipPrompt) this.resetPrompt();
    if (!this.shipPrompt) return;

    this.lastCargoReturnTimer = Math.max(0, this.lastCargoReturnTimer - deltaMs);
    const atDock = this.isAtShipDock();
    const hasCargo = this.playerState.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
    const message = this.lastCargoReturnTimer > 0
      ? this.lastCargoReturnMessage
      : atDock
        ? `${hasCargo ? 'E: Cargo sichern & verkaufen' : 'E: Energie am Schiff auffüllen'} · Credits: ${this.playerState.save.profile.credits}`
        : '';

    this.shipPrompt
      .setText(message)
      .setPosition(this.world.player.x, this.world.player.y - PLAYER_SIZE.h * 0.9)
      .setVisible(Boolean(message));
  }

  private resetPrompt(): void {
    if (!this.world) return;
    this.shipPrompt?.destroy();
    this.shipPrompt = this.phaserScene.add
      .text(this.world.player.x, this.world.player.y - PLAYER_SIZE.h, '', {
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
  }

  private tryReturnCargoToShip(): void {
    if (!this.isAtShipDock()) {
      this.showShipMessage('Zu weit vom Schiff entfernt');
      return;
    }

    const result = this.playerState.returnCargoToShip();
    this.showShipMessage(result.message);
  }

  private showShipMessage(message: string): void {
    this.lastCargoReturnMessage = message;
    this.lastCargoReturnTimer = 2200;
  }

  private isAtShipDock(): boolean {
    return Phaser.Math.Distance.Between(this.world.player.x, this.world.player.y, SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y) <= SHIP_DOCK_RADIUS;
  }
}

export class AutoSaveNode extends GameNode {
  private playerState!: PlayerStateManagerNode;
  private saveTimer = 0;

  constructor() {
    super({ name: 'autoSave', order: 90 });
  }

  resolve(): void {
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
  }

  update(deltaMs: number): void {
    this.saveTimer += deltaMs;
    if (this.saveTimer < 1000) return;

    this.saveTimer = 0;
    this.playerState.saveActiveRun();
  }
}
