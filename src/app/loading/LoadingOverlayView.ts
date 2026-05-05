import Phaser from 'phaser';

export class LoadingOverlayView {
  private overlay?: HTMLDivElement;
  private progress?: HTMLDivElement;

  mount(): void {
    this.destroy();

    const overlay = document.createElement('div');
    overlay.className = 'gd-loading-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      overflow: 'hidden',
      backgroundColor: '#050816',
    });

    const background = document.createElement('img');
    background.src = '/assets/ui/menu/loading_screen.webp';
    background.alt = '';
    background.decoding = 'async';
    Object.assign(background.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center',
    });

    const progress = document.createElement('div');
    const indicator = this.createIndicator(progress);
    overlay.append(background, indicator);
    document.body.append(overlay);

    this.overlay = overlay;
    this.progress = progress;
  }

  keepOnTop(): void {
    if (this.overlay) this.overlay.style.zIndex = '2147483647';
  }

  setProgress(progress: number): void {
    if (this.progress) this.progress.textContent = `${Math.round(Phaser.Math.Clamp(progress, 0, 1) * 100)}`;
  }

  destroy(): void {
    this.overlay?.remove();
    this.overlay = undefined;
    this.progress = undefined;
  }

  private createIndicator(progress: HTMLDivElement): HTMLDivElement {
    const indicator = document.createElement('div');
    Object.assign(indicator.style, {
      position: 'absolute',
      left: '66%',
      top: '72%',
      display: 'grid',
      gridTemplateColumns: '76px auto',
      columnGap: '18px',
      alignItems: 'center',
      transform: 'translate(-50%, -50%)',
      fontFamily: 'Silkscreen, monospace',
      color: '#fff4c7',
      textShadow: '0 0 0 #3b210f, 0 3px 0 #3b210f, 3px 0 0 #3b210f, -3px 0 0 #3b210f, 0 -3px 0 #3b210f',
    });

    const textColumn = document.createElement('div');
    const label = document.createElement('div');
    label.textContent = 'LOADING';
    label.style.fontSize = '34px';
    label.style.lineHeight = '1';
    progress.textContent = '0';
    progress.style.marginTop = '12px';
    progress.style.color = '#93c5fd';
    progress.style.fontSize = '22px';
    progress.style.textShadow = '0 0 0 #07111f, 0 3px 0 #07111f, 3px 0 0 #07111f, -3px 0 0 #07111f, 0 -3px 0 #07111f';

    textColumn.append(label, progress);
    indicator.append(this.createPandaHead(), textColumn);
    return indicator;
  }

  private createPandaHead(): HTMLDivElement {
    const panda = document.createElement('div');
    Object.assign(panda.style, {
      position: 'relative',
      width: '76px',
      height: '76px',
      animation: 'gd-loading-panda-spin 1.15s linear infinite',
      filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))',
    });

    const make = (styles: Partial<CSSStyleDeclaration>): void => {
      const element = document.createElement('div');
      Object.assign(element.style, styles);
      panda.append(element);
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
}
