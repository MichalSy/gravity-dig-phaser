import Phaser from 'phaser';
import { loadGameAssets } from '../assets/AssetLoader';

const BACKGROUND_WIDTH = 2048;
const BACKGROUND_HEIGHT = 1152;
const MIN_LOADING_MS = 900;

export class LoadingScene extends Phaser.Scene {
  private background?: Phaser.GameObjects.Image;
  private pandaHead?: Phaser.GameObjects.Container;
  private loadingText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  private startTime = 0;
  private progress = 0;

  constructor() {
    super('loading');
  }

  create(): void {
    this.startTime = performance.now();
    this.createLoadingView();
    this.load.on('progress', this.setProgress, this);
    this.load.once('complete', this.finishLoading, this);
    loadGameAssets(this);

    if (this.load.totalToLoad > 0) {
      this.load.start();
    } else {
      this.finishLoading();
    }
  }

  update(_time: number, deltaMs: number): void {
    if (!this.pandaHead?.active) return;
    this.pandaHead.rotation += deltaMs * 0.0042;
  }

  private createLoadingView(): void {
    this.cameras.main.setBackgroundColor('#050816');

    if (this.textures.exists('loading-screen')) {
      this.background = this.add.image(0, 0, 'loading-screen').setOrigin(0.5).setDepth(0);
    }

    this.pandaHead = this.createPandaHead().setDepth(5);
    this.loadingText = this.add
      .text(0, 0, 'LOADING', {
        fontFamily: 'Silkscreen',
        fontSize: '34px',
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#3b210f',
        strokeThickness: 7,
      })
      .setOrigin(0, 0.5)
      .setDepth(6)
      .setResolution(2);
    this.progressText = this.add
      .text(0, 0, '0%', {
        fontFamily: 'Silkscreen',
        fontSize: '22px',
        fontStyle: '700',
        color: '#93c5fd',
        stroke: '#07111f',
        strokeThickness: 5,
      })
      .setOrigin(0, 0.5)
      .setDepth(6)
      .setResolution(2);

    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layout, this);
      this.load.off('progress', this.setProgress, this);
    });
    this.layout();
  }

  private createPandaHead(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    const shadow = this.add.circle(4, 7, 31, 0x1f2937, 0.42);
    const leftEar = this.add.circle(-25, -25, 15, 0x171717, 1);
    const rightEar = this.add.circle(25, -25, 15, 0x171717, 1);
    const head = this.add.circle(0, 0, 34, 0xf8fafc, 1).setStrokeStyle(5, 0x171717, 1);
    const leftPatch = this.add.ellipse(-14, -4, 18, 24, 0x171717, 1).setAngle(-18);
    const rightPatch = this.add.ellipse(14, -4, 18, 24, 0x171717, 1).setAngle(18);
    const leftEye = this.add.circle(-13, -5, 4, 0xffffff, 1);
    const rightEye = this.add.circle(13, -5, 4, 0xffffff, 1);
    const nose = this.add.ellipse(0, 10, 10, 7, 0x111827, 1);
    const helmet = this.add.circle(0, 0, 43, 0x93c5fd, 0.24).setStrokeStyle(4, 0xdff7ff, 0.82);
    const shine = this.add.arc(-14, -17, 22, 215, 292, false, 0xffffff, 0.32).setStrokeStyle(4, 0xffffff, 0.32);

    container.add([shadow, leftEar, rightEar, head, leftPatch, rightPatch, leftEye, rightEye, nose, helmet, shine]);
    return container;
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const sceneScale = Math.max(width / BACKGROUND_WIDTH, height / BACKGROUND_HEIGHT);

    this.background?.setPosition(width / 2, height / 2).setScale(sceneScale);

    const indicatorScale = Phaser.Math.Clamp(Math.min(width, height) / 720, 0.62, 1.18);
    const centerX = width * 0.66;
    const centerY = height * 0.72;
    const gap = 76 * indicatorScale;

    this.pandaHead?.setPosition(centerX - gap, centerY).setScale(indicatorScale);
    this.loadingText?.setPosition(centerX - gap + 70 * indicatorScale, centerY - 10 * indicatorScale).setFontSize(34 * indicatorScale);
    this.progressText?.setPosition(centerX - gap + 74 * indicatorScale, centerY + 30 * indicatorScale).setFontSize(22 * indicatorScale);
  }

  private setProgress(progress: number): void {
    this.progress = Phaser.Math.Clamp(progress, 0, 1);
    this.progressText?.setText(`${Math.round(this.progress * 100)}%`);
  }

  private finishLoading(): void {
    this.setProgress(1);
    const elapsed = performance.now() - this.startTime;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    this.time.delayedCall(remaining, () => this.scene.start('game'));
  }
}
