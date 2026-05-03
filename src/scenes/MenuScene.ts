import Phaser from 'phaser';
import { loadMenuAssets } from '../assets/AssetLoader';

type MenuAction = 'start' | 'options';

interface MenuItem {
  action: MenuAction;
  label: string;
  enabled: boolean;
}

interface MenuButton {
  item: MenuItem;
  image: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

const MENU_ITEMS: MenuItem[] = [
  { action: 'start', label: 'SPIELEN', enabled: true },
  { action: 'options', label: 'OPTIONEN', enabled: true },
];
const BACKGROUND_WIDTH = 2048;
const BACKGROUND_HEIGHT = 1152;
const MENU_X = 442;
const MENU_TOP = 576;
const MENU_BUTTON_SCALE = 0.205;
const MENU_BUTTON_WIDTH_SCALE = 1.2;
const MENU_BUTTON_GAP = 0.14;
const SELECTOR_WIDTH = 28;
const SELECTOR_HEIGHT = 34;
const SELECTOR_GAP = 14;
const SELECTOR_SCALE = 0.7;
const LABEL_FONT_SIZE = 27;
const VERSION_FONT_SIZE = 16;

export class MenuScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private selector!: Phaser.GameObjects.Triangle;
  private versionLabel!: Phaser.GameObjects.Text;
  private buttons: MenuButton[] = [];
  private activeIndex = 0;

  constructor() {
    super('menu');
  }

  preload(): void {
    loadMenuAssets(this);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#000000');
    this.background = this.add.image(0, 0, 'title-screen').setOrigin(0.5).setDepth(0);
    this.selector = this.add
      .triangle(0, 0, 0, 0, SELECTOR_WIDTH, SELECTOR_HEIGHT / 2, 0, SELECTOR_HEIGHT, 0xf2c94c)
      .setOrigin(0.5)
      .setDepth(6)
      .setStrokeStyle(4, 0x4d260f);
    this.versionLabel = this.add
      .text(0, 0, `v${__APP_VERSION__}`, {
        fontFamily: 'Silkscreen',
        fontSize: `${VERSION_FONT_SIZE}px`,
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 1)
      .setDepth(8)
      .setAlpha(0.82)
      .setResolution(2);

    this.buttons = MENU_ITEMS.map((item, index) => this.createMenuButton(item, index));

    this.input.keyboard?.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-W', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-S', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.activate(this.buttons[this.activeIndex].item));
    this.input.keyboard?.on('keydown-SPACE', () => this.activate(this.buttons[this.activeIndex].item));
    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  private createMenuButton(item: MenuItem, index: number): MenuButton {
    const image = this.add.image(0, 0, 'menu-button-inactive').setOrigin(0.5).setDepth(5);
    const label = this.add
      .text(0, 0, item.label, {
        fontFamily: 'Silkscreen',
        fontSize: `${LABEL_FONT_SIZE}px`,
        fontStyle: '700',
        color: '#fff4c7',
        stroke: '#4d260f',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(7)
      .setResolution(2);

    if (item.enabled) {
      image.setInteractive({ useHandCursor: true });
      image.on('pointerover', () => this.setActiveIndex(index));
      image.on('pointerdown', () => this.activate(item));
      label.setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.setActiveIndex(index));
      label.on('pointerdown', () => this.activate(item));
    }

    return { item, image, label };
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const sceneScale = width / this.background.width;
    this.background.setPosition(width / 2, height / 2).setScale(sceneScale);

    const buttonScale = sceneScale * MENU_BUTTON_SCALE;
    const buttonTexture = this.textures.get('menu-button-inactive').getSourceImage();
    const buttonWidth = buttonTexture.width * buttonScale * MENU_BUTTON_WIDTH_SCALE;
    const buttonHeight = buttonTexture.height * buttonScale;
    const gap = buttonHeight * MENU_BUTTON_GAP;
    const left = this.backgroundToScreenX(MENU_X, width, sceneScale);
    const top = this.backgroundToScreenY(MENU_TOP, height, sceneScale);

    this.buttons.forEach((button, index) => {
      const y = top + index * (buttonHeight + gap);
      const fontSize = Math.max(14, LABEL_FONT_SIZE * sceneScale);
      const alpha = button.item.enabled ? 1 : 0.45;

      button.image
        .clearTint()
        .setTexture(index === this.activeIndex && button.item.enabled ? 'menu-button-active' : 'menu-button-inactive')
        .setPosition(left, y)
        .setScale(buttonScale * MENU_BUTTON_WIDTH_SCALE, buttonScale)
        .setAlpha(alpha);
      button.label
        .setPosition(left, y - 1 * sceneScale)
        .setFontSize(fontSize)
        .setAlpha(alpha);
    });

    this.versionLabel
      .setPosition(width - 18 * sceneScale, height - 14 * sceneScale)
      .setFontSize(Math.max(10, VERSION_FONT_SIZE * sceneScale));

    const activeY = top + this.activeIndex * (buttonHeight + gap);
    const selectorScale = sceneScale * SELECTOR_SCALE;
    this.selector
      .setPosition(
        left - buttonWidth / 2 - SELECTOR_GAP * sceneScale - (SELECTOR_WIDTH * selectorScale) / 2,
        activeY,
      )
      .setScale(selectorScale);
  }

  private backgroundToScreenX(x: number, screenWidth: number, scale: number): number {
    return screenWidth / 2 + (x - BACKGROUND_WIDTH / 2) * scale;
  }

  private backgroundToScreenY(y: number, screenHeight: number, scale: number): number {
    return screenHeight / 2 + (y - BACKGROUND_HEIGHT / 2) * scale;
  }

  private moveSelection(delta: number): void {
    const enabledIndexes = this.buttons.flatMap((button, index) => (button.item.enabled ? [index] : []));
    const enabledPosition = enabledIndexes.indexOf(this.activeIndex);
    const nextPosition = Phaser.Math.Wrap(enabledPosition + delta, 0, enabledIndexes.length);
    this.setActiveIndex(enabledIndexes[nextPosition]);
  }

  private setActiveIndex(index: number): void {
    if (!this.buttons[index]?.item.enabled) {
      return;
    }

    this.activeIndex = index;
    this.layout();
  }

  private activate(item: MenuItem): void {
    if (!item.enabled) {
      return;
    }

    if (item.action === 'start') {
      this.scene.start('game');
      return;
    }

    const button = this.buttons[this.activeIndex];
    button.image.setTint(0xfff1a8);
    this.time.delayedCall(300, () => button.image.clearTint());
  }
}
