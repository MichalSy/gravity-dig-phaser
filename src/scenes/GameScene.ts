import Phaser from 'phaser';
import {
  ENERGY_COST_PER_SEC,
  ENERGY_REGEN_PER_SEC,
  GAME_HEIGHT,
  GAME_WIDTH,
  GRAVITY,
  JUMP_VELOCITY,
  MINING_DAMAGE_PER_SEC,
  MINING_RANGE,
  PLAYER_SIZE,
  PLAYER_SPEED,
  TILE_SIZE,
} from '../config/gameConfig';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import {
  GravityDigLevelGenerator,
  type LevelData,
  type PlanetConfig,
  type TileCell,
  type TileType,
  isResourceTile,
} from '../game/level';
import { requestLandscapeLock } from '../utils/screen';
import { atlasFrame, tileKey, worldToTile } from '../utils/tileMath';

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;
type Facing = 'east' | 'west' | 'south';

export class GameScene extends Phaser.Scene {
  private generator = new GravityDigLevelGenerator();
  private level!: LevelData;
  private tileSprites = new Map<string, Phaser.GameObjects.Image>();
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
  private health = 100;
  private energy = 100;
  private inventory = new Map<TileType, number>();
  private miningTarget?: TileCell;
  private laser!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private targetMarker!: Phaser.GameObjects.Rectangle;
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private currentAimWorld = new Phaser.Math.Vector2(1, 0);

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.spritesheet('tiles', '/assets/tilesets/atlas/tiles_atlas.png', {
      frameWidth: TILE_SIZE,
      frameHeight: TILE_SIZE,
    });
    this.load.image('bg-game', '/assets/tilesets/bg/bg_game.png');
    this.load.image('ship', '/assets/tilesets/ships/ship_exterior.png');
    this.load.image('laser-dot', '/assets/effects/laser_beam.png');
    this.load.image('title-logo', '/assets/tilesets/ui/title_logo.png');
    this.load.json('dev-planet', '/config/planets/dev_planet.json');

