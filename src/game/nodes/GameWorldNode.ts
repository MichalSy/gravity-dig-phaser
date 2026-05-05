import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { GameNode, type NodeContext } from '../../nodes';
import {
  START_TUNNEL_HEIGHT_TILES,
  START_TUNNEL_LEFT_TILE,
  START_TUNNEL_TOP_TILE,
  START_TUNNEL_WIDTH_TILES,
  spawnToWorld,
  worldBoundsForLevel,
} from '../gameplayLogic';
import { createGameWorldData, type GameWorldData } from '../nodeData';
import { LevelNode } from './LevelNode';
import { MiningToolNode } from './MiningToolNode';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';
import { CameraZoomNode } from './CameraZoomNode';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';

export class GameWorldNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private playerController!: PlayerControllerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  override readonly dependencies = ['level', 'playerState', 'playerController', 'miningTool', 'cameraZoom'] as const;
  readonly data: GameWorldData = createGameWorldData();

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
    this.data.player?.destroy();
    this.data.player = undefined;
  }

  get level() {
    if (!this.data.level) throw new Error('Level has not been created yet');
    return this.data.level;
  }

  get player(): Phaser.GameObjects.Image {
    if (!this.data.player) throw new Error('Player has not been created yet');
    return this.data.player;
  }

  createLevel(seed = this.playerState.getActiveRunSeed('gravity-dig-phaser'), restoreActiveRun = true): void {
    this.clearSceneObjects();

    this.data.level = this.levelNode.generate(seed);
    this.miningTool.resetForLevel();
    this.playerState.startRun(this.data.level.planetId, String(seed), restoreActiveRun);

    this.addBackground();
    this.addStartTunnelBackground();
    this.addShip();
    this.addCoreMarker();
    this.addPlayer();

    emitGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.data.level);
  }

  private clearSceneObjects(): void {
    for (const object of this.data.sceneObjects) object.destroy();
    this.data.sceneObjects.length = 0;
  }

  private addBackground(): void {
    const stars = this.phaserScene.add.graphics().setDepth(-19).setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(this.level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
    this.data.sceneObjects.push(stars);
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

    this.data.sceneObjects.push(background);
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

    this.data.sceneObjects.push(ship);
  }

  private addCoreMarker(): void {
    const { x, y, radius } = this.level.core;
    this.data.sceneObjects.push(
      this.phaserScene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, radius * TILE_SIZE, 0x7c3aed, 0.08).setDepth(1),
      this.phaserScene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 18, 0xf0abfc, 0.85).setDepth(5),
    );
  }

  private addPlayer(): void {
    const spawn = spawnToWorld(this.level);
    this.data.player?.destroy();
    this.data.player = this.phaserScene.add.image(spawn.x, spawn.y, 'player-idle-0').setDepth(20).setScale(0.9);
    this.playerController.setPlayer(this.data.player);

    const bounds = worldBoundsForLevel(this.level);
    this.phaserScene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.phaserScene.cameras.main.setRoundPixels(true);
    this.phaserScene.cameras.main.startFollow(this.data.player, true, 0.18, 0.18);
    this.cameraZoom.updateCameraZoom();
  }
}
