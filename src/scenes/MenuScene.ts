import Phaser from 'phaser';
import { loadMenuAssets } from '../assets/AssetLoader';

const TITLE_STYLE = {
  fontFamily: 'Arial Black, Impact, sans-serif',
  fontSize: '76px',
  fontStyle: '900',
  color: '#e0f2fe',
  stroke: '#082f49',
  strokeThickness: 8,
  shadow: {
    offsetX: 0,
    offsetY: 8,
    color: '#020617',
    blur: 14,
    fill: true,
  },
} satisfies Phaser.Types.GameObjects.Text.TextStyle;

const BUTTON_STYLE = {
  fontFamily: 'Arial, sans-serif',
  fontSize: '26px',
  fontStyle: '900',
  color: '#ecfeff',
  stroke: '#083344',
  strokeThickness: 4,
} satisfies Phaser.Types.GameObjects.Text.TextStyle;

export class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Container;
  private startText!: Phaser.GameObjects.Text;
  private buttonFrame!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('menu');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#020617');
    this.background = this.add.image(0, 0, 'title-screen').setOrigin(0.5).setDepth(0);

    this.add.rectangle(0, 0, 10, 10, 0x020617, 0.28).setOrigin(0).setDepth(1);
    this.add.rectangle(0, 0, 10, 10, 0x020617, 0.62).setOrigin(0).setDepth(1);

    this.title = this.add.text(0, 0, 'GRAVITY DIG', TITLE_STYLE).setDepth(2).setOrigin(0, 0.5);
    this.subtitle = this.add
      .text(0, 0, 'Drill deep. Mine smart. Return alive.', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        fontStyle: '800',
        color: '#7dd3fc',
        letterSpacing: 1,
      })
      .setDepth(2)
      .setOrigin(0, 0.5);

    this.buttonFrame = this.add
      .rectangle(0, 0, 236, 64, 0x0f172a, 0.88)
      .setStrokeStyle(2, 0x22d3ee, 0.9)
      .setDepth(2);
    this.startText = this.add.text(0, 0, 'START', BUTTON_STYLE).setOrigin(0.5).setDepth(3);
    this.startButton = this.add.container(0, 0, [this.buttonFrame, this.startText]).setDepth(3);
    this.startButton.setSize(236, 64).setInteractive({ useHandCursor: true });
    this.startButton.on('pointerover', () => this.setButtonHover(true));
    this.startButton.on('pointerout', () => this.setButtonHover(false));
    this.startButton.on('pointerdown', () => this.startGame());

    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame());
    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cover = Math.max(width / this.background.width, height / this.background.height);
    this.background.setPosition(width / 2, height / 2).setScale(cover);

    const overlays = this.children.list.filter((child) => child instanceof Phaser.GameObjects.Rectangle) as Phaser.GameObjects.Rectangle[];
    overlays[0]?.setSize(width, height);
    overlays[1]?.setSize(Math.max(520, width * 0.48), height).setFillStyle(0x020617, 0.62);

    const left = Math.max(38, width * 0.075);
    const top = Math.max(82, height * 0.18);
    const titleScale = Phaser.Math.Clamp(width / 1280, 0.72, 1.08);
    this.title.setPosition(left, top).setScale(titleScale);
    this.subtitle.setPosition(left + 4 * titleScale, top + 72 * titleScale).setScale(titleScale);
    this.startButton.setPosition(left + 118 * titleScale, top + 158 * titleScale).setScale(titleScale);
  }

  private setButtonHover(active: boolean): void {
    this.buttonFrame.setFillStyle(active ? 0x155e75 : 0x0f172a, active ? 0.94 : 0.88);
    this.buttonFrame.setStrokeStyle(2, active ? 0x67e8f9 : 0x22d3ee, active ? 1 : 0.9);
    this.startText.setColor(active ? '#ffffff' : '#ecfeff');
  }

  private startGame(): void {
    this.scene.start('game');
  }
}
