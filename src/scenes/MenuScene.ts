import Phaser from 'phaser';
import { loadMenuAssets } from '../assets/AssetLoader';

type MenuAction = 'start' | 'options' | 'credits' | 'quit';

interface MenuButton {
  action: MenuAction;
  image: Phaser.GameObjects.Image;
}

const MENU_ITEMS: MenuAction[] = ['start', 'options', 'credits', 'quit'];
const BACKGROUND_WIDTH = 1024;
const BACKGROUND_HEIGHT = 1024;
const MENU_X = 205;
const MENU_TOP = 608;
const MENU_BUTTON_SCALE = 0.205;
const MENU_BUTTON_GAP = 0.14;
const BACKGROUND_VERTICAL_OFFSET = -0.2;

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
    const sceneScale = width / this.background.width;
    const backgroundCenterY = height / 2 + height * BACKGROUND_VERTICAL_OFFSET;
    this.background.setPosition(width / 2, backgroundCenterY).setScale(sceneScale);

    const buttonScale = sceneScale * MENU_BUTTON_SCALE;
    const buttonHeight = this.textures.get('menu-button-inactive').getSourceImage().height * buttonScale;
    const gap = buttonHeight * MENU_BUTTON_GAP;
    const left = this.backgroundToScreenX(MENU_X, width, sceneScale);
    const top = this.backgroundToScreenY(MENU_TOP, backgroundCenterY, sceneScale);

    this.buttons.forEach((button, index) => {
      button.image
        .clearTint()
        .setTexture('menu-button-inactive')
        .setPosition(left, top + index * (buttonHeight + gap))
        .setScale(buttonScale);
    });
  }

  private backgroundToScreenX(x: number, screenWidth: number, scale: number): number {
    return screenWidth / 2 + (x - BACKGROUND_WIDTH / 2) * scale;
  }

  private backgroundToScreenY(y: number, backgroundCenterY: number, scale: number): number {
    return backgroundCenterY + (y - BACKGROUND_HEIGHT / 2) * scale;
  }

  private moveSelection(delta: number): void {
    this.setActiveIndex(Phaser.Math.Wrap(this.activeIndex + delta, 0, this.buttons.length));
  }

  private setActiveIndex(index: number): void {
    this.activeIndex = index;
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