    for (const dir of ['east', 'west', 'south'] as const) {
      for (let i = 0; i < 6; i += 1) {
        this.load.image(`player-walk-${dir}-${i}`, `/assets/character/animations/walk/${dir}/frame_${String(i).padStart(3, '0')}.png`);
      }
      for (let i = 0; i < 4; i += 1) {
        this.load.image(
          `player-idle-${dir}-${i}`,
          `/assets/character/animations/breathing-idle/${dir}/frame_${String(i).padStart(3, '0')}.png`,
        );
      }
    }
  }

  create(): void {
    this.input.addPointer(3);
    this.cameras.main.setBackgroundColor('#050816');
    this.createLevel();
    this.createControls();
    this.createHud();
  }

  update(_time: number, deltaMs: number): void {
    const delta = deltaMs / 1000;
    this.handleInput(delta);
    this.applyPhysics(delta);
    this.updateMining(delta);
    this.updateAnimation(deltaMs);
    this.updateHud();
  }

  private createLevel(seed = 'gravity-dig-phaser'): void {
    for (const sprite of this.tileSprites.values()) sprite.destroy();
    this.tileSprites.clear();

    const config = this.cache.json.get('dev-planet') as PlanetConfig;
    this.level = this.generator.generate(config, 1, seed);

    this.addBackground();
    this.drawTiles();
    this.addShip();
    this.addCoreMarker();
    this.addPlayer();
    this.laser = this.add.graphics().setDepth(30);
    this.targetMarker = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE).setStrokeStyle(3, 0xf97316, 0.95).setVisible(false).setDepth(25);
  }

  private addBackground(): void {
    this.add.image(0, 0, 'bg-game').setOrigin(0.5).setScrollFactor(0.04).setScale(2.2).setDepth(-20);
    const stars = this.add.graphics().setDepth(-19).setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(this.level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
  }

  private drawTiles(): void {
    for (const cell of this.level.tiles.values()) {
      if (cell.type === 'air') continue;
      const sprite = this.add
        .image(cell.x * TILE_SIZE, cell.y * TILE_SIZE, 'tiles', atlasFrame(cell.type))
        .setOrigin(0, 0)
        .setDepth(cell.boundary ? 4 : 2);
      if (isResourceTile(cell.type)) sprite.setDepth(3).setTint(0xffffff);
      this.tileSprites.set(tileKey(cell.x, cell.y), sprite);
    }
  }

  private addShip(): void {
    this.add
      .image(-3.5 * TILE_SIZE, -3.5 * TILE_SIZE, 'ship')
      .setOrigin(0.5)
      .setDepth(8)
      .setScale(1.2)
      .setAlpha(0.92);
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
    this.player = this.add.image(spawnX, spawnY, 'player-idle-east-0').setDepth(20).setScale(0.82);
    this.velocity.set(0, 0);

    const worldLeft = -10 * TILE_SIZE;
    const worldTop = (-this.level.heightDown - 1) * TILE_SIZE;
    const worldWidth = (this.level.width + 12) * TILE_SIZE;
    const worldHeight = (this.level.heightUp + this.level.heightDown + 2) * TILE_SIZE;
    this.cameras.main.setBounds(worldLeft, worldTop, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.35);
  }

  private createControls(): void {
    if (!this.input.keyboard) throw new Error('Keyboard input unavailable');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,R,G') as Record<string, Phaser.Input.Keyboard.Key>;

    this.leftJoystick = new VirtualJoystick(this, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this, 'right', 'LASER');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      requestLandscapeLock();
      const handledLeft = this.leftJoystick.handlePointerDown(pointer);
      const handledRight = this.rightJoystick.handlePointerDown(pointer);
      if (handledLeft || handledRight) pointer.event.preventDefault();
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.leftJoystick.handlePointerMove(pointer);
      this.rightJoystick.handlePointerMove(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.leftJoystick.handlePointerUp(pointer);
      this.rightJoystick.handlePointerUp(pointer);
    });
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      this.leftJoystick.handlePointerUp(pointer);
      this.rightJoystick.handlePointerUp(pointer);
    });
  }

  private createHud(): void {
    this.hudText = this.add
      .text(18, 16, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#e2e8f0',
        backgroundColor: 'rgba(2,6,23,0.68)',
        padding: { x: 12, y: 10 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.debugText = this.add
      .text(18, GAME_HEIGHT - 90, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#93c5fd',
        backgroundColor: 'rgba(2,6,23,0.58)',
        padding: { x: 10, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 32, 'Mobile: linker Stick laufen/springen · rechter Stick zielen & minen', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#cbd5e1',
        backgroundColor: 'rgba(2,6,23,0.45)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
  }

  private handleInput(delta: number): void {
    const joy = this.leftJoystick.vector;
    const left = this.cursors.left?.isDown || this.keys.A.isDown || joy.x < -0.22;
    const right = this.cursors.right?.isDown || this.keys.D.isDown || joy.x > 0.22;
    const joyUp = joy.y < -0.56;
    const joyDown = joy.y > 0.56;
    const up = this.cursors.up?.isDown || this.keys.W.isDown || this.keys.SPACE.isDown || joyUp;
    const down = this.cursors.down?.isDown || this.keys.S.isDown || joyDown;

    this.velocity.x = 0;
    if (left) this.velocity.x -= PLAYER_SPEED * (joy.x < -0.22 ? Math.max(0.45, Math.abs(joy.x)) : 1);
    if (right) this.velocity.x += PLAYER_SPEED * (joy.x > 0.22 ? Math.max(0.45, Math.abs(joy.x)) : 1);

    if (Phaser.Input.Keyboard.JustDown(this.keys.G)) {
      this.gravityEnabled = !this.gravityEnabled;
      this.velocity.y = 0;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.createLevel(`gravity-dig-phaser-${Date.now()}`);
      return;
    }

    if (up && !this.gravityEnabled) this.velocity.y = -PLAYER_SPEED;
    if (down && !this.gravityEnabled) this.velocity.y = PLAYER_SPEED;
    if (!up && !down && !this.gravityEnabled) this.velocity.y = 0;

    const keyboardJump = Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.W);
    const touchJump = joyUp && !this.touchJumpHeld;
    this.touchJumpHeld = joyUp;

    if (keyboardJump || touchJump) {
      if (this.grounded || this.coyoteTimer > 0) {
        this.velocity.y = JUMP_VELOCITY;
        this.grounded = false;
        this.coyoteTimer = 0;
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
      this.velocity.y = JUMP_VELOCITY;
      this.jumpBufferTimer = 0;
      this.grounded = false;
    }
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
    const halfW = PLAYER_SIZE.w / 2;
    const halfH = PLAYER_SIZE.h / 2;
    const points = [
      [cx - halfW, cy - halfH],
      [cx + halfW, cy - halfH],
      [cx - halfW, cy + halfH],
      [cx + halfW, cy + halfH],
    ];
    return points.some(([x, y]) => this.isSolidAtWorld(x, y));
  }

  private isSolidAtWorld(x: number, y: number): boolean {
    const tx = worldToTile(x);
    const ty = worldToTile(y);
    const cell = this.level.tiles.get(tileKey(tx, ty));
    return !!cell && cell.type !== 'air';
  }

  private updateMining(delta: number): void {
    const aimWorld = this.getAimWorldPoint();
    const target = this.findFirstMineableTile(aimWorld);
    const firing = this.isMiningPressed();

    this.laser.clear();
    this.targetMarker.setVisible(false);
    this.miningTarget = target;

    if (!target) return;

    this.targetMarker.setPosition(target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2).setVisible(true);
    this.laser.lineStyle(firing ? 4 : 2, firing ? 0xf43f5e : 0xfb7185, firing ? 0.95 : 0.5);
    this.laser.lineBetween(this.player.x, this.player.y - 8, target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2);

    if (!firing || this.energy <= 0) return;

    this.energy = Math.max(0, this.energy - ENERGY_COST_PER_SEC * delta);
    target.health -= MINING_DAMAGE_PER_SEC * delta;
    const sprite = this.tileSprites.get(tileKey(target.x, target.y));
    if (sprite) sprite.setAlpha(Math.max(0.25, target.health / target.maxHealth));

    if (target.health <= 0) {
      this.mineTile(target);
    }
  }

  private getAimWorldPoint(): Phaser.Math.Vector2 {
    if (this.rightJoystick.active) {
      this.currentAimWorld.set(
        this.player.x + this.rightJoystick.aim.x * MINING_RANGE,
        this.player.y + this.rightJoystick.aim.y * MINING_RANGE,
      );
      return this.currentAimWorld;
    }

    const pointer = this.input.activePointer;
    this.currentAimWorld.copy(pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2);
    return this.currentAimWorld;
  }

  private isMiningPressed(): boolean {
    if (this.rightJoystick.active) return true;
    const pointer = this.input.activePointer;
    return pointer.isDown && !this.leftJoystick.contains(pointer) && !this.rightJoystick.contains(pointer);
  }

  private findFirstMineableTile(aimWorld: Phaser.Math.Vector2): TileCell | undefined {
    const origin = new Phaser.Math.Vector2(this.player.x, this.player.y - 8);
    const dir = aimWorld.clone().subtract(origin);
    if (dir.lengthSq() <= 1) return undefined;
    dir.normalize();

    for (let distance = 8; distance <= MINING_RANGE; distance += 8) {
      const x = origin.x + dir.x * distance;
      const y = origin.y + dir.y * distance;
      const cell = this.level.tiles.get(tileKey(worldToTile(x), worldToTile(y)));
      if (cell?.type && cell.type !== 'air') {
        return cell.type === 'bedrock' ? undefined : cell;
      }
    }
    return undefined;
  }

  private mineTile(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const sprite = this.tileSprites.get(key);
    if (sprite) {
      sprite.destroy();
      this.tileSprites.delete(key);
    }

    if (isResourceTile(cell.type)) {
      this.inventory.set(cell.type, (this.inventory.get(cell.type) ?? 0) + 1);
    }

    cell.type = 'air';
    cell.health = 0;
    this.level.resources.delete(key);
  }

  private updateAnimation(deltaMs: number): void {
    const aim = this.getAimWorldPoint();
    if (Math.abs(aim.x - this.player.x) > 10) this.facing = aim.x >= this.player.x ? 'east' : 'west';

    this.walkTimer += deltaMs;
    if (this.walkTimer > 120) {
      this.walkFrame += 1;
      this.walkTimer = 0;
    }

    const moving = Math.abs(this.velocity.x) > 1 || (!this.gravityEnabled && Math.abs(this.velocity.y) > 1);
    const prefix = moving ? 'player-walk' : 'player-idle';
    const frameCount = moving ? 6 : 4;
    const frame = this.walkFrame % frameCount;
    this.player.setTexture(`${prefix}-${this.facing}-${frame}`);
  }

  private updateHud(): void {
    if (!this.isMiningPressed()) this.energy = Math.min(100, this.energy + ENERGY_REGEN_PER_SEC / 60);
    const tile = this.miningTarget;
    const inv = [...this.inventory.entries()].map(([k, v]) => `${k}:${v}`).join('  ') || 'leer';
    this.hudText.setText([
      `GRAVITY DIG — Mobile Phaser-Port`,
      `Planet: ${this.level.planetName} | Seed: ${this.level.seed} | Gen: ${this.level.generationTimeMs}ms`,
      `Health: ${this.health}  Energy: ${Math.round(this.energy)}  Gravity: ${this.gravityEnabled ? 'ON' : 'OFF'}`,
      `Inventar: ${inv}`,
    ]);

    this.debugText.setText([
      `Desktop: A/D laufen · W/Space springen · Maus Laser · G Gravity · R Seed`,
      tile ? `Target: ${tile.type} (${Math.max(0, Math.ceil(tile.health))}/${tile.maxHealth}) @ ${tile.x},${tile.y}` : 'Target: keines in Reichweite',
    ]);
  }
}
