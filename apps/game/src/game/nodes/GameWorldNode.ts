import Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import { emitGameEvent, GAME_EVENTS } from '../gameEvents';
import { createGameWorldData, type GameWorldData } from '../nodeData';
import { CargoTransferEffects } from '../world/CargoTransferEffects';
import { MiningEffects } from '../world/MiningEffects';
import { WorldView } from '../world/WorldView';
import { spawnToWorld, worldBoundsForLevel } from '../world/worldGeometry';
import { LevelNode } from './LevelNode';
import { LootLayerNode } from './LootLayerNode';

interface PlayerStateLike {
  getActiveRunSeed(fallback: string): string;
  startRun(planetId: string, seed: string, restoreActiveRun: boolean): unknown;
  tryCollectMinedItem(itemId: string): boolean;
}

export interface GameWorldNodeOptions extends GameNodeOptions {
  instantiatePrefab(prefabId: string): GameNode;
}

export class GameWorldNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.GameWorldNode;

  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private lootLayer!: LootLayerNode;
  private playerState!: PlayerStateLike;
  private shipInstance?: GameNode;
  private playerInstance?: GameNode;
  private worldView!: WorldView;
  private miningEffects!: MiningEffects;
  private cargoTransferEffects!: CargoTransferEffects;
  private readonly instantiatePrefab: (path: string) => GameNode;
  override readonly dependencies = ['Level', 'LootLayer', 'PlayerState'] as const;
  readonly data: GameWorldData = createGameWorldData();

  constructor(options: GameWorldNodeOptions) {
    super({ name: 'World', className: 'GameWorldNode', ...options });
    this.instantiatePrefab = options.instantiatePrefab;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.worldView = new WorldView(this.phaserScene);
    this.cargoTransferEffects = new CargoTransferEffects(this.phaserScene);
    this.miningEffects = new MiningEffects(this.phaserScene, {
      collidesBox: (x, y, width, height) => Boolean(this.levelNode) && this.levelNode.collidesBox(x, y, width, height),
      getCollector: () => this.data.player,
      collectItem: (itemId) => Boolean(this.playerState) && this.playerState.tryCollectMinedItem(itemId),
      addLootObjects: (objects) => this.lootLayer.addLootObjects(objects),
    });
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('Level');
    this.lootLayer = this.requireNode<LootLayerNode>('LootLayer');
    this.playerState = this.requireNode('PlayerState') as unknown as PlayerStateLike;
  }

  afterResolved(): void {
    if (!this.data.level) this.createLevel(undefined, false);
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    const [sky, tunnel, coreOuter, coreInner] = this.data.sceneObjects;
    const [backwall, foreground] = this.levelNode?.getSceneObjects() ?? [];
    return [sky, backwall, tunnel, foreground, coreOuter, coreInner, ...this.miningEffects.getSceneObjects(), ...this.cargoTransferEffects.getSceneObjects(), ...super.getSceneObjectsInHierarchy()]
      .filter((object): object is Phaser.GameObjects.GameObject => object !== undefined);
  }

  destroy(): void {
    this.miningEffects.destroy();
    this.cargoTransferEffects.destroy();
    this.clearSceneObjects();
    this.destroyPlayer();
    this.destroyShip();
    this.data.player = undefined;
  }

  update(deltaMs: number): void {
    this.miningEffects.update(deltaMs);
    this.cargoTransferEffects.update(deltaMs);
  }

  emitMiningFragments(materialId: string, x: number, y: number, count = 3): void {
    this.miningEffects.emitFragments(materialId, x, y, count);
  }

  spawnResourceDrop(itemId: string, frame: number, x: number, y: number): void {
    this.miningEffects.spawnDrop(itemId, frame, x, y);
  }

  launchCargoTransfer(itemId: string, startScreenX: number, startScreenY: number, shipX: number, shipY: number): void {
    this.cargoTransferEffects.launch(itemId, startScreenX, startScreenY, shipX, shipY);
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
    this.miningEffects.clear();
    this.cargoTransferEffects.clear();
    this.clearSceneObjects();
    this.destroyPlayer();
    this.destroyShip();

    this.data.level = this.levelNode.generate(seed);
    this.playerState.startRun(this.data.level.planetId, String(seed), restoreActiveRun);
    this.data.sceneObjects.push(...this.worldView.createDecorations(this.data.level));
    this.spawnShip();
    this.spawnPlayer();

    const miningTool = findNode(this.playerInstance, 'MiningTool') as unknown as ScriptMethodTarget;
    miningTool.callScriptMethod('resetForLevel');
    emitGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.data.level);
  }

  private clearSceneObjects(): void {
    for (const object of this.data.sceneObjects) object.destroy();
    this.data.sceneObjects.length = 0;
  }

  private spawnShip(): void {
    this.shipInstance = this.addChild(this.instantiatePrefab('66b0a50c-1c54-5150-ae52-9ad853555e56'));
  }

  private spawnPlayer(): void {
    const spawn = spawnToWorld(this.level);
    this.playerInstance = this.addChild(this.instantiatePrefab('08a9bfce-1773-5ca0-8adc-52dc8b2e378e'));
    const movement = findNode(this.playerInstance, 'PlayerMovementController') as unknown as ScriptMethodTarget;
    this.data.player = movement.callScriptMethod('spawnAt', spawn.x, spawn.y) as Phaser.GameObjects.Image;

    const bounds = worldBoundsForLevel(this.level);
    this.phaserScene.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    this.phaserScene.cameras.main.setRoundPixels(true);
    this.phaserScene.cameras.main.setZoom(1);
    this.phaserScene.cameras.main.startFollow(this.data.player, true, 0.18, 0.18);
  }

  private destroyShip(): void {
    if (!this.shipInstance) return;
    this.removeChild(this.shipInstance);
    this.shipInstance = undefined;
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
