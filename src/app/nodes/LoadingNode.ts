import Phaser from 'phaser';
import { loadGameAssets } from '../../assets/AssetLoader';
import { GAME_EVENTS, emitGameEvent, onceGameEvent } from '../../game/gameEvents';
import { GameNode, type NodeContext } from '../../nodes';

const MIN_LOADING_MS = 900;

export class LoadingNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private overlay?: HTMLDivElement;
  private overlayProgress?: HTMLDivElement;
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
    this.removeDomOverlay();
    this.phaserScene.load.off('progress', this.setProgress, this);
    this.phaserScene.load.off('complete', this.handleAssetsLoaded, this);
  }

  start(): void {
    if (this.loading) return;

    this.loading = true;
    this.active = true;
    this.startTime = performance.now();
    this.createDomOverlay();
    this.setProgress(0);
    onceGameEvent(this.phaserScene, GAME_EVENTS.gameReady, this.finishLoading, this);

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
    if (!this.loading || !this.overlay) return;
    this.overlay.style.zIndex = '2147483647';
  }

  private areGameAssetsLoaded(): boolean {
    return this.phaserScene.textures.exists('tiles') && this.phaserScene.cache.json.exists('dev-planet');
  }

  private handleAssetsLoaded(): void {
    this.phaserScene.load.off('progress', this.setProgress, this);
    this.setProgress(1);
    this.mountGameplay();
    emitGameEvent(this.phaserScene, GAME_EVENTS.gameReady);
  }

  private createDomOverlay(): void {
    this.removeDomOverlay();

    const backgroundUrl = '/assets/ui/menu/loading_screen.webp';
    const overlay = document.createElement('div');
    overlay.className = 'gd-loading-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147483647';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    overlay.style.backgroundColor = '#050816';
    const background = document.createElement('img');
    background.src = backgroundUrl;
    background.alt = '';
    background.decoding = 'async';
    background.style.position = 'absolute';
    background.style.inset = '0';
    background.style.width = '100%';
    background.style.height = '100%';
    background.style.objectFit = 'cover';
    background.style.objectPosition = 'center';

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

    const panda = this.createDomPandaHead();
    const textColumn = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'LOADING';
    label.style.fontSize = '34px';
    label.style.lineHeight = '1';
    const progress = document.createElement('div');
    progress.textContent = '0';
    progress.style.marginTop = '12px';
    progress.style.color = '#93c5fd';
    progress.style.fontSize = '22px';
    progress.style.textShadow = '0 0 0 #07111f, 0 3px 0 #07111f, 3px 0 0 #07111f, -3px 0 0 #07111f, 0 -3px 0 #07111f';

    textColumn.append(label, progress);
    indicator.append(panda, textColumn);
    overlay.append(background, indicator);
    document.body.append(overlay);

    this.overlay = overlay;
    this.overlayProgress = progress;
  }

  private createDomPandaHead(): HTMLDivElement {
    const panda = document.createElement('div');
    panda.style.position = 'relative';
    panda.style.width = '76px';
    panda.style.height = '76px';
    panda.style.animation = 'gd-loading-panda-spin 1.15s linear infinite';
    panda.style.filter = 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))';

    const make = (styles: Partial<CSSStyleDeclaration>): HTMLDivElement => {
      const element = document.createElement('div');
      Object.assign(element.style, styles);
      panda.append(element);
      return element;
    };

    make({ position: 'absolute', left: '6px', top: '4px', width: '24px', height: '24px', borderRadius: '50%', background: '#171717' });
    make({ position: 'absolute', right: '6px', top: '4px', width: '24px', height: '24px', borderRadius: '50%', background: '#171717' });
    make({ position: 'absolute', inset: '5px', borderRadius: '50%', background: 'rgba(147,197,253,0.26)', border: '5px solid rgba(223,247,255,0.92)', boxSizing: 'border-box' });
    make({ position: 'absolute', left: '11px', top: '11px', width: '54px', height: '54px', borderRadius: '50%', background: '#f8fafc', border: '4px solid #171717', boxSizing: 'border-box' });
    make({ position: 'absolute', left: '21px', top: '28px', width: '15px', height: '21px', borderRadius: '50%', background: '#171717', transform: 'rotate(-18deg)' });
    make({ position: 'absolute', right: '21px', top: '28px', width: '15px', height: '21px', borderRadius: '50%', background: '#171717', transform: 'rotate(18deg)' });
    make({ position: 'absolute', left: '27px', top: '33px', width: '5px', height: '5px', borderRadius: '50%', background: '#ffffff' });
    make({ position: 'absolute', right: '27px', top: '33px', width: '5px', height: '5px', borderRadius: '50%', background: '#ffffff' });
    make({ position: 'absolute', left: '33px', top: '47px', width: '10px', height: '7px', borderRadius: '50%', background: '#111827' });
    make({ position: 'absolute', left: '21px', top: '14px', width: '24px', height: '15px', borderTop: '4px solid rgba(255,255,255,0.44)', borderRadius: '50%', transform: 'rotate(-22deg)' });

    return panda;
  }

  private removeDomOverlay(): void {
    this.overlay?.remove();
    this.overlay = undefined;
    this.overlayProgress = undefined;
  }

  private setProgress(progress: number): void {
    this.progress = Phaser.Math.Clamp(progress, 0, 1);
    if (this.overlayProgress) this.overlayProgress.textContent = `${Math.round(this.progress * 100)}`;
  }

  private finishLoading(): void {
    const elapsed = performance.now() - this.startTime;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    this.phaserScene.time.delayedCall(remaining, () => {
      this.removeDomOverlay();
      this.loading = false;
      this.active = false;
      emitGameEvent(this.phaserScene, GAME_EVENTS.loadingComplete);
    });
  }
}
