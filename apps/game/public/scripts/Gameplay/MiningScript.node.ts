import * as Core from '@gravity-dig/game-core';

type TileCell = {
  x: number;
  y: number;
  type: string;
  health: number;
  maxHealth: number;
};

type LevelNodeLike = {
  getCellAtWorld(x: number, y: number): TileCell | undefined;
  clearTile(cell: TileCell): void;
};

type WorldNodeLike = {
  player: { x: number; y: number };
};

type MovementControllerLike = {
  inputBlocked?: boolean;
  callScriptMethod?(name: string, ...args: unknown[]): unknown;
  getScriptProperty?(name: string): unknown;
};

type PlayerStateLike = {
  stats: { miningRange: number; miningDamagePerSec: number };
  setMiningActive(active: boolean): void;
  hasMiningEnergy(): boolean;
  consumeMiningEnergy(deltaSeconds: number): void;
  recordMinedTile(tileType: string): void;
};

type GameplayInputLike = {
  getMiningIntent(options: {
    playerX: number;
    playerY: number;
    inputBlocked: boolean;
    miningRange: number;
    gamepadAim: Vec2;
    laserOrigin: Vec2;
  }): { miningPressed: boolean; aimWorld?: { x: number; y: number } };
};

type MiningLaserLike = {
  resetForLevel(): void;
  clear(): void;
  showTargetAndBeam(target: TileCell, origin: { x: number; y: number }, firing: boolean): void;
  setLaserSound(active: boolean): void;
  updateCrackOverlay(target: TileCell): void;
  removeCrackOverlay(target: TileCell): void;
  playBlockBreakSound(type: string): void;
};

const PLAYER_HEIGHT = 64;

export default class MiningScript extends Core.ScriptNode {
  id = 'dynamic.mining-tool';
  name = 'Mining Tool Script';

  levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
  worldNodeId = Core.prop.nodeRef(null, { label: 'World Node' });
  movementScriptNodeId = Core.prop.nodeRef(null, { label: 'Movement Script Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
  laserNodeId = Core.prop.nodeRef(null, { label: 'Mining Laser Node' });
  laserOriginOffsetY = Core.prop.number(PLAYER_HEIGHT * 0.18, { label: 'Laser Origin Offset Y', step: 0.1 });

  private levelNode!: LevelNodeLike;
  private world!: WorldNodeLike;
  private movementController!: MovementControllerLike;
  private playerState!: PlayerStateLike;
  private gameplayInput!: GameplayInputLike;
  private laser!: MiningLaserLike;
  private readonly laserOrigin = new Vec2();
  private readonly gamepadAim = new Vec2(1, 0);
  private readonly currentAimWorld = new Vec2(1, 0);
  private miningPressed = false;
  private target?: TileCell;

  resolve() {
    this.levelNode = this.requireResolvedNode<LevelNodeLike>(this.levelNodeId, 'Level');
    this.world = this.requireResolvedNode<WorldNodeLike>(this.worldNodeId, 'World');
    this.movementController = this.requireResolvedNode<MovementControllerLike>(this.movementScriptNodeId, 'PlayerMovementController');
    this.playerState = this.requireResolvedNode<PlayerStateLike>(this.playerStateNodeId, 'PlayerState');
    this.gameplayInput = this.requireResolvedNode<GameplayInputLike>(this.inputNodeId, 'GameplayInput');
    this.laser = this.requireResolvedNode<MiningLaserLike>(this.laserNodeId, 'MiningLaser');
  }

  update(deltaMs: number) {
    this.updateMining(deltaMs / 1000);
  }

  destroy() {
    this.stopFiring();
  }

  resetForLevel() {
    this.laser.resetForLevel();
    this.stopFiring();
  }

  stopFiring() {
    this.target = undefined;
    this.miningPressed = false;
    this.playerState?.setMiningActive(false);
    this.laser?.clear();
  }

  isMiningPressed() {
    return this.miningPressed;
  }

  getAimWorldPoint() {
    return this.currentAimWorld;
  }

  private updateMining(deltaSeconds: number) {
    const player = this.world.player;
    const origin = this.laserOrigin.set(player.x, player.y + this.laserOriginOffsetY);
    const intent = this.gameplayInput.getMiningIntent({
      playerX: player.x,
      playerY: player.y + this.laserOriginOffsetY,
      inputBlocked: readMovementInputBlocked(this.movementController),
      miningRange: this.playerState.stats.miningRange,
      gamepadAim: this.gamepadAim,
      laserOrigin: origin,
    });
    const aimWorld = this.getUpdatedAimWorld(intent.aimWorld);
    const target = findFirstMineableTile(origin, aimWorld, this.playerState.stats.miningRange, this.levelNode);
    const firing = intent.miningPressed;
    this.miningPressed = firing;
    this.playerState.setMiningActive(firing);
    this.target = target;
    this.laser.clear();

    if (!target) return;
    this.laser.showTargetAndBeam(target, origin, firing);
    if (!firing || !this.playerState.hasMiningEnergy()) return;

    this.laser.setLaserSound(true);
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.laser.updateCrackOverlay(target);
    if (target.health <= 0) this.mineTile(target);
  }

  private getUpdatedAimWorld(aimWorld?: { x: number; y: number }) {
    if (aimWorld) this.currentAimWorld.copy(aimWorld);
    return this.currentAimWorld;
  }

  private mineTile(cell: TileCell) {
    const minedType = cell.type;
    this.levelNode.clearTile(cell);
    this.laser.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    this.laser.playBlockBreakSound(minedType);
  }

  private requireResolvedNode<T>(instanceId: string | null, fallbackName: string): T {
    const node = (instanceId ? this.getNodeById<T>(instanceId) : undefined) ?? this.getNode<T>(fallbackName);
    if (!node) throw new Error(`Required node '${instanceId ?? fallbackName}' was not found`);
    return node;
  }
}

class Vec2 {
  constructor(public x = 0, public y = 0) {}
  set(x: number, y: number) { this.x = x; this.y = y; return this; }
  copy(value: { x: number; y: number }) { this.x = value.x; this.y = value.y; return this; }
  clone() { return new Vec2(this.x, this.y); }
  subtract(value: { x: number; y: number }) { this.x -= value.x; this.y -= value.y; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y; }
  normalize() { const length = Math.hypot(this.x, this.y) || 1; this.x /= length; this.y /= length; return this; }
}

function findFirstMineableTile(origin: Vec2, aimWorld: Vec2, range: number, level: LevelNodeLike): TileCell | undefined {
  const direction = aimWorld.clone().subtract(origin);
  if (direction.lengthSq() <= 1) return undefined;
  direction.normalize();
  for (let distance = 8; distance <= range; distance += 8) {
    const cell = level.getCellAtWorld(origin.x + direction.x * distance, origin.y + direction.y * distance);
    if (cell?.type && cell.type !== 'air') return cell.type === 'bedrock' ? undefined : cell;
  }
  return undefined;
}

function readMovementInputBlocked(controller: MovementControllerLike): boolean {
  return (controller.inputBlocked ?? controller.callScriptMethod?.('isInputBlocked') ?? controller.getScriptProperty?.('inputBlocked')) === true;
}
