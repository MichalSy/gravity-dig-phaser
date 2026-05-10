import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config/gameConfig';
import { AppScene } from './scenes/AppScene';
import { installTouchImmersiveLandscapeGate, VIEWPORT_REFRESH_EVENT } from './utils/screen';

installTouchImmersiveLandscapeGate();

async function startGame(): Promise<void> {
  await document.fonts?.load('700 28px "Silkscreen"');

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#050816',
    pixelArt: false,
    smoothPixelArt: true,
    antialias: true,
    antialiasGL: true,
    input: {
      activePointers: 4,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      antialias: true,
      antialiasGL: true,
    },
    scene: [AppScene],
  });

  const resizeGameToViewport = (): void => {
    const gameElement = document.getElementById('game');
    if (gameElement) {
      gameElement.style.width = '100vw';
      gameElement.style.height = '100dvh';
    }
    game.scale.refresh();
  };

  window.addEventListener(VIEWPORT_REFRESH_EVENT, resizeGameToViewport);
  window.addEventListener('resize', resizeGameToViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', resizeGameToViewport, { passive: true });
  resizeGameToViewport();

  if (import.meta.env.DEV) {
    (window as typeof window & { __GRAVITY_DIG_GAME__?: Phaser.Game }).__GRAVITY_DIG_GAME__ = game;
    (window as typeof window & { __GRAVITY_DIG_REFRESH_VIEWPORT__?: () => void }).__GRAVITY_DIG_REFRESH_VIEWPORT__ = resizeGameToViewport;
  }
}

void startGame();
