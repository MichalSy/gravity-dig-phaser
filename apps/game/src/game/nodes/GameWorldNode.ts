import Phaser from 'phaser';
import { GameNode, type NodeContext } from '../../nodes';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';
import { createGameWorldData, type GameWorldData } from '../nodeData';
import { WorldView } from '../world/WorldView';
import { spawnToWorld, worldBoundsForLevel } from '../world/worldGeometry';
import { CameraZoomNode } from './CameraZoomNode';
import { LevelNode } from './LevelNode';
import { MiningToolNode } from './MiningToolNode';
import { PlayerNode } from './PlayerNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class GameWorldNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private playerNode!: PlayerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  private worldView!: WorldView;
  override readonly dependencies = ['level', 'playerState', 'player', 'miningTool', 'cameraZoom'] as const;
  readonly data: GameWorldData = createGameWorldData();

  constructor() {
    super({ name: 'world', order: 5, className: 'GameWorldNode' });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.worldView = new WorldView(this.phaserScene);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.playerNode = this.requireNode<PlayerNode>('player');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
    this.createLevel();
  }

  destroy(): void {
    this.clearSceneObjects();
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

    this.data.sceneObjects.push(...this.worldView.createDecorations(this.data.level));
    this.spawnPlayer();

    emitGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.data.level);
  }

  private clearSceneObjects(): void {
    for (const object of this.data.sceneObjects) object.destroy();
    this.data.sceneObjects.length = 0;
  }

  private spawnPlayer(): void {
    const spawn = spawnToWorld(this.level);
    this.data.player = this.playerNode.spawnAt(spawn.x, spawn.y);

    const bounds = worldBoundsForLevel(this.level);
    this.phaserScene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.phaserScene.cameras.main.setRoundPixels(true);
    this.phaserScene.cameras.main.startFollow(this.data.player, true, 0.18, 0.18);
    this.cameraZoom.updateCameraZoom();
  }
}
