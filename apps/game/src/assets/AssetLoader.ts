import Phaser from 'phaser';
import type { ImageAssetDefinition } from './AssetCatalog';
import { imageAtlasMetaKey, imageAtlasMetaPath } from './imageAtlasMeta';

const ASSET_VERSION = Date.now().toString(36);

type GraphicAssetDefinition = ImageAssetDefinition;

export const MENU_GRAPHIC_ASSETS: readonly GraphicAssetDefinition[] = [
  { key: 'title-screen', path: '/assets/ui/menu/title_screen.webp' },
  { key: 'loading-screen', path: '/assets/ui/menu/loading_screen.webp' },
  { key: 'menu-button-active', path: '/assets/ui/menu/menu_button_active.webp' },
  { key: 'menu-button-inactive', path: '/assets/ui/menu/menu_button_inactive.webp' },
];

const GAME_STATIC_GRAPHIC_ASSETS: readonly GraphicAssetDefinition[] = [
  { key: 'tiles', path: '/assets/tilesets/atlas/tiles_atlas.webp' },
  { key: 'backwall-tiles', path: '/assets/tilesets/atlas/backwall_atlas.webp' },
  { key: 'ship', path: '/assets/ships/the_bucket.webp' },
  { key: 'drill-tunnel-bg', path: '/assets/ships/drill_tunnel_bg.webp' },
  { key: 'laser-dot', path: '/assets/effects/laser_beam.webp' },
  { key: 'hud-hp-fuel-atlas', path: '/assets/ui/hud/hud_hp_fuel_atlas.webp', meta: true },
  { key: 'hud-item-rock', path: '/assets/ui/hud/hud_item_rock.webp' },
];

const GAME_CRACK_GRAPHIC_ASSETS: readonly GraphicAssetDefinition[] = Array.from({ length: 4 }, (_, index) => ({
  key: `crack-${index + 1}`,
  path: `/assets/effects/cracks/crack-${index + 1}.webp`,
}));

const GAME_PLAYER_GRAPHIC_ASSETS: readonly GraphicAssetDefinition[] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `player-walk-${index}`,
    path: `/assets/character/generated/walk/east/frame_${frameName(index)}.webp`,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    key: `player-jump-${index}`,
    path: `/assets/character/generated/jump/east/frame_${frameName(index)}.webp`,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    key: `player-idle-${index}`,
    path: `/assets/character/generated/idle/east/frame_${frameName(index)}.webp`,
  })),
];

export const GAME_GRAPHIC_ASSETS: readonly GraphicAssetDefinition[] = [
  ...GAME_STATIC_GRAPHIC_ASSETS,
  ...GAME_CRACK_GRAPHIC_ASSETS,
  ...GAME_PLAYER_GRAPHIC_ASSETS,
];

function versioned(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${ASSET_VERSION}`;
}

function frameName(index: number): string {
  return String(index).padStart(3, '0');
}

function loadImageAsset(load: Phaser.Loader.LoaderPlugin, asset: GraphicAssetDefinition): void {
  load.image(asset.key, versioned(asset.path));
  if (asset.meta) load.json(imageAtlasMetaKey(asset.key), versioned(imageAtlasMetaPath(asset.path)));
}

export function loadMenuAssets(scene: Phaser.Scene): void {
  for (const asset of MENU_GRAPHIC_ASSETS) loadImageAsset(scene.load, asset);
}

export function loadGameAssets(scene: Phaser.Scene): void {
  const { load } = scene;

  for (const asset of GAME_GRAPHIC_ASSETS) loadImageAsset(load, asset);

  load.audio('laser-loop', versioned('/assets/sfx/laser-loop.wav'));
  load.audio('block-break-dirt', versioned('/assets/sfx/block-break-dirt.wav'));
  load.audio('block-break-gem', versioned('/assets/sfx/block-break-gem.wav'));
  load.audio('jump', versioned('/assets/sfx/jump.wav'));

  for (let i = 1; i <= 3; i += 1) {
    load.audio(`walk-${i}`, versioned(`/assets/sfx/walk-${i}.wav`));
  }

  load.json('dev-planet', versioned('/config/planets/dev_planet.json'));
}
