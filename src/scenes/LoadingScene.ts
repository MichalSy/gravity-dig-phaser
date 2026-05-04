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
  private overlay?: HTMLDivElement;
  private overlayPanda?: HTMLDivElement;
  private overlayProgress?: HTMLDivElement;
  private startTime = 0;
  private progress = 0;
  private waitingForGameReady = false;

  constructor() {
    super('loading');
  }

  preload(): void {
    this.startTime = performance.now();
    this.createLoadingView();
    this.createDomOverlay();
    this.load.on('progress', this.setProgress, this);
    this.load.once('complete', this.startGameBehindLoadingScreen, this);
    this.game.events.once('game:ready', this.finishLoading, this);
    loadGameAssets(this);
  }

  create(): void {
    if (!this.waitingForGameReady && this.load.totalToLoad === 0) {
      this.startGameBehindLoadingScreen();
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.waitingForGameReady) {
      this.scene.bringToTop('loading');
    }

    const rotation = deltaMs * 0.0042;
    if (this.overlayPanda) {
      const current = Number(this.overlayPanda.dataset.rotation ?? '0') + rotation;
      this.overlayPanda.dataset.rotation = String(current);
      this.overlayPanda.style.transform = `rotate(${current}rad)`;
    }

    if (!this.pandaHead?.active) return;
    this.pandaHead.rotation += rotation;
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
      this.game.events.off('game:ready', this.finishLoading, this);
      this.removeDomOverlay();
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

  private createDomOverlay(): void {
    this.removeDomOverlay();

    const overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    overlay.style.backgroundColor = '#050816';
    overlay.style.backgroundImage = `url('/assets/ui/menu/loading_screen.webp?v=${Date.now().toString(36)}')`;
    overlay.style.backgroundSize = 'cover';
    overlay.style.backgroundPosition = 'center';
    overlay.style.backgroundRepeat = 'no-repeat';

    const indicator = document.createElement('div');
    indicator.style.position = 'absolute';
    indicator.style.left = '66%';
    indicator.style.top = '72%';
    indicator.style.display = 'grid';
    indicator.style.gridTemplateColumns = '76px auto';
    indicator.style.columnGap = '18px';
    indicator.style.alignItems = 'center';
    indicator.style.transform = 'translate(-50%, -50%)';
    indicator.style.fontFamily = 'Silkscreen, monospace';
    indicator.style.color = '#fff4c7';
    indicator.style.textShadow = '0 0 0 #3b210f, 0 3px 0 #3b210f, 3px 0 0 #3b210f, -3px 0 0 #3b210f, 0 -3px 0 #3b210f';

    const panda = document.createElement('div');
    panda.dataset.rotation = '0';
    panda.style.width = '76px';
    panda.style.height = '76px';
    panda.style.borderRadius = '50%';
    panda.style.boxSizing = 'border-box';
    panda.style.border = '5px solid rgba(223, 247, 255, 0.9)';
    panda.style.background = 'radial-gradient(circle at 36% 42%, #111827 0 11%, transparent 12%), radial-gradient(circle at 64% 42%, #111827 0 11%, transparent 12%), radial-gradient(circle at 50% 58%, #111827 0 7%, transparent 8%), radial-gradient(circle at 50% 50%, #f8fafc 0 58%, #93c5fd 59% 72%, rgba(147,197,253,0.25) 73%)';
    panda.style.boxShadow = '0 10px 24px rgba(0,0,0,0.35), inset 0 0 0 3px #171717';

    const textColumn = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'LOADING';
    label.style.fontSize = '34px';
    label.style.lineHeight = '1';
    const progress = document.createElement('div');
    progress.textContent = '0%';
    progress.style.marginTop = '12px';
    progress.style.color = '#93c5fd';
    progress.style.fontSize = '22px';
    progress.style.textShadow = '0 0 0 #07111f, 0 3px 0 #07111f, 3px 0 0 #07111f, -3px 0 0 #07111f, 0 -3px 0 #07111f';

    textColumn.append(label, progress);
    indicator.append(panda, textColumn);
    overlay.append(indicator);
    document.body.append(overlay);

    this.overlay = overlay;
    this.overlayPanda = panda;
    this.overlayProgress = progress;
  }

  private removeDomOverlay(): void {
    this.overlay?.remove();
    this.overlay = undefined;
    this.overlayPanda = undefined;
    this.overlayProgress = undefined;
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
    const text = `${Math.round(this.progress * 100)}%`;
    this.progressText?.setText(text);
    if (this.overlayProgress) this.overlayProgress.textContent = text;
  }

  private startGameBehindLoadingScreen(): void {
    if (this.waitingForGameReady) return;

    this.waitingForGameReady = true;
    this.setProgress(1);
    this.scene.launch('game');
    this.scene.bringToTop('loading');
  }

  private finishLoading(): void {
    this.scene.bringToTop('loading');
    const elapsed = performance.now() - this.startTime;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    this.time.delayedCall(remaining, () => {
      this.scene.bringToTop('loading');
      this.removeDomOverlay();
      this.scene.stop('loading');
      this.game.events.emit('loading:complete');
    });
  }
}
