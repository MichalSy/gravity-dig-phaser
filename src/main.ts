import Phaser from 'phaser';
import './style.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { UIScene } from './scenes/UIScene';
import { installTouchImmersiveLandscapeGate, VIEWPORT_REFRESH_EVENT } from './utils/screen';

installTouchImmersiveLandscapeGate();

async function startGame(): Promise<void> {
  await document.fonts?.load('700 28px "Silkscreen"');

  const game = new Phaser.Game({
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

  const resizeGameToViewport = (): void => {
    const viewport = window.visualViewport;
    const width = Math.max(1, Math.round(viewport?.width ?? window.innerWidth ?? GAME_WIDTH));
    const height = Math.max(1, Math.round(viewport?.height ?? window.innerHeight ?? GAME_HEIGHT));
    const gameElement = document.getElementById('game');

    if (gameElement) {
      gameElement.style.width = `${width}px`;
      gameElement.style.height = `${height}px`;
    }

    if (game.scale.width !== width || game.scale.height !== height) {
      game.scale.resize(width, height);
    } else {
      game.scale.refresh();
    }
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
