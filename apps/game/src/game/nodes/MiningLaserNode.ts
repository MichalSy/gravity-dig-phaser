import Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import { MiningLaserView } from '../mining/MiningLaserView';
import type { TileCell, TileType } from '../level';

export class MiningLaserNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.MiningLaserNode;

  private laserView!: MiningLaserView;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'MiningLaser', className: 'MiningLaserNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.laserView = new MiningLaserView(ctx.phaserScene);
    this.laserView.mount();
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.laserView.getSceneObjects();
  }

  resetForLevel(): void {
    this.laserView.resetForLevel();
  }

  clear(): void {
    this.laserView.clear();
  }

  showTargetAndBeam(target: TileCell, origin: { x: number; y: number }, firing: boolean): void {
    this.laserView.showTargetAndBeam(target, origin as Phaser.Math.Vector2, firing);
  }

  setLaserSound(active: boolean): void {
    this.laserView.setLaserSound(active);
  }

  updateCrackOverlay(target: TileCell): void {
    this.laserView.updateCrackOverlay(target);
  }

  removeCrackOverlay(target: TileCell): void {
    this.laserView.removeCrackOverlay(target);
  }

  playBlockBreakSound(type: TileType): void {
    this.laserView.playBlockBreakSound(type);
  }

  destroy(): void {
    this.laserView?.destroy();
  }
}
