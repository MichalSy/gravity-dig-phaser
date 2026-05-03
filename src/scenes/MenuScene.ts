import Phaser from 'phaser';
import { loadMenuAssets } from '../assets/AssetLoader';

const BUTTON_TEXT_STYLE = {
  fontFamily: 'Arial Black, Impact, sans-serif',
  fontSize: '27px',
  fontStyle: '900',
  color: '#5b2b13',
  stroke: '#fff3c4',
  strokeThickness: 3,
  shadow: {
    offsetX: 0,
    offsetY: 3,
    color: '#7c2d12',
    blur: 0,
    fill: true,
  },
} satisfies Phaser.Types.GameObjects.Text.TextStyle;

export class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private startButton!: Phaser.GameObjects.Container;
  private buttonImage!: Phaser.GameObjects.Image;
  private startText!: Phaser.GameObjects.Text;

  constructor() {
    super('menu');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#87d7ff');
    this.background = this.add.image(0, 0, 'title-screen').setOrigin(0.5).setDepth(0);

    this.buttonImage = this.add.image(0, 0, 'menu-button-long').setOrigin(0.5).setDepth(1);
    this.startText = this.add.text(0, -3, 'ABENTEUER STARTEN', BUTTON_TEXT_STYLE).setOrigin(0.5).setDepth(2);
    this.startButton = this.add.container(0, 0, [this.buttonImage, this.startText]).setDepth(5);
    this.buttonImage.setInteractive({ useHandCursor: true });
    this.buttonImage.on('pointerover', () => this.setButtonHover(true));
    this.buttonImage.on('pointerout', () => this.setButtonHover(false));
    this.buttonImage.on('pointerdown', () => this.startGame());

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

    const buttonScale = Phaser.Math.Clamp(width / 2048, 0.42, 0.64);
    const buttonWidth = this.buttonImage.width * buttonScale;
    const buttonHeight = this.buttonImage.height * buttonScale;
    this.startButton
      .setPosition(width * 0.5, height - buttonHeight * 0.88)
      .setSize(buttonWidth, buttonHeight)
      .setScale(buttonScale);
    this.startText.setScale(1 / buttonScale);
  }

  private setButtonHover(active: boolean): void {
    this.buttonImage.setTint(active ? 0xfff1a8 : 0xffffff);
    this.startText.setColor(active ? '#3f1d0b' : '#5b2b13');
  }

  private startGame(): void {
    this.scene.start('game');
  }
}
