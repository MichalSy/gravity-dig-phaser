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

export function loadGameAssets(scene: Phaser.Scene): void {
  const { load } = scene;

  load.image('tiles', versioned('/assets/tilesets/atlas/tiles_atlas.png'));
  load.image('backwall-tiles', versioned('/assets/tilesets/atlas/backwall_atlas.png'));
  load.image('bg-game', versioned('/assets/tilesets/bg/bg_game.png'));
  load.image('ship', versioned('/assets/ships/drill_ship.png'));
  load.image('drill-tunnel-bg', versioned('/assets/ships/drill_tunnel_bg.png'));
  load.image('laser-dot', versioned('/assets/effects/laser_beam.png'));
  load.image('title-logo', versioned('/assets/tilesets/ui/title_logo.png'));

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
    for (let i = 0; i < 4; i += 1) {
      load.image(`player-walk-${dir}-${i}`, versioned(`/assets/character/generated/walk/${dir}/frame_${frameName(i)}.png`));
    }
    for (let i = 0; i < 3; i += 1) {
      load.image(`player-jump-${dir}-${i}`, versioned(`/assets/character/generated/jump/${dir}/frame_${frameName(i)}.png`));
    }
    for (let i = 0; i < 6; i += 1) {
      load.image(`player-idle-${dir}-${i}`, versioned(`/assets/character/generated/idle/${dir}/frame_${frameName(i)}.png`));
    }
  }
}
