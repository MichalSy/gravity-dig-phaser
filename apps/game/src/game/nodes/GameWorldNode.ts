import Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';
import { createGameWorldData, type GameWorldData } from '../nodeData';
import { WorldView } from '../world/WorldView';
import { spawnToWorld, worldBoundsForLevel } from '../world/worldGeometry';
import { LevelNode } from './LevelNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export interface GameWorldNodeOptions extends GameNodeOptions {
  instantiatePrefab(path: string): GameNode;
}

export class GameWorldNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.GameWorldNode;

  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private playerInstance?: GameNode;
  private worldView!: WorldView;
  private readonly instantiatePrefab: (path: string) => GameNode;
  override readonly dependencies = ['Level', 'PlayerState'] as const;
  readonly data: GameWorldData = createGameWorldData();

  constructor(options: GameWorldNodeOptions) {
    super({ name: 'World', className: 'GameWorldNode', ...options });
    this.instantiatePrefab = options.instantiatePrefab;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.worldView = new WorldView(this.phaserScene);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('Level');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
  }

  afterResolved(): void {
    if (!this.data.level) this.createLevel(undefined, false);
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    const [sky, tunnel, coreOuter, coreInner] = this.data.sceneObjects;
    const [backwall, foreground] = this.levelNode?.getSceneObjects() ?? [];
    return [sky, backwall, tunnel, foreground, coreOuter, coreInner, ...super.getSceneObjectsInHierarchy()]
      .filter((object): object is Phaser.GameObjects.GameObject => object !== undefined);
  }

  destroy(): void {
    this.clearSceneObjects();
    this.destroyPlayer();
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
    this.destroyPlayer();

    this.data.level = this.levelNode.generate(seed);
    this.playerState.startRun(this.data.level.planetId, String(seed), restoreActiveRun);
    this.data.sceneObjects.push(...this.worldView.createDecorations(this.data.level));
    this.spawnPlayer();

    const miningTool = findNode(this.playerInstance, 'MiningTool') as unknown as ScriptMethodTarget;
    miningTool.callScriptMethod('resetForLevel');
    emitGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.data.level);
  }

  private clearSceneObjects(): void {
    for (const object of this.data.sceneObjects) object.destroy();
    this.data.sceneObjects.length = 0;
  }

  private spawnPlayer(): void {
    const spawn = spawnToWorld(this.level);
    this.playerInstance = this.addChild(this.instantiatePrefab('prefabs/player.prefab.json'));
    const movement = findNode(this.playerInstance, 'PlayerMovementController') as unknown as ScriptMethodTarget;
    this.data.player = movement.callScriptMethod('spawnAt', spawn.x, spawn.y) as Phaser.GameObjects.Image;

    const bounds = worldBoundsForLevel(this.level);
    this.phaserScene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.phaserScene.cameras.main.setRoundPixels(true);
    this.phaserScene.cameras.main.setZoom(1);
    this.phaserScene.cameras.main.startFollow(this.data.player, true, 0.18, 0.18);
  }

  private destroyPlayer(): void {
    if (!this.playerInstance) return;
    this.removeChild(this.playerInstance);
    this.playerInstance = undefined;
    this.data.player = undefined;
    this.phaserScene.cameras.main.stopFollow();
  }
}

interface ScriptMethodTarget {
  callScriptMethod(name: string, ...args: unknown[]): unknown;
}

function findNode(root: GameNode | undefined, name: string): GameNode {
  if (!root) throw new Error(`Cannot find '${name}' without a player instance`);
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findOptionalNode(child, name);
    if (found) return found;
  }
  throw new Error(`Player prefab node '${name}' was not found`);
}

function findOptionalNode(root: GameNode, name: string): GameNode | undefined {
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findOptionalNode(child, name);
    if (found) return found;
  }
  return undefined;
}
