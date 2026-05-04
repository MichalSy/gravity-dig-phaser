import Phaser from 'phaser';

const ASSET_VERSION = Date.now().toString(36);

export interface GraphicAssetDefinition {
  key: string;
  path: string;
  category: string;
}

export const MENU_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  { key: 'title-screen', path: '/assets/ui/menu/title_screen.webp', category: 'menu' },
  { key: 'menu-button-active', path: '/assets/ui/menu/menu_button_active.webp', category: 'menu' },
  { key: 'menu-button-inactive', path: '/assets/ui/menu/menu_button_inactive.webp', category: 'menu' },
];

const GAME_STATIC_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  { key: 'tiles', path: '/assets/tilesets/atlas/tiles_atlas.webp', category: 'tiles' },
  { key: 'backwall-tiles', path: '/assets/tilesets/atlas/backwall_atlas.webp', category: 'backwall' },
  { key: 'ship', path: '/assets/ships/the_bucket.webp', category: 'ship' },
  { key: 'drill-tunnel-bg', path: '/assets/ships/drill_tunnel_bg.webp', category: 'ship' },
  { key: 'laser-dot', path: '/assets/effects/laser_beam.webp', category: 'effects' },
  { key: 'hud-status-frame', path: '/assets/ui/hud/hud_status_frame.webp', category: 'hud' },
  { key: 'hud-action-frame', path: '/assets/ui/hud/hud_action_frame.webp', category: 'hud' },
  { key: 'hud-bar-red', path: '/assets/ui/hud/hud_bar_red.webp', category: 'hud' },
  { key: 'hud-bar-orange', path: '/assets/ui/hud/hud_bar_orange.webp', category: 'hud' },
  { key: 'hud-bar-cyan', path: '/assets/ui/hud/hud_bar_cyan.webp', category: 'hud' },
  { key: 'hud-slot-active-empty', path: '/assets/ui/hud/hud_slot_active_empty.webp', category: 'hud' },
  { key: 'hud-slot-locked', path: '/assets/ui/hud/hud_slot_locked.webp', category: 'hud' },
  { key: 'hud-lock-icon', path: '/assets/ui/hud/hud_lock_icon.webp', category: 'hud' },
  { key: 'hud-item-rock', path: '/assets/ui/hud/hud_item_rock.webp', category: 'hud' },
  { key: 'hud-icon-hp', path: '/assets/ui/hud/hud_icon_hp.webp', category: 'hud' },
  { key: 'hud-icon-fuel', path: '/assets/ui/hud/hud_icon_fuel.webp', category: 'hud' },
  { key: 'hud-v10-bottom-frame', path: '/assets/ui/hud/variant10/bottom_frame.webp', category: 'hud' },
  { key: 'hud-v10-energy-fill', path: '/assets/ui/hud/variant10/energy_fill.webp', category: 'hud' },
  { key: 'hud-v10-slot-active-empty', path: '/assets/ui/hud/variant10/slot_active_empty.webp', category: 'hud' },
  { key: 'hud-v10-slot-empty', path: '/assets/ui/hud/variant10/slot_empty.webp', category: 'hud' },
  { key: 'hud-v10-slot-locked', path: '/assets/ui/hud/variant10/slot_locked.webp', category: 'hud' },
];

const GAME_CRACK_GRAPHIC_ASSETS: GraphicAssetDefinition[] = Array.from({ length: 4 }, (_, index) => ({
  key: `crack-${index + 1}`,
  path: `/assets/effects/cracks/crack-${index + 1}.webp`,
  category: 'effects',
}));

const GAME_PLAYER_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `player-walk-${index}`,
    path: `/assets/character/generated/walk/east/frame_${frameName(index)}.webp`,
    category: 'player',
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    key: `player-jump-${index}`,
    path: `/assets/character/generated/jump/east/frame_${frameName(index)}.webp`,
    category: 'player',
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    key: `player-idle-${index}`,
    path: `/assets/character/generated/idle/east/frame_${frameName(index)}.webp`,
    category: 'player',
  })),
];

export const GAME_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  ...GAME_STATIC_GRAPHIC_ASSETS,
  ...GAME_CRACK_GRAPHIC_ASSETS,
  ...GAME_PLAYER_GRAPHIC_ASSETS,
];

export const ALL_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  ...MENU_GRAPHIC_ASSETS,
  ...GAME_GRAPHIC_ASSETS,
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
