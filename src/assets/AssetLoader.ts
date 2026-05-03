import Phaser from 'phaser';

const ASSET_VERSION = Date.now().toString(36);
const DIRECTIONS = ['east', 'west'] as const;

function versioned(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${ASSET_VERSION}`;
}

function frameName(index: number): string {
  return String(index).padStart(3, '0');
}

export function loadMenuAssets(scene: Phaser.Scene): void {
  scene.load.image('title-screen', versioned('/assets/ui/menu/title_screen.png'));
  scene.load.image('menu-button-active', versioned('/assets/ui/menu/menu_button_active.png'));
  scene.load.image('menu-button-inactive', versioned('/assets/ui/menu/menu_button_inactive.png'));
}

export function loadGameAssets(scene: Phaser.Scene): void {
  const { load } = scene;

  load.image('tiles', versioned('/assets/tilesets/atlas/tiles_atlas.png'));
  load.image('backwall-tiles', versioned('/assets/tilesets/atlas/backwall_atlas.png'));
  load.image('bg-game', versioned('/assets/tilesets/bg/bg_game.png'));
  load.image('ship', versioned('/assets/ships/the_bucket.png'));
  load.image('drill-tunnel-bg', versioned('/assets/ships/drill_tunnel_bg.png'));
  load.image('laser-dot', versioned('/assets/effects/laser_beam.png'));
  load.image('title-logo', versioned('/assets/tilesets/ui/title_logo.png'));
  load.image('hud-status-frame', versioned('/assets/ui/hud/hud_status_frame.png'));
  load.image('hud-action-frame', versioned('/assets/ui/hud/hud_action_frame.png'));
  load.image('hud-bar-red', versioned('/assets/ui/hud/hud_bar_red.png'));
  load.image('hud-bar-orange', versioned('/assets/ui/hud/hud_bar_orange.png'));
  load.image('hud-bar-cyan', versioned('/assets/ui/hud/hud_bar_cyan.png'));
  load.image('hud-slot-active-empty', versioned('/assets/ui/hud/hud_slot_active_empty.png'));
  load.image('hud-slot-locked', versioned('/assets/ui/hud/hud_slot_locked.png'));
  load.image('hud-lock-icon', versioned('/assets/ui/hud/hud_lock_icon.png'));
  load.image('hud-item-rock', versioned('/assets/ui/hud/hud_item_rock.png'));
  load.image('hud-icon-hp', versioned('/assets/ui/hud/hud_icon_hp.png'));
  load.image('hud-icon-fuel', versioned('/assets/ui/hud/hud_icon_fuel.png'));
  load.image('hud-v10-bottom-frame', versioned('/assets/ui/hud/variant10/bottom_frame.png'));
  load.image('hud-v10-energy-fill', versioned('/assets/ui/hud/variant10/energy_fill.png'));
  load.image('hud-v10-slot-active-empty', versioned('/assets/ui/hud/variant10/slot_active_empty.png'));
  load.image('hud-v10-slot-empty', versioned('/assets/ui/hud/variant10/slot_empty.png'));
  load.image('hud-v10-slot-locked', versioned('/assets/ui/hud/variant10/slot_locked.png'));

  for (let i = 1; i <= 4; i += 1) {
    load.image(`crack-${i}`, versioned(`/assets/effects/cracks/crack-${i}.png`));
  }

  load.audio('laser-loop', versioned('/assets/sfx/laser-loop.wav'));
  load.audio('block-break-dirt', versioned('/assets/sfx/block-break-dirt.wav'));
  load.audio('block-break-gem', versioned('/assets/sfx/block-break-gem.wav'));
  load.audio('jump', versioned('/assets/sfx/jump.wav'));

  for (let i = 1; i <= 3; i += 1) {
    load.audio(`walk-${i}`, versioned(`/assets/sfx/walk-${i}.wav`));
  }

  load.json('dev-planet', versioned('/config/planets/dev_planet.json'));

  for (const dir of DIRECTIONS) {
    for (let i = 0; i < 6; i += 1) {
      load.image(`player-walk-${dir}-${i}`, versioned(`/assets/character/generated/walk/${dir}/frame_${frameName(i)}.png`));
    }
    for (let i = 0; i < 2; i += 1) {
      load.image(`player-jump-${dir}-${i}`, versioned(`/assets/character/generated/jump/${dir}/frame_${frameName(i)}.png`));
    }
    for (let i = 0; i < 4; i += 1) {
      load.image(`player-idle-${dir}-${i}`, versioned(`/assets/character/generated/idle/${dir}/frame_${frameName(i)}.png`));
    }
  }
}
