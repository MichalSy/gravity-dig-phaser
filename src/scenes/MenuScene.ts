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

type MenuAction = 'start' | 'options' | 'credits' | 'quit';

interface MenuButton {
  action: MenuAction;
  container: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
}

const MENU_ITEMS: { label: string; action: MenuAction }[] = [
  { label: 'STARTEN', action: 'start' },
  { label: 'OPTIONEN', action: 'options' },
  { label: 'CREDITS', action: 'credits' },
  { label: 'BEENDEN', action: 'quit' },
];

export class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private buttons: MenuButton[] = [];

  constructor() {
    super('menu');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#87d7ff');
    this.background = this.add.image(0, 0, 'title-screen').setOrigin(0.5).setDepth(0);

    this.buttons = MENU_ITEMS.map((item) => this.createMenuButton(item.label, item.action));

    this.input.keyboard?.on('keydown-ENTER', () => this.activate('start'));
    this.input.keyboard?.on('keydown-SPACE', () => this.activate('start'));
    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  private createMenuButton(label: string, action: MenuAction): MenuButton {
    const image = this.add.image(0, 0, 'menu-button-long').setOrigin(0.5).setDepth(1);
    const text = this.add.text(0, -3, label, BUTTON_TEXT_STYLE).setOrigin(0.5).setDepth(2);
    const container = this.add.container(0, 0, [image, text]).setDepth(5);

    image.setInteractive({ useHandCursor: true });
    image.on('pointerover', () => this.setButtonHover(image, text, true));
    image.on('pointerout', () => this.setButtonHover(image, text, false));
    image.on('pointerdown', () => this.activate(action));

    return { action, container, image, text };
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cover = Math.max(width / this.background.width, height / this.background.height);
    this.background.setPosition(width / 2, height / 2).setScale(cover);

    const buttonScale = Phaser.Math.Clamp(width / 6400, 0.16, 0.24);
    const buttonHeight = this.buttons[0]?.image.height * buttonScale || 0;
    const gap = buttonHeight * 0.08;
    const left = Phaser.Math.Clamp(width * 0.215, 168, 288);
    const top = Phaser.Math.Clamp(height * 0.43, 260, 350);

    this.buttons.forEach((button, index) => {
      button.container
        .setPosition(left, top + index * (buttonHeight + gap))
        .setScale(buttonScale);
      button.text.setScale(1 / buttonScale);
    });
  }

  private setButtonHover(image: Phaser.GameObjects.Image, text: Phaser.GameObjects.Text, active: boolean): void {
    image.setTint(active ? 0xfff1a8 : 0xffffff);
    text.setColor(active ? '#3f1d0b' : '#5b2b13');
  }

  private activate(action: MenuAction): void {
    if (action === 'start') {
      this.scene.start('game');
      return;
    }

    const button = this.buttons.find((entry) => entry.action === action);
    button?.text.setText(action === 'quit' ? 'NICHT IM WEB' : 'BALD');
    this.time.delayedCall(900, () => {
      const item = MENU_ITEMS.find((entry) => entry.action === action);
      if (item) button?.text.setText(item.label);
    });
  }
}
