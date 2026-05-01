import Phaser from 'phaser';
import './style.css';

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

class DemoScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;

  constructor() {
    super('demo');
  }

  preload(): void {
    // Keep the first build dependency-free: generated shapes only.
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#050816');

    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x08111f, 0x08111f, 0x1d1233, 0x321429, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.drawStars();
    this.drawPlanetSurface();
    this.drawDigPreview();

    this.add
      .text(48, 42, 'GRAVITY DIG', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#f8fafc',
        stroke: '#0f172a',
        strokeThickness: 6,
      })
      .setShadow(0, 4, '#000000', 6, true, true);

    this.add.text(52, 104, 'Phaser + TypeScript Web Demo', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#93c5fd',
    });

    this.add.text(52, 472, 'Pipeline target: GHCR → GitOps → ArgoCD → gravity-dig-phaser.sytko.de', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#cbd5e1',
    });

    this.player = this.add.circle(480, 238, 18, 0x38bdf8).setStrokeStyle(4, 0xe0f2fe);
    this.tweens.add({
      targets: this.player,
      y: 224,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private drawStars(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['gravity-dig']);
    for (let i = 0; i < 96; i += 1) {
      const x = rng.integerInRange(0, GAME_WIDTH);
      const y = rng.integerInRange(0, 210);
      const radius = rng.realInRange(0.8, 2.2);
      const alpha = rng.realInRange(0.35, 0.95);
      this.add.circle(x, y, radius, 0xffffff, alpha);
    }
  }

  private drawPlanetSurface(): void {
    const ground = this.add.graphics();
    ground.fillStyle(0x3f2a1d, 1);
    ground.fillRect(0, 300, GAME_WIDTH, 240);
    ground.fillStyle(0x5b3a24, 1);
    ground.fillRect(0, 300, GAME_WIDTH, 28);

    for (let x = 0; x < GAME_WIDTH; x += 32) {
      const height = 8 + ((x / 32) % 3) * 5;
      ground.fillStyle(x % 64 === 0 ? 0x6b4429 : 0x4b301f, 1);
      ground.fillRect(x, 300 - height, 32, height);
    }
  }

  private drawDigPreview(): void {
    const colors = [0x7c4a2d, 0x6b4429, 0x57351f, 0x3f2a1d, 0x2b211b];
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        const x = 272 + col * 32;
        const y = 328 + row * 28;
        const color = colors[(row + col) % colors.length];
        this.add.rectangle(x, y, 30, 26, color).setStrokeStyle(1, 0x1f130c, 0.55);
      }
    }

    this.add.rectangle(480, 330, 72, 28, 0x111827, 0.8).setStrokeStyle(2, 0xfacc15);
    this.add.text(446, 321, 'DIG', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#fde68a',
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#050816',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: DemoScene,
});
