import Phaser from 'phaser';
import { GAME_GRAPHIC_ASSETS } from '../assets/AssetLoader';

const DIALOG_ID = 'gravity-dig-developer-dialog';
const STYLE_ID = 'gravity-dig-developer-dialog-style';

type DeveloperTab = 'planet' | 'graphics' | 'runtime';

interface GraphicAssetInfo {
  key: string;
  path: string;
  category: string;
  width: number;
  height: number;
  src?: string;
}

export class DeveloperDialog {
  private readonly scene: Phaser.Scene;
  private root?: HTMLDivElement;
  private activeTab: DeveloperTab = 'planet';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.installStyles();
  }

  toggle(): void {
    if (this.root) {
      this.close();
      return;
    }

    this.open();
  }

  close(): void {
    this.root?.remove();
    this.root = undefined;
  }

  refresh(): void {
    if (!this.root) return;
    this.render();
  }

  destroy(): void {
    this.close();
  }

  private open(): void {
    this.root = document.createElement('div');
    this.root.id = DIALOG_ID;
    document.body.appendChild(this.root);
    this.render();
  }

  private render(): void {
    if (!this.root) return;

    this.root.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'gd-dev-shell';

    const header = document.createElement('div');
    header.className = 'gd-dev-header';
    header.innerHTML = '<div><strong>Developer</strong><span>Gravity Dig diagnostics</span></div>';

    const closeButton = document.createElement('button');
    closeButton.className = 'gd-dev-close';
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => this.close());
    header.appendChild(closeButton);

    const tabs = document.createElement('div');
    tabs.className = 'gd-dev-tabs';
    for (const [tab, label] of [
      ['planet', 'Planet Config'],
      ['graphics', 'Grafiken'],
      ['runtime', 'Runtime'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.className = tab === this.activeTab ? 'active' : '';
      button.addEventListener('click', () => {
        this.activeTab = tab;
        this.render();
      });
      tabs.appendChild(button);
    }

    const content = document.createElement('div');
    content.className = 'gd-dev-content';
    content.appendChild(this.renderActiveTab());

    shell.append(header, tabs, content);
    this.root.appendChild(shell);
  }

  private renderActiveTab(): HTMLElement {
    if (this.activeTab === 'graphics') return this.renderGraphicsTab();
    if (this.activeTab === 'runtime') return this.renderRuntimeTab();
    return this.renderPlanetTab();
  }

  private renderPlanetTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'gd-dev-grid';

    const planetConfig = this.scene.cache.json.get('dev-planet') as unknown;
    wrap.appendChild(this.renderSummaryCard('Planet', this.extractPlanetSummary(planetConfig)));
    wrap.appendChild(this.renderJsonCard('Raw Config', planetConfig));
    return wrap;
  }

  private renderGraphicsTab(): HTMLElement {
    const wrap = document.createElement('div');
    const assets = this.getGraphicAssets();

    const toolbar = document.createElement('div');
    toolbar.className = 'gd-dev-toolbar';
    toolbar.textContent = `${assets.length} geladene Grafik-Texturen`;
    wrap.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'gd-dev-asset-grid';

    for (const asset of assets) {
      const card = document.createElement('button');
      card.className = 'gd-dev-asset-card';
      card.type = 'button';
      card.title = `${asset.key}\n${asset.path}\n${asset.width}×${asset.height}`;
      card.addEventListener('click', () => this.openAssetPreview(asset));

      const preview = document.createElement('div');
      preview.className = 'gd-dev-asset-preview';
      if (asset.src) {
        const img = document.createElement('img');
        img.src = asset.src;
        img.alt = asset.key;
        preview.appendChild(img);
      } else {
        preview.textContent = 'no preview';
      }

      const name = document.createElement('div');
      name.className = 'gd-dev-asset-name';
      name.textContent = asset.key;

      const meta = document.createElement('div');
      meta.className = 'gd-dev-asset-meta';
      meta.textContent = `${asset.category} · ${asset.width}×${asset.height}`;
      meta.title = asset.path;

      card.append(preview, name, meta);
      grid.appendChild(card);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  private openAssetPreview(asset: GraphicAssetInfo): void {
    if (!asset.src || !this.root) return;

    const overlay = document.createElement('div');
    overlay.className = 'gd-dev-lightbox';

    const panel = document.createElement('div');
    panel.className = 'gd-dev-lightbox-panel';

    const header = document.createElement('div');
    header.className = 'gd-dev-lightbox-header';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${asset.key}</strong><span>${asset.category} · ${asset.width}×${asset.height} · ${asset.path}</span>`;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => overlay.remove());
    header.append(title, closeButton);

    const imageWrap = document.createElement('div');
    imageWrap.className = 'gd-dev-lightbox-image-wrap';
    const image = document.createElement('img');
    image.src = asset.src;
    image.alt = asset.key;
    imageWrap.appendChild(image);

    panel.append(header, imageWrap);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    this.root.appendChild(overlay);
  }

  private renderRuntimeTab(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'gd-dev-grid';
    wrap.appendChild(this.renderSummaryCard('Scene', {
      key: this.scene.scene.key,
      canvas: `${this.scene.scale.width}×${this.scene.scale.height}`,
      dpr: String(window.devicePixelRatio || 1),
      textures: String(this.getGraphicAssets().length),
      jsonCache: Object.keys(this.scene.cache.json.entries.entries).join(', '),
    }));
    return wrap;
  }

  private renderSummaryCard(title: string, values: Record<string, string>): HTMLElement {
    const card = document.createElement('section');
    card.className = 'gd-dev-card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    card.appendChild(heading);

    const table = document.createElement('table');
    for (const [key, value] of Object.entries(values)) {
      const row = document.createElement('tr');
      const label = document.createElement('th');
      label.textContent = key;
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(label, cell);
      table.appendChild(row);
    }
    card.appendChild(table);
    return card;
  }

  private renderJsonCard(title: string, value: unknown): HTMLElement {
    const card = document.createElement('section');
    card.className = 'gd-dev-card gd-dev-json-card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(value, null, 2);
    card.append(heading, pre);
    return card;
  }

  private getGraphicAssets(): GraphicAssetInfo[] {
    return GAME_GRAPHIC_ASSETS
      .filter((asset) => this.scene.textures.exists(asset.key))
      .map((asset) => {
        const texture = this.scene.textures.get(asset.key);
        const sourceImage = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        return {
          key: asset.key,
          path: asset.path,
          category: asset.category,
          width: sourceImage.width,
          height: sourceImage.height,
          src: this.sourceImageToDataUrl(sourceImage),
        };
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
  }

  private sourceImageToDataUrl(sourceImage: HTMLImageElement | HTMLCanvasElement): string | undefined {
    try {
      if (sourceImage instanceof HTMLCanvasElement) return sourceImage.toDataURL('image/png');
      const canvas = document.createElement('canvas');
      canvas.width = sourceImage.naturalWidth || sourceImage.width;
      canvas.height = sourceImage.naturalHeight || sourceImage.height;
      const context = canvas.getContext('2d');
      if (!context || canvas.width <= 0 || canvas.height <= 0) return undefined;
      context.drawImage(sourceImage, 0, 0);
      return canvas.toDataURL('image/png');
    } catch {
      return sourceImage instanceof HTMLImageElement ? sourceImage.src : undefined;
    }
  }

  private extractPlanetSummary(config: unknown): Record<string, string> {
    if (!this.isRecord(config) || !this.isRecord(config.planet)) return { status: 'dev-planet nicht geladen' };
    const planet = config.planet;
    const base = this.isRecord(planet.base_config) ? planet.base_config : {};
    const core = this.isRecord(planet.core) ? planet.core : {};
    const spaceship = this.isRecord(planet.spaceship) ? planet.spaceship : {};
    const resources = this.isRecord(planet.resources) ? planet.resources : {};

    return {
      id: String(planet.id ?? '-'),
      name: String(planet.name ?? '-'),
      size: `${String(base.level_width ?? '?')} × ${String(base.level_height_up ?? '?')}↑/${String(base.level_height_down ?? '?')}↓`,
      blockSize: String(base.block_size ?? '-'),
      coreDistance: this.rangeLabel(core.distance),
      coreRadius: String(core.radius ?? '-'),
      shipX: this.rangeLabel(spaceship.x_range),
      shipY: this.rangeLabel(spaceship.y_range),
      shipFacing: String(spaceship.facing ?? '-'),
      resourceZones: String(Object.keys(resources).length),
    };
  }

  private rangeLabel(value: unknown): string {
    if (Array.isArray(value)) return value.join(' … ');
    if (this.isRecord(value)) return `${String(value.min ?? '?')} … ${String(value.max ?? '?')}`;
    return '-';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private installStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${DIALOG_ID} { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: rgba(2, 6, 23, 0.52); color: #e5e7eb; font-family: Arial, sans-serif; pointer-events: auto; }
      #${DIALOG_ID} .gd-dev-shell { width: min(1120px, calc(100vw - 40px)); height: min(720px, calc(100vh - 40px)); border: 1px solid rgba(56, 189, 248, 0.55); border-radius: 14px; background: rgba(8, 13, 25, 0.96); box-shadow: 0 24px 80px rgba(0,0,0,0.55); overflow: hidden; display: flex; flex-direction: column; }
      #${DIALOG_ID} .gd-dev-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); background: linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.9)); }
      #${DIALOG_ID} .gd-dev-header strong { display: block; font-size: 22px; letter-spacing: 0.04em; color: #f8fafc; }
      #${DIALOG_ID} .gd-dev-header span { display: block; margin-top: 3px; font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
      #${DIALOG_ID} button { border: 0; border-radius: 8px; cursor: pointer; font-weight: 800; }
      #${DIALOG_ID} .gd-dev-close { width: 36px; height: 36px; color: #f8fafc; background: rgba(239, 68, 68, 0.22); font-size: 26px; line-height: 1; }
      #${DIALOG_ID} .gd-dev-tabs { display: flex; gap: 8px; padding: 10px 14px; border-bottom: 1px solid rgba(148, 163, 184, 0.18); background: rgba(2, 6, 23, 0.72); }
      #${DIALOG_ID} .gd-dev-tabs button { padding: 9px 14px; color: #cbd5e1; background: rgba(30, 41, 59, 0.9); }
      #${DIALOG_ID} .gd-dev-tabs button.active { color: #082f49; background: #67e8f9; }
      #${DIALOG_ID} .gd-dev-content { flex: 1; overflow: auto; padding: 16px; }
      #${DIALOG_ID} .gd-dev-grid { display: grid; gap: 14px; grid-template-columns: minmax(280px, 0.75fr) minmax(360px, 1.25fr); align-items: start; }
      #${DIALOG_ID} .gd-dev-card { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 12px; background: rgba(15, 23, 42, 0.78); overflow: hidden; }
      #${DIALOG_ID} .gd-dev-card h3 { margin: 0; padding: 12px 14px; border-bottom: 1px solid rgba(148, 163, 184, 0.18); color: #f8fafc; font-size: 15px; }
      #${DIALOG_ID} table { width: 100%; border-collapse: collapse; font-size: 13px; }
      #${DIALOG_ID} th, #${DIALOG_ID} td { padding: 9px 12px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); text-align: left; vertical-align: top; }
      #${DIALOG_ID} th { width: 34%; color: #93c5fd; font-weight: 800; }
      #${DIALOG_ID} td { color: #e5e7eb; }
      #${DIALOG_ID} pre { margin: 0; padding: 14px; max-height: 520px; overflow: auto; font-size: 12px; line-height: 1.45; color: #dbeafe; background: rgba(2, 6, 23, 0.72); }
      #${DIALOG_ID} .gd-dev-toolbar { margin-bottom: 12px; color: #bae6fd; font-size: 13px; font-weight: 800; }
      #${DIALOG_ID} .gd-dev-asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 12px; }
      #${DIALOG_ID} .gd-dev-asset-card { border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 10px; background: rgba(15, 23, 42, 0.82); overflow: hidden; color: inherit; text-align: left; padding: 0; }
      #${DIALOG_ID} .gd-dev-asset-card:hover { border-color: rgba(103, 232, 249, 0.72); transform: translateY(-1px); }
      #${DIALOG_ID} .gd-dev-asset-preview { height: 104px; display: grid; place-items: center; background: repeating-conic-gradient(rgba(255,255,255,0.08) 0 25%, transparent 0 50%) 50% / 18px 18px, rgba(2,6,23,0.55); }
      #${DIALOG_ID} .gd-dev-asset-preview img { max-width: 132px; max-height: 92px; object-fit: contain; image-rendering: pixelated; }
      #${DIALOG_ID} .gd-dev-asset-name { padding: 8px 8px 2px; color: #f8fafc; font-size: 12px; font-weight: 800; word-break: break-word; }
      #${DIALOG_ID} .gd-dev-asset-meta { padding: 0 8px 8px; color: #94a3b8; font-size: 11px; }
      #${DIALOG_ID} .gd-dev-lightbox { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 24px; background: rgba(2, 6, 23, 0.82); }
      #${DIALOG_ID} .gd-dev-lightbox-panel { width: min(980px, 100%); max-height: 100%; border: 1px solid rgba(103, 232, 249, 0.62); border-radius: 14px; overflow: hidden; background: rgba(8, 13, 25, 0.98); box-shadow: 0 24px 80px rgba(0,0,0,0.68); display: flex; flex-direction: column; }
      #${DIALOG_ID} .gd-dev-lightbox-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 14px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); }
      #${DIALOG_ID} .gd-dev-lightbox-header strong { display: block; color: #f8fafc; font-size: 16px; }
      #${DIALOG_ID} .gd-dev-lightbox-header span { display: block; margin-top: 3px; color: #94a3b8; font-size: 12px; word-break: break-all; }
      #${DIALOG_ID} .gd-dev-lightbox-header button { flex: 0 0 auto; width: 34px; height: 34px; color: #f8fafc; background: rgba(239, 68, 68, 0.24); font-size: 24px; }
      #${DIALOG_ID} .gd-dev-lightbox-image-wrap { flex: 1; min-height: 0; display: grid; place-items: center; padding: 18px; overflow: auto; background: repeating-conic-gradient(rgba(255,255,255,0.10) 0 25%, transparent 0 50%) 50% / 24px 24px, rgba(2,6,23,0.72); }
      #${DIALOG_ID} .gd-dev-lightbox-image-wrap img { max-width: 100%; max-height: 68vh; object-fit: contain; image-rendering: pixelated; }
      @media (max-width: 760px) { #${DIALOG_ID} .gd-dev-grid { grid-template-columns: 1fr; } #${DIALOG_ID} .gd-dev-shell { width: 100vw; height: 100vh; border-radius: 0; } }
    `;
    document.head.appendChild(style);
  }
}
