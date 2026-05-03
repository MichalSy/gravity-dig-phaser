import Phaser from 'phaser';
import { loadMenuAssets } from '../assets/AssetLoader';

type MenuAction = 'start' | 'options' | 'credits' | 'quit';

interface MenuButton {
  action: MenuAction;
  image: Phaser.GameObjects.Image;
}

const MENU_ITEMS: MenuAction[] = ['start', 'options', 'credits', 'quit'];

export class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private buttons: MenuButton[] = [];
  private activeIndex = 0;

  constructor() {
    super('menu');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#87d7ff');
    this.background = this.add.image(0, 0, 'title-screen').setOrigin(0.5).setDepth(0);

    this.buttons = MENU_ITEMS.map((action, index) => this.createMenuButton(action, index));

    this.input.keyboard?.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-W', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-S', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.activate(this.buttons[this.activeIndex].action));
    this.input.keyboard?.on('keydown-SPACE', () => this.activate(this.buttons[this.activeIndex].action));
    this.scale.on('resize', this.layout, this);
    this.refreshSelection();
    this.layout();
  }

  private createMenuButton(action: MenuAction, index: number): MenuButton {
    const image = this.add.image(0, 0, 'menu-button-inactive').setOrigin(0.5).setDepth(5);

    image.setInteractive({ useHandCursor: true });
    image.on('pointerover', () => this.setActiveIndex(index));
    image.on('pointerdown', () => this.activate(action));

    return { action, image };
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const cover = Math.max(width / this.background.width, height / this.background.height);
    this.background.setPosition(width / 2, height / 2).setScale(cover);

    const buttonScale = Phaser.Math.Clamp(width / 6400, 0.16, 0.24);
    const referenceHeight = this.textures.get('menu-button-active').getSourceImage().height * buttonScale;
    const gap = referenceHeight * 0.08;
    const left = Phaser.Math.Clamp(width * 0.215, 168, 288);
    const top = Phaser.Math.Clamp(height * 0.43, 260, 350);

    this.buttons.forEach((button, index) => {
      button.image
        .setPosition(left, top + index * (referenceHeight + gap))
        .setScale(buttonScale);
    });
  }

  private moveSelection(delta: number): void {
    const next = Phaser.Math.Wrap(this.activeIndex + delta, 0, this.buttons.length);
    this.setActiveIndex(next);
  }

  private setActiveIndex(index: number): void {
    if (this.activeIndex === index) return;
    this.activeIndex = index;
    this.refreshSelection();
    this.layout();
  }

  private refreshSelection(): void {
    this.buttons.forEach((button, index) => {
      button.image.clearTint();
      button.image.setTexture(index === this.activeIndex ? 'menu-button-active' : 'menu-button-inactive');
    });
  }

  private activate(action: MenuAction): void {
    if (action === 'start') {
      this.scene.start('game');
      return;
    }

    const button = this.buttons[this.activeIndex];
    button.image.setTint(action === 'quit' ? 0xffb4a2 : 0xfff1a8);
    this.time.delayedCall(450, () => button.image.clearTint());
  }
}
