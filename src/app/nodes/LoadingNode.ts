import Phaser from 'phaser';
import { LoadingOverlayView } from '../loading/LoadingOverlayView';
import { loadGameAssets } from '../../assets/AssetLoader';
import { GameNode, type NodeContext } from '../../nodes';

const MIN_LOADING_MS = 900;

export class LoadingNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private readonly overlay = new LoadingOverlayView();
  private startTime = 0;
  private progress = 0;
  private loading = false;

  private readonly mountGameplay: () => void;

  constructor(mountGameplay: () => void) {
    super({ name: 'loading', order: 5, active: false });
    this.mountGameplay = mountGameplay;
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  destroy(): void {
    this.overlay.destroy();
    this.phaserScene.load.off('progress', this.setProgress, this);
    this.phaserScene.load.off('complete', this.handleAssetsLoaded, this);
  }

  start(): void {
    if (this.loading) return;

    this.loading = true;
    this.active = true;
    this.startTime = performance.now();
    this.overlay.mount();
    this.setProgress(0);

    if (this.areGameAssetsLoaded()) {
      this.setProgress(1);
      this.handleAssetsLoaded();
      return;
    }

    this.phaserScene.load.on('progress', this.setProgress, this);
    this.phaserScene.load.once('complete', this.handleAssetsLoaded, this);
    loadGameAssets(this.phaserScene);
    this.phaserScene.load.start();
  }

  update(): void {
    if (this.loading) this.overlay.keepOnTop();
  }

  private areGameAssetsLoaded(): boolean {
    return this.phaserScene.textures.exists('tiles') && this.phaserScene.cache.json.exists('dev-planet');
  }

  private handleAssetsLoaded(): void {
    this.phaserScene.load.off('progress', this.setProgress, this);
    this.setProgress(1);
    this.mountGameplay();
    this.finishLoading();
  }

  private setProgress(progress: number): void {
    this.progress = Phaser.Math.Clamp(progress, 0, 1);
    this.overlay.setProgress(this.progress);
  }

  private finishLoading(): void {
    const elapsed = performance.now() - this.startTime;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    this.phaserScene.time.delayedCall(remaining, () => {
      this.overlay.destroy();
      this.loading = false;
      this.active = false;
    });
  }
}
