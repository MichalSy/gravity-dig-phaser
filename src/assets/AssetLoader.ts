import Phaser from 'phaser';

const ASSET_VERSION = Date.now().toString(36);
const DIRECTIONS = ['east', 'west'] as const;

export interface GraphicAssetDefinition {
  key: string;
  path: string;
  category: string;
}

export const MENU_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  { key: 'title-screen', path: '/assets/ui/menu/title_screen.png', category: 'menu' },
  { key: 'menu-button-active', path: '/assets/ui/menu/menu_button_active.png', category: 'menu' },
  { key: 'menu-button-inactive', path: '/assets/ui/menu/menu_button_inactive.png', category: 'menu' },
];

const GAME_STATIC_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
  { key: 'tiles', path: '/assets/tilesets/atlas/tiles_atlas.png', category: 'tiles' },
  { key: 'backwall-tiles', path: '/assets/tilesets/atlas/backwall_atlas.png', category: 'tiles' },
  { key: 'bg-game', path: '/assets/tilesets/bg/bg_game.png', category: 'world' },
  { key: 'ship', path: '/assets/ships/the_bucket.png', category: 'ship' },
  { key: 'drill-tunnel-bg', path: '/assets/ships/drill_tunnel_bg.png', category: 'ship' },
  { key: 'laser-dot', path: '/assets/effects/laser_beam.png', category: 'effects' },
  { key: 'title-logo', path: '/assets/tilesets/ui/title_logo.png', category: 'ui' },
  { key: 'hud-status-frame', path: '/assets/ui/hud/hud_status_frame.png', category: 'hud' },
  { key: 'hud-action-frame', path: '/assets/ui/hud/hud_action_frame.png', category: 'hud' },
  { key: 'hud-bar-red', path: '/assets/ui/hud/hud_bar_red.png', category: 'hud' },
  { key: 'hud-bar-orange', path: '/assets/ui/hud/hud_bar_orange.png', category: 'hud' },
  { key: 'hud-bar-cyan', path: '/assets/ui/hud/hud_bar_cyan.png', category: 'hud' },
  { key: 'hud-slot-active-empty', path: '/assets/ui/hud/hud_slot_active_empty.png', category: 'hud' },
  { key: 'hud-slot-locked', path: '/assets/ui/hud/hud_slot_locked.png', category: 'hud' },
  { key: 'hud-lock-icon', path: '/assets/ui/hud/hud_lock_icon.png', category: 'hud' },
  { key: 'hud-item-rock', path: '/assets/ui/hud/hud_item_rock.png', category: 'hud' },
  { key: 'hud-icon-hp', path: '/assets/ui/hud/hud_icon_hp.png', category: 'hud' },
  { key: 'hud-icon-fuel', path: '/assets/ui/hud/hud_icon_fuel.png', category: 'hud' },
  { key: 'hud-v10-bottom-frame', path: '/assets/ui/hud/variant10/bottom_frame.png', category: 'hud' },
  { key: 'hud-v10-energy-fill', path: '/assets/ui/hud/variant10/energy_fill.png', category: 'hud' },
  { key: 'hud-v10-slot-active-empty', path: '/assets/ui/hud/variant10/slot_active_empty.png', category: 'hud' },
  { key: 'hud-v10-slot-empty', path: '/assets/ui/hud/variant10/slot_empty.png', category: 'hud' },
  { key: 'hud-v10-slot-locked', path: '/assets/ui/hud/variant10/slot_locked.png', category: 'hud' },
];

const GAME_CRACK_GRAPHIC_ASSETS: GraphicAssetDefinition[] = Array.from({ length: 4 }, (_, index) => ({
  key: `crack-${index + 1}`,
  path: `/assets/effects/cracks/crack-${index + 1}.png`,
  category: 'effects',
}));

const GAME_PLAYER_GRAPHIC_ASSETS: GraphicAssetDefinition[] = DIRECTIONS.flatMap((dir) => [
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `player-walk-${dir}-${index}`,
    path: `/assets/character/generated/walk/${dir}/frame_${frameName(index)}.png`,
    category: `player-${dir}`,
  })),
  ...Array.from({ length: 2 }, (_, index) => ({
    key: `player-jump-${dir}-${index}`,
    path: `/assets/character/generated/jump/${dir}/frame_${frameName(index)}.png`,
    category: `player-${dir}`,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    key: `player-idle-${dir}-${index}`,
    path: `/assets/character/generated/idle/${dir}/frame_${frameName(index)}.png`,
    category: `player-${dir}`,
  })),
]);

export const GAME_GRAPHIC_ASSETS: GraphicAssetDefinition[] = [
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
