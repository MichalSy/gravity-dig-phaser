import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { UIScene } from './scenes/UIScene';

async function startGame(): Promise<void> {
  await document.fonts?.load('700 28px "Silkscreen"');

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: window.innerWidth || GAME_WIDTH,
    height: window.innerHeight || GAME_HEIGHT,
    backgroundColor: '#050816',
    pixelArt: false,
    smoothPixelArt: true,
    antialias: true,
    antialiasGL: true,
    input: {
      activePointers: 4,
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    render: {
      antialias: true,
      antialiasGL: true,
    },
    scene: [MenuScene, GameScene, UIScene],
  });
}

void startGame();
