import Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';
import { createGameWorldData, type GameWorldData } from '../nodeData';
import { WorldView } from '../world/WorldView';
import { spawnToWorld, worldBoundsForLevel } from '../world/worldGeometry';
import { LevelNode } from './LevelNode';
import { MiningToolNode } from './MiningToolNode';
import { PlayerNode } from './PlayerNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class GameWorldNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.GameWorldNode;

  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private playerNode!: PlayerNode;
  private miningTool!: MiningToolNode;
  private worldView!: WorldView;
  override readonly dependencies = ['Level', 'PlayerState', 'Player', 'MiningTool'] as const;
  readonly data: GameWorldData = createGameWorldData();

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'World', className: 'GameWorldNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.worldView = new WorldView(this.phaserScene);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('Level');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.playerNode = this.requireNode<PlayerNode>('Player');
    this.miningTool = this.requireNode<MiningToolNode>('MiningTool');
  }

  afterResolved(): void {
    if (!this.data.level) this.createLevel();
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    const [sky, tunnel, coreOuter, coreInner] = this.data.sceneObjects;
    const [backwall, foreground] = this.levelNode?.getSceneObjects() ?? [];
    return [sky, backwall, tunnel, foreground, coreOuter, coreInner].filter((object): object is Phaser.GameObjects.GameObject => object !== undefined);
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
    this.phaserScene.cameras.main.setZoom(1);
    this.phaserScene.cameras.main.startFollow(this.data.player, true, 0.18, 0.18);
  }
}
