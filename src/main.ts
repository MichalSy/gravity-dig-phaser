import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth || GAME_WIDTH,
  height: window.innerHeight || GAME_HEIGHT,
  backgroundColor: '#050816',
  pixelArt: true,
  input: {
    activePointers: 4,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  render: {
    antialias: false,
  },
  scene: GameScene,
});
