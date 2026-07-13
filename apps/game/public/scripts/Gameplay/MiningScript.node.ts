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

type WorldNodeLike = Core.GameNode & {
  player: { x: number; y: number };
  addChild<T extends Core.GameNode>(child: T): T;
  removeChild(child: Core.GameNode): void;
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

type LineNodeLike = Core.LineNode;
type MarkerNodeLike = Core.RectangleNode;
type AudioNodeLike = Core.AudioNode;
type CrackNodeLike = Core.ImageNode;

const PLAYER_HEIGHT = 64;
const RESOURCE_TILE_TYPES = new Set(['copper', 'iron', 'gold', 'diamond']);

export default class MiningScript extends Core.ScriptNode {
  id = 'dynamic.mining-tool';
  name = 'Mining Tool Script';

  levelNodeId = Core.prop.nodeRef(null, { label: 'Level Node' });
  worldNodeId = Core.prop.nodeRef(null, { label: 'World Node' });
  movementScriptNodeId = Core.prop.nodeRef(null, { label: 'Movement Script Node' });
  playerStateNodeId = Core.prop.nodeRef(null, { label: 'Player State Node' });
  inputNodeId = Core.prop.nodeRef(null, { label: 'Gameplay Input Node' });
  laserLineNodeId = Core.prop.nodeRef(null, { label: 'Laser Line Node' });
  targetMarkerNodeId = Core.prop.nodeRef(null, { label: 'Target Marker Node' });
  laserAudioNodeId = Core.prop.nodeRef(null, { label: 'Laser Audio Node' });
  dirtBreakAudioNodeId = Core.prop.nodeRef(null, { label: 'Dirt Break Audio Node' });
  gemBreakAudioNodeId = Core.prop.nodeRef(null, { label: 'Gem Break Audio Node' });
  crackPrefabId = Core.prop.string('781e9ab6-9061-55ef-92de-1b3c129c44ca', { label: 'Crack Prefab ID' });
  crackPrefabPath = Core.prop.string('prefabs/mining-crack.prefab.json', { label: 'Crack Prefab Path' });
  laserOriginOffsetY = Core.prop.number(PLAYER_HEIGHT * 0.18, { label: 'Laser Origin Offset Y', step: 0.1 });
  tileSize = Core.prop.number(96, { label: 'Tile Size', min: 1, step: 1 });
  idleLaserColor = Core.prop.color('#fb7185', { label: 'Idle Laser Color' });
  firingLaserColor = Core.prop.color('#f43f5e', { label: 'Firing Laser Color' });
  targetColor = Core.prop.color('#f97316', { label: 'Target Color' });
  idleLaserWidth = Core.prop.number(2, { label: 'Idle Laser Width', min: 0, step: 1 });
  firingLaserWidth = Core.prop.number(4, { label: 'Firing Laser Width', min: 0, step: 1 });
  idleLaserAlpha = Core.prop.number(0.5, { label: 'Idle Laser Alpha', min: 0, max: 1, step: 0.05 });
  firingLaserAlpha = Core.prop.number(0.95, { label: 'Firing Laser Alpha', min: 0, max: 1, step: 0.05 });
  crackStages = Core.prop.number(4, { label: 'Crack Stages', min: 1, step: 1 });

  private levelNode!: LevelNodeLike;
  private world!: WorldNodeLike;
  private movementController!: MovementControllerLike;
  private playerState!: PlayerStateLike;
  private gameplayInput!: GameplayInputLike;
  private laserLine!: LineNodeLike;
  private targetMarker!: MarkerNodeLike;
  private laserAudio!: AudioNodeLike;
  private dirtBreakAudio!: AudioNodeLike;
  private gemBreakAudio!: AudioNodeLike;
  private readonly crackOverlays = new Map<string, CrackNodeLike>();
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
    this.laserLine = this.requireResolvedNode<LineNodeLike>(this.laserLineNodeId, 'MiningLaserLine');
    this.targetMarker = this.requireResolvedNode<MarkerNodeLike>(this.targetMarkerNodeId, 'MiningTargetMarker');
    this.laserAudio = this.requireResolvedNode<AudioNodeLike>(this.laserAudioNodeId, 'MiningLaserAudio');
    this.dirtBreakAudio = this.requireResolvedNode<AudioNodeLike>(this.dirtBreakAudioNodeId, 'MiningDirtBreakAudio');
    this.gemBreakAudio = this.requireResolvedNode<AudioNodeLike>(this.gemBreakAudioNodeId, 'MiningGemBreakAudio');
    this.targetMarker.strokeColor = this.targetColor;
    this.clearPresentation();
  }

  update(deltaMs: number) {
    this.updateMining(deltaMs / 1000);
  }

  destroy() {
    this.clearCrackOverlays();
    this.stopFiring();
  }

  resetForLevel() {
    this.clearCrackOverlays();
    this.stopFiring();
  }

  stopFiring() {
    this.target = undefined;
    this.miningPressed = false;
    this.playerState?.setMiningActive(false);
    this.clearPresentation();
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
    this.clearPresentation(false);

    if (!target) {
      this.laserAudio.stop();
      return;
    }
    this.showTargetAndBeam(target, origin, firing);
    if (!firing || !this.playerState.hasMiningEnergy()) {
      this.laserAudio.stop();
      return;
    }

    this.laserAudio.play();
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.updateCrackOverlay(target);
    if (target.health <= 0) this.mineTile(target);
  }

  private getUpdatedAimWorld(aimWorld?: { x: number; y: number }) {
    if (aimWorld) this.currentAimWorld.copy(aimWorld);
    return this.currentAimWorld;
  }

  private showTargetAndBeam(target: TileCell, origin: Vec2, firing: boolean) {
    const center = this.tileCenter(target);
    this.targetMarker.position = this.targetMarker.worldToLocalPosition(center);
    this.targetMarker.strokeColor = this.targetColor;
    this.targetMarker.visible = true;

    this.laserLine.color = firing ? this.firingLaserColor : this.idleLaserColor;
    this.laserLine.lineWidth = firing ? this.firingLaserWidth : this.idleLaserWidth;
    this.laserLine.alpha = firing ? this.firingLaserAlpha : this.idleLaserAlpha;
    this.laserLine.visible = true;
    this.laserLine.setPoints(
      this.laserLine.worldToLocalPosition(origin),
      this.laserLine.worldToLocalPosition(center),
    );
  }

  private clearPresentation(stopAudio = true) {
    this.laserLine?.clear();
    if (this.laserLine) this.laserLine.visible = false;
    if (this.targetMarker) this.targetMarker.visible = false;
    if (stopAudio) this.laserAudio?.stop();
  }

  private updateCrackOverlay(cell: TileCell) {
    const key = tileKey(cell);
    const damage = clamp(1 - cell.health / cell.maxHealth, 0, 1);
    const stage = Math.min(this.crackStages, Math.max(1, Math.ceil(damage * this.crackStages)));
    let overlay = this.crackOverlays.get(key);

    if (!overlay) {
      overlay = this.instantiatePrefab<CrackNodeLike>(this.crackPrefabId, {
        name: `MiningCrack.${key}`,
        props: {
          assetId: `crack-${stage}`,
          position: this.tileCenter(cell),
        },
      });
      this.world.addChild(overlay);
      this.crackOverlays.set(key, overlay);
      return;
    }

    overlay.setAssetId(`crack-${stage}`);
  }

  private removeCrackOverlay(cell: TileCell) {
    const key = tileKey(cell);
    const overlay = this.crackOverlays.get(key);
    if (overlay) this.world.removeChild(overlay);
    this.crackOverlays.delete(key);
  }

  private clearCrackOverlays() {
    for (const overlay of this.crackOverlays.values()) this.world?.removeChild(overlay);
    this.crackOverlays.clear();
  }

  private mineTile(cell: TileCell) {
    const minedType = cell.type;
    this.levelNode.clearTile(cell);
    this.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    const detune = Math.round(Math.random() * 90 - 45);
    (RESOURCE_TILE_TYPES.has(minedType) ? this.gemBreakAudio : this.dirtBreakAudio).playOneShot({ detune });
  }

  private tileCenter(cell: Pick<TileCell, 'x' | 'y'>) {
    return { x: cell.x * this.tileSize + this.tileSize / 2, y: cell.y * this.tileSize + this.tileSize / 2 };
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

function tileKey(cell: Pick<TileCell, 'x' | 'y'>): string {
  return `${cell.x}:${cell.y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
