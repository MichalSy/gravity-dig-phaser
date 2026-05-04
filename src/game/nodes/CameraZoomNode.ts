import Phaser from 'phaser';
import { GameNode, type NodeContext } from '../../nodes';
import { createCameraZoomData, type CameraZoomData } from '../nodeData';
import { PlayerControllerNode } from '../PlayerControllerNode';

export class CameraZoomNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private playerController!: PlayerControllerNode;
  override readonly dependencies = ['playerController'] as const;
  readonly data: CameraZoomData = createCameraZoomData();

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
    const offset = this.data.debugZoomOffset >= 0 ? `+${this.data.debugZoomOffset.toFixed(2)}` : this.data.debugZoomOffset.toFixed(2);
    return `Zoom: ${this.phaserScene.cameras.main.zoom.toFixed(2)} (Offset: ${offset})`;
  }

  updateCameraZoom(): void {
    const baseZoom = 1;
    this.phaserScene.cameras.main.setZoom(Phaser.Math.Clamp(baseZoom + this.data.debugZoomOffset, 0.65, 5));
  }

  private handleDebugZoomWheel(_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number): void {
    if (this.playerController.inputBlocked) return;
    this.data.debugZoomOffset = Phaser.Math.Clamp(this.data.debugZoomOffset + (deltaY > 0 ? -0.15 : 0.15), -1.2, 2.5);
    this.updateCameraZoom();
  }
}
